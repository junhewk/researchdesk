import { nanoid } from "nanoid";
import { getDb } from "./db";
import { publish } from "./events";
import { persistAgentEvent } from "./persist";
import {
  createAgentProcess,
  providerSupportsWorkflow,
  type AgentProcess,
  type StartOptions,
} from "./agentProcess";
import {
  buildSystemPrompt,
  getRevisionTools,
  getReviewTools,
  getManuscriptTools,
  getMethodsTools,
} from "./tools";
import {
  getManuscript,
  gitCleanTree,
  listProjectFiles,
  normalizeProjectProtectionMode,
  syncPrimaryFileToContentMd,
} from "./manuscripts";
import { listCommentaries } from "./commentaries";
import { listAssets } from "./manuscriptAssets";
import { snapshotProjectFolder } from "./projectSnapshot";
import { nowUnix } from "@/lib/utils";
import type {
  AgentEffort,
  Provider,
  Workflow,
  Session,
  SessionMode,
  SessionStatus,
  AgentEvent,
} from "./types";

const IDLE_TIMEOUT_MS = Number(process.env.IDLE_TIMEOUT_MS || 1800000);

interface Slot {
  proc: AgentProcess;
  session: Session;
  turnSeq: number;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

const GLOBAL_KEY = "__REVIEWER_AGENT_SUP__" as const;
const g = globalThis as unknown as Record<string, Supervisor | undefined>;

export function getSupervisor(): Supervisor {
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new Supervisor();
  }
  return g[GLOBAL_KEY]!;
}

class Supervisor {
  private slots = new Map<string, Slot>();

  async createSession(opts: {
    manuscriptId: string | null;
    protocolId?: string | null;
    workflow: Workflow;
    provider: Provider;
    model?: string | null;
    effort?: AgentEffort | null;
    mode?: SessionMode | string | null;
  }): Promise<Session> {
    if (!providerSupportsWorkflow(opts.provider, opts.workflow)) {
      throw new Error(
        `provider ${opts.provider} does not support the ${opts.workflow} workflow`,
      );
    }
    const db = getDb();
    const id = nanoid();
    const now = nowUnix();

    const session: Session = {
      id,
      manuscript_id: opts.manuscriptId,
      protocol_id: opts.protocolId ?? null,
      study_id: null,
      workflow: opts.workflow,
      mode: opts.mode ?? null,
      provider: opts.provider,
      model: opts.model?.trim() || null,
      effort: opts.effort ?? null,
      provider_session_id: null,
      status: "new",
      created_at: now,
      updated_at: now,
    };

    db.prepare(
      `INSERT INTO sessions (id, manuscript_id, protocol_id, workflow, mode, provider, model, effort, provider_session_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      session.id,
      session.manuscript_id,
      session.protocol_id,
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
    const db = getDb();
    return db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as Session | undefined;
  }

  private updateSessionStatus(id: string, status: SessionStatus, providerSessionId?: string): void {
    const db = getDb();
    const now = nowUnix();
    if (providerSessionId !== undefined) {
      db.prepare("UPDATE sessions SET status = ?, provider_session_id = ?, updated_at = ? WHERE id = ?")
        .run(status, providerSessionId, now, id);
    } else {
      db.prepare("UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?")
        .run(status, now, id);
    }

    publish({
      session_id: id,
      kind: "status_change",
      payload: { status },
      timestamp: now,
    });
  }

  async startSession(
    sessionId: string,
    opts?: { apiBaseUrl?: string; allowDirtyTree?: boolean; initialMessage?: string },
  ): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) throw new Error("session not found");

    try {
      // The methods workflow may target a protocol instead of (or alongside)
      // a manuscript. We branch first to load the correct subject; the rest
      // of the function still operates on a (possibly null) manuscript for
      // back-compatibility with the existing prompt/context plumbing.
      if (session.workflow === "methods") {
        await this.startMethodsSession(session, opts);
        return;
      }

      if (!session.manuscript_id) throw new Error("no manuscript linked");

      normalizeProjectProtectionMode(session.manuscript_id);
      const manuscript = getManuscript(session.manuscript_id);
      if (!manuscript) throw new Error("manuscript not found");

      // Revision and the unified 'manuscript' workflow both prefer the user's
      // project folder. Sync primary→content_md so any code path still reading
      // the DB sees current text. Then either verify a clean git tree or
      // snapshot the folder for revert.
      let cwd: string | undefined;
      const needsFolder =
        (session.workflow === "revision" || session.workflow === "manuscript") &&
        manuscript.project_root;
      if (needsFolder) {
        syncPrimaryFileToContentMd(manuscript.id);
        cwd = manuscript.project_root ?? undefined;
        if (manuscript.is_git) {
          if (!opts?.allowDirtyTree && !gitCleanTree(manuscript.project_root!)) {
            throw new Error(
              "project folder has uncommitted changes in the linked folder — commit or stash those files first",
            );
          }
        } else {
          snapshotProjectFolder(sessionId, manuscript.project_root!);
        }
      }

      // Re-read after sync so manuscript.content_md reflects on-disk text.
      const fresh = getManuscript(manuscript.id) ?? manuscript;

      const commentaries = listCommentaries(fresh.id);
      const commentariesText = commentaries
        .map((c) => `[${c.reviewer_label || "Reviewer"}] (Round ${c.round}, ${c.source ?? "uploaded"}):\n${c.content_md}`)
        .join("\n\n---\n\n");

      const attachedCommentaries = commentaries.map((c) => ({
        id: c.id,
        round: c.round,
        reviewer_label: c.reviewer_label,
        source: c.source,
        byte_size: Buffer.byteLength(c.content_md, "utf8"),
      }));

      const assets = listAssets(fresh.id);
      const attachedAssets = assets.map((a) => ({
        id: a.id,
        kind: a.kind,
        label: a.label,
        original_file: a.original_file,
        byte_size: a.byte_size,
      }));

      const projectFiles = fresh.project_root
        ? listProjectFiles(fresh.id).map((f) => f.relative_path)
        : undefined;

      const systemPrompt = buildSystemPrompt(session.workflow, {
        manuscriptId: fresh.id,
        manuscriptTitle: fresh.title,
        manuscriptContent: fresh.content_md,
        commentaries: commentariesText || undefined,
        attachedAssets,
        attachedCommentaries,
        journalType: fresh.journal_type ?? undefined,
        researchDomain: fresh.research_domain ?? undefined,
        researchType: fresh.research_type ?? undefined,
        reviewRequest: fresh.review_request ?? undefined,
        projectRoot: fresh.project_root ?? undefined,
        primaryFile: fresh.primary_file ?? undefined,
        projectFiles,
      }, {
        apiBaseUrl: opts?.apiBaseUrl,
        runtime: "sdk",
      });

      const tools =
        session.workflow === "manuscript"
          ? getManuscriptTools()
          : session.workflow === "revision"
            ? getRevisionTools()
            : getReviewTools();

      const proc = await createAgentProcess(session.provider, sessionId);
      const slot: Slot = {
        proc,
        session,
        turnSeq: 0,
        idleTimer: null,
      };
      this.slots.set(sessionId, slot);

      proc.on("event", (ev) => this.onEvent(sessionId, slot, ev));
      proc.on("stderr", (line) => {
        publish({ session_id: sessionId, kind: "error", payload: { stderr: line }, timestamp: nowUnix() });
      });
      proc.on("exit", (info) => {
        this.updateSessionStatus(sessionId, "crashed");
        this.clearIdleTimer(slot);
        this.slots.delete(sessionId);
        publish({ session_id: sessionId, kind: "process_exit", payload: info, timestamp: nowUnix() });
      });
      proc.on("error", (err) => {
        this.updateSessionStatus(sessionId, "crashed");
        this.clearIdleTimer(slot);
        this.slots.delete(sessionId);
        publish({ session_id: sessionId, kind: "error", payload: { message: err.message }, timestamp: nowUnix() });
      });

      this.updateSessionStatus(sessionId, "running");
      publish({ session_id: sessionId, kind: "process_start", payload: {}, timestamp: nowUnix() });

      const initialMessage = opts?.initialMessage?.trim() || undefined;
      const startOpts: StartOptions = {
        workflow: session.workflow,
        manuscriptId: fresh.id,
        systemPrompt,
        tools,
        resumeSessionId: session.provider_session_id,
        model: session.model,
        effort: session.effort,
        cwd,
        initialMessage,
      };

      proc.start(startOpts);
    } catch (err) {
      this.updateSessionStatus(sessionId, "crashed");
      this.slots.delete(sessionId);
      publish({
        session_id: sessionId,
        kind: "error",
        payload: { message: err instanceof Error ? err.message : "could not start session" },
        timestamp: nowUnix(),
      });
      throw err;
    }
  }

  private async onEvent(sessionId: string, slot: Slot, ev: AgentEvent): Promise<void> {
    if (ev.type === "system" && (ev as { subtype?: string }).subtype === "init") {
      const providerSessionId = (ev as { session_id?: string }).session_id;
      if (providerSessionId) {
        this.updateSessionStatus(sessionId, "running", providerSessionId);
      }
    }

    if (ev.type === "result") {
      slot.turnSeq++;
      this.updateSessionStatus(sessionId, "idle");
      this.resetIdleTimer(slot, sessionId);
    }

    if (ev.type === "control_request") {
      const req = ev as { request_id?: string; request?: { subtype?: string } };
      if (req.request?.subtype === "can_use_tool" && req.request_id) {
        slot.proc.writeControlResponse(req.request_id, { behavior: "allow" });
      }
    }

    persistAgentEvent(sessionId, ev, slot.turnSeq);

    publish({
      session_id: sessionId,
      kind: "agent_event",
      payload: ev,
      timestamp: nowUnix(),
    });
  }

  async sendMessage(sessionId: string, content: string, opts?: { apiBaseUrl?: string }): Promise<void> {
    const slot = this.slots.get(sessionId);
    if (!slot) {
      await this.startSession(sessionId, opts);
      const newSlot = this.slots.get(sessionId);
      if (!newSlot) throw new Error("failed to start session");
      setTimeout(() => newSlot.proc.writeUserMessage(content), 500);
      return;
    }

    this.clearIdleTimer(slot);
    this.updateSessionStatus(sessionId, "running");
    slot.proc.writeUserMessage(content);
  }

  async interruptSession(sessionId: string): Promise<void> {
    const slot = this.slots.get(sessionId);
    if (!slot) return;
    await slot.proc.interrupt();
    this.updateSessionStatus(sessionId, "idle");
  }

  async shutdownSession(sessionId: string): Promise<void> {
    const slot = this.slots.get(sessionId);
    if (!slot) return;
    this.clearIdleTimer(slot);
    await slot.proc.shutdown();
    this.updateSessionStatus(sessionId, "completed");
    this.slots.delete(sessionId);
  }

  private async startMethodsSession(
    session: Session,
    opts?: { apiBaseUrl?: string; initialMessage?: string },
  ): Promise<void> {
    const sessionId = session.id;
    const manuscript = session.manuscript_id
      ? getManuscript(session.manuscript_id)
      : undefined;

    if (!manuscript) {
      throw new Error("methods session has no manuscript linked");
    }

    // Sync the primary file → content_md so the system prompt reflects on-disk
    // state when the manuscript is folder-linked.
    let cwd: string | undefined;
    let projectFiles: string[] | undefined;
    if (manuscript.project_root) {
      syncPrimaryFileToContentMd(manuscript.id);
      cwd = manuscript.project_root;
      projectFiles = listProjectFiles(manuscript.id).map((f) => f.relative_path);
    }

    const freshManuscript = getManuscript(manuscript.id) ?? manuscript;

    const systemPrompt = buildSystemPrompt(
      "methods",
      {
        manuscriptId: freshManuscript.id,
        manuscriptTitle: freshManuscript.title,
        manuscriptContent: freshManuscript.content_md,
        projectFiles,
        methods: {
          mode: session.mode,
          manuscript: freshManuscript,
        },
      },
      {
        apiBaseUrl: opts?.apiBaseUrl,
        runtime: "sdk",
      },
    );

    const tools = getMethodsTools(session.mode);

    const proc = await createAgentProcess(session.provider, sessionId);
    const slot: Slot = { proc, session, turnSeq: 0, idleTimer: null };
    this.slots.set(sessionId, slot);

    proc.on("event", (ev) => this.onEvent(sessionId, slot, ev));
    proc.on("stderr", (line) => {
      publish({
        session_id: sessionId,
        kind: "error",
        payload: { stderr: line },
        timestamp: nowUnix(),
      });
    });
    proc.on("exit", (info) => {
      this.updateSessionStatus(sessionId, "crashed");
      this.clearIdleTimer(slot);
      this.slots.delete(sessionId);
      publish({
        session_id: sessionId,
        kind: "process_exit",
        payload: info,
        timestamp: nowUnix(),
      });
    });
    proc.on("error", (err) => {
      this.updateSessionStatus(sessionId, "crashed");
      this.clearIdleTimer(slot);
      this.slots.delete(sessionId);
      publish({
        session_id: sessionId,
        kind: "error",
        payload: { message: err.message },
        timestamp: nowUnix(),
      });
    });

    this.updateSessionStatus(sessionId, "running");
    publish({
      session_id: sessionId,
      kind: "process_start",
      payload: {},
      timestamp: nowUnix(),
    });

    const initialMessage = opts?.initialMessage?.trim() || undefined;
    const startOpts: StartOptions = {
      workflow: session.workflow,
      manuscriptId: freshManuscript.id,
      systemPrompt,
      tools,
      resumeSessionId: session.provider_session_id,
      model: session.model,
      effort: session.effort,
      cwd,
      initialMessage,
    };

    proc.start(startOpts);
  }

  private resetIdleTimer(slot: Slot, sessionId: string): void {
    this.clearIdleTimer(slot);
    slot.idleTimer = setTimeout(() => {
      this.shutdownSession(sessionId);
    }, IDLE_TIMEOUT_MS);
    slot.idleTimer.unref();
  }

  private clearIdleTimer(slot: Slot): void {
    if (slot.idleTimer) {
      clearTimeout(slot.idleTimer);
      slot.idleTimer = null;
    }
  }
}
