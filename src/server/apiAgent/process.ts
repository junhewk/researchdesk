import { EventEmitter } from "node:events";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentProcess, AgentProcessEvents, StartOptions } from "@/server/agentProcess";
import type { AgentEvent, Provider } from "@/server/types";
import {
  runCardProposalAgent,
  runEvidenceExtractionAgent,
  runPreflightRiskAgent,
  runReviewAgent,
} from "./workflows";
import {
  createApiChatModel,
  type ApiChatModel,
  type ApiProvider,
} from "./providers";
import { classifyAgentError } from "@/server/providerHealth";

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part;
      if (
        part &&
        typeof part === "object" &&
        "text" in part &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        return (part as { text: string }).text;
      }
      return JSON.stringify(part);
    }).join("\n");
  }
  return content == null ? "" : JSON.stringify(content);
}

function slashCommandOf(content: string): string | null {
  const match = content.trim().match(/^\/([a-z-]+)/i);
  return match ? match[1].toLowerCase() : null;
}

export class ApiAgentProcess extends EventEmitter implements AgentProcess {
  private sessionId: string | null = null;
  private opts: StartOptions | null = null;
  private closed = false;
  private running = false;
  private messages: unknown[] = [];
  private model: ApiChatModel | null = null;

  constructor(
    public readonly id: string,
    private readonly provider: ApiProvider,
  ) {
    super();
  }

  override on<K extends keyof AgentProcessEvents>(event: K, listener: AgentProcessEvents[K]): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  private emitTyped<K extends keyof AgentProcessEvents>(
    event: K,
    ...args: Parameters<AgentProcessEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  private emitAgentEvent(event: AgentEvent): void {
    this.emitTyped("event", event);
  }

  get currentSessionId(): string | null {
    return this.sessionId;
  }

  get isAlive(): boolean {
    return !this.closed;
  }

  start(opts: StartOptions): void {
    this.opts = opts;
    this.sessionId = opts.resumeSessionId ?? this.id;
    this.closed = false;
    this.messages = [
      new SystemMessage([
        opts.systemPrompt,
        "",
        "You are running inside the desktop API-agent runtime.",
        "You can answer manuscript-thread questions directly.",
        "For /review, the runtime persists structured review findings through the app workflow.",
        "For /revise, /version, and /finalize, draft concrete proposed text or a revision plan unless an app endpoint handles persistence.",
        "Do not claim that a file was edited or a manuscript version was saved unless the runtime explicitly reports that persistence happened.",
      ].join("\n")),
    ];
    this.model = null;
    this.emitAgentEvent({
      type: "system",
      subtype: "init",
      session_id: this.sessionId,
      provider: this.provider as Provider,
    });
    if (opts.initialMessage?.trim()) {
      this.writeUserMessage(opts.initialMessage);
    }
  }

  writeUserMessage(content: string): void {
    if (!this.opts || this.running) return;
    void this.runTurn(this.opts, content);
  }

  writeToolResult(): void {
    // API-agent tools run inside the structured workflow.
  }

  writeControlResponse(): void {
    // No external permission prompts in the desktop API agent.
  }

  async interrupt(): Promise<void> {
    this.running = false;
  }

  async shutdown(): Promise<void> {
    this.closed = true;
    this.running = false;
  }

  private async getModel(opts: StartOptions): Promise<ApiChatModel> {
    if (!this.model) {
      this.model = await createApiChatModel({
        provider: this.provider,
        model: opts.model,
        timeoutMs: Number(process.env.API_AGENT_TIMEOUT_MS || 180_000),
      });
    }
    return this.model;
  }

  private async runReviewTurn(
    opts: StartOptions,
  ): Promise<string> {
    const result = await runReviewAgent({
      manuscriptId: opts.manuscriptId,
      config: {
        provider: this.provider,
        model: opts.model,
        timeoutMs: Number(process.env.API_AGENT_TIMEOUT_MS || 180_000),
      },
    });
    return `${result.summary_md}\n\nCreated ${result.created} review item(s).`;
  }

  private async runChatTurn(
    opts: StartOptions,
    content: string,
  ): Promise<string> {
    const model = await this.getModel(opts);
    this.messages.push(new HumanMessage(content));
    const result = await model.invoke(this.messages);
    const text = contentToText(result.content).trim() || "(empty model response)";
    this.messages.push(new AIMessage(text));
    return text;
  }

  // Methods Workbench study passes. manuscriptId carries the study id (see
  // studySessions.ts). Each pass runs a structured workflow rather than a
  // free chat turn.
  private async runMethodsTurn(
    opts: StartOptions,
    content: string,
  ): Promise<string> {
    const config = {
      provider: this.provider,
      model: opts.model,
      timeoutMs: Number(process.env.API_AGENT_TIMEOUT_MS || 180_000),
    };
    const studyId = opts.manuscriptId;
    const isFollowUp = content.trim() !== (opts.initialMessage ?? "").trim();

    if (opts.pass === "card_proposal") {
      if (!opts.targetCardType) throw new Error("proposal pass is missing its target card");
      const result = await runCardProposalAgent({
        studyId,
        cardType: opts.targetCardType,
        sessionId: this.id,
        userReply: isFollowUp ? content : null,
        config,
      });
      return `${result.summary_md}\n\n${result.created} option(s) ready above — pick one with "Use this", reply here to refine them, or close and edit the card directly.`;
    }
    if (opts.pass === "evidence_extraction") {
      if (!opts.snapshotId) throw new Error("extraction pass is missing its snapshot");
      const result = await runEvidenceExtractionAgent({ snapshotId: opts.snapshotId, config });
      return `${result.summary_md}\n\nAdded ${result.created} evidence item(s) to the tray.`;
    }
    if (opts.pass === "preflight_risk") {
      const result = await runPreflightRiskAgent({ studyId, config, sessionId: this.id });
      return `${result.summary_md}\n\nRecorded ${result.created} risk finding(s) in the Checks panel.`;
    }
    throw new Error(`unsupported methods pass: ${opts.pass ?? "(none)"}`);
  }

  private async runTurn(opts: StartOptions, content: string): Promise<void> {
    this.running = true;
    const startedAt = Date.now();
    this.emitAgentEvent({
      type: "user",
      message: { content: [{ type: "text", text: content }] },
      provider: this.provider as Provider,
    });

    try {
      let text: string;
      if (opts.workflow === "methods") {
        text = await this.runMethodsTurn(opts, content);
      } else if (opts.workflow === "review" || opts.workflow === "manuscript") {
        const command = slashCommandOf(content);
        text =
          opts.workflow === "review" || command === "review"
            ? await this.runReviewTurn(opts)
            : await this.runChatTurn(opts, content);
      } else {
        throw new Error(
          "Desktop API sessions support review, manuscript, and methods workflows. Use checklist/readiness run endpoints for manuscript checks.",
        );
      }
      this.emitAgentEvent({
        type: "assistant",
        message: { content: [{ type: "text", text }] },
        provider: this.provider as Provider,
      });
      this.emitAgentEvent({
        type: "result",
        duration_ms: Math.max(Date.now() - startedAt, 0),
        provider: this.provider as Provider,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (opts.workflow === "methods") {
        // Keep the methods session alive so the user can retry or rephrase;
        // surface a classified, plain-language message instead of crashing.
        const classified = classifyAgentError(err, this.provider);
        this.emitAgentEvent({
          type: "assistant",
          message: {
            content: [{
              type: "text",
              text: `Something went wrong: ${classified.message}\n\n${classified.fix}`,
            }],
          },
          provider: this.provider as Provider,
        });
      } else {
        this.emitTyped("error", new Error(message));
        this.emitAgentEvent({
          type: "assistant",
          message: { content: [{ type: "text", text: `Agent error: ${message}` }] },
          provider: this.provider as Provider,
        });
      }
      this.emitAgentEvent({
        type: "result",
        duration_ms: Math.max(Date.now() - startedAt, 0),
        error: true,
        provider: this.provider as Provider,
      });
    } finally {
      this.running = false;
    }
  }
}
