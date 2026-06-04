import { nanoid } from "nanoid";
import { getDb } from "../db";
import { publish } from "../events";
import { persistAgentEvent } from "../persist";
import {
  createAgentProcess,
  type AgentProcess,
} from "../agentProcess";
import { nowUnix } from "@/lib/utils";
import { getStudy, listDecisions, getSnapshot } from "../studies";
import { buildStudyPrompt, type StudyPass } from "./studyPrompts";
import { isLocalApiProvider } from "../apiAgent/providers";
import type {
  AgentEffort,
  AgentEvent,
  Provider,
  Session,
  SessionStatus,
} from "../types";

// Forked methods session launcher. Owns study-session lifecycle (creation,
// the local_only confidentiality guard, start, transcript persistence) so the
// methods stack can evolve independently of the manuscript Supervisor. The
// low-level process spawn (createAgentProcess) and the SSE event bus (publish)
// are intentionally reused — forking subprocess management buys no design
// freedom. Study passes use the HTTP curl-callback pattern (no filesystem),
// so unlike the document-centric methods modes they do not need a project
// folder and can run on the local provider.

const IDLE_TIMEOUT_MS = Number(process.env.IDLE_TIMEOUT_MS || 1800000);

interface Slot {
  proc: AgentProcess;
  session: Session;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

const GLOBAL_KEY = "__REVIEWER_STUDY_SUP__" as const;
const g = globalThis as unknown as Record<string, StudySupervisor | undefined>;

export function getStudySupervisor(): StudySupervisor {
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new StudySupervisor();
  return g[GLOBAL_KEY]!;
}

class StudySupervisor {
  private slots = new Map<string, Slot>();

  createSession(opts: {
    studyId: string;
    pass: StudyPass;
    provider: Provider;
    model?: string | null;
    effort?: AgentEffort | null;
  }): Session {
    const study = getStudy(opts.studyId);
    if (!study) throw new Error("study not found");

    // Confidentiality guard: local_only studies may only use local backends.
    if (study.confidentiality_mode === "local_only" && !isLocalApiProvider(opts.provider)) {
      throw new Error(
        `study ${opts.studyId} is local_only — use ollama, lmstudio, or llama_server`,
      );
    }

    const db = getDb();
    const id = nanoid();
    const now = nowUnix();
    const session: Session = {
      id,
      manuscript_id: null,
      protocol_id: null,
      study_id: opts.studyId,
      workflow: "methods",
      mode: opts.pass,
      provider: opts.provider,
      model: opts.model?.trim() || null,
      effort: opts.effort ?? null,
      provider_session_id: null,
      status: "new",
      created_at: now,
      updated_at: now,
    };
    db.prepare(
      `INSERT INTO sessions
         (id, manuscript_id, protocol_id, study_id, workflow, mode, provider,
          model, effort, provider_session_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      session.id,
      session.manuscript_id,
      session.protocol_id,
      session.study_id,
      session.workflow,
      session.mode,
      session.provider,
      session.model,
      session.effort,
      session.provider_session_id,
      session.status,
      session.created_at,
      session.updated_at,
    );
    return session;
  }

  getSession(id: string): Session | undefined {
    return getDb()
      .prepare("SELECT * FROM sessions WHERE id = ?")
      .get(id) as Session | undefined;
  }

  private setStatus(
    id: string,
    status: SessionStatus,
    providerSessionId?: string,
  ): void {
    const db = getDb();
    const now = nowUnix();
    if (providerSessionId !== undefined) {
      db.prepare(
        "UPDATE sessions SET status = ?, provider_session_id = ?, updated_at = ? WHERE id = ?",
      ).run(status, providerSessionId, now, id);
    } else {
      db.prepare("UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?").run(
        status,
        now,
        id,
      );
    }
    publish({ session_id: id, kind: "status_change", payload: { status }, timestamp: now });
  }

  async startPass(
    sessionId: string,
    opts?: { apiBaseUrl?: string; targetCardType?: string; snapshotId?: string },
  ): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session || !session.study_id) throw new Error("study session not found");
    const study = getStudy(session.study_id);
    if (!study) throw new Error("study not found");

    const snapshot = opts?.snapshotId ? getSnapshot(opts.snapshotId) : undefined;
    const systemPrompt = buildStudyPrompt(session.mode as StudyPass, {
      study,
      decisions: listDecisions(study.id),
      targetCardType: opts?.targetCardType,
      snapshot,
      apiBaseUrl: opts?.apiBaseUrl,
    });

    try {
      const proc = await createAgentProcess(session.provider, sessionId);
      const slot: Slot = { proc, session, idleTimer: null };
      this.slots.set(sessionId, slot);

      proc.on("event", (ev) => this.onEvent(sessionId, slot, ev));
      proc.on("stderr", (line) =>
        publish({ session_id: sessionId, kind: "error", payload: { stderr: line }, timestamp: nowUnix() }),
      );
      proc.on("exit", (info) => {
        this.setStatus(sessionId, "crashed");
        this.clearIdle(slot);
        this.slots.delete(sessionId);
        publish({ session_id: sessionId, kind: "process_exit", payload: info, timestamp: nowUnix() });
      });
      proc.on("error", (err) => {
        this.setStatus(sessionId, "crashed");
        this.clearIdle(slot);
        this.slots.delete(sessionId);
        publish({ session_id: sessionId, kind: "error", payload: { message: err.message }, timestamp: nowUnix() });
      });

      this.setStatus(sessionId, "running");
      publish({ session_id: sessionId, kind: "process_start", payload: {}, timestamp: nowUnix() });

      proc.start({
        workflow: "methods",
        manuscriptId: study.id,
        systemPrompt,
        tools: [],
        resumeSessionId: session.provider_session_id,
        model: session.model,
        effort: session.effort,
        initialMessage: "Begin.",
      });
    } catch (err) {
      this.setStatus(sessionId, "crashed");
      this.slots.delete(sessionId);
      publish({
        session_id: sessionId,
        kind: "error",
        payload: { message: err instanceof Error ? err.message : "could not start pass" },
        timestamp: nowUnix(),
      });
      throw err;
    }
  }

  /** Send a follow-up message to a live study session (e.g. the user replying
   * to a card-proposal). The session process stays alive between turns. */
  sendMessage(sessionId: string, content: string): void {
    const slot = this.slots.get(sessionId);
    if (!slot) {
      throw new Error(
        "this session has ended — start a new proposal from the card",
      );
    }
    this.clearIdle(slot);
    this.setStatus(sessionId, "running");
    slot.proc.writeUserMessage(content);
  }

  private onEvent(sessionId: string, slot: Slot, ev: AgentEvent): void {
    // Auto-approve tool-permission requests for API providers that surface
    // permission events through the shared process contract.
    if (ev.type === "control_request") {
      const req = ev as { request_id?: string; request?: { subtype?: string } };
      if (req.request?.subtype === "can_use_tool" && req.request_id) {
        slot.proc.writeControlResponse(req.request_id, { behavior: "allow" });
      }
    }

    try {
      persistAgentEvent(sessionId, ev, 0);
    } catch {
      /* transcript persistence is best-effort */
    }
    publish({ session_id: sessionId, kind: "agent_event", payload: ev, timestamp: nowUnix() });

    if (ev.type === "system" && (ev as { subtype?: string }).subtype === "init") {
      const pid = (ev as { session_id?: string }).session_id;
      if (pid) this.setStatus(sessionId, "running", pid);
    }
    if (ev.type === "result") {
      this.setStatus(sessionId, "idle");
      this.resetIdle(slot, sessionId);
    }
  }

  private clearIdle(slot: Slot): void {
    if (slot.idleTimer) {
      clearTimeout(slot.idleTimer);
      slot.idleTimer = null;
    }
  }

  private resetIdle(slot: Slot, sessionId: string): void {
    this.clearIdle(slot);
    slot.idleTimer = setTimeout(() => {
      slot.proc.shutdown().catch(() => {});
      this.slots.delete(sessionId);
      this.setStatus(sessionId, "completed");
    }, IDLE_TIMEOUT_MS);
  }
}
