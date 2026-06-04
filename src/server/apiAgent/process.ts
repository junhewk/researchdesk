import { EventEmitter } from "node:events";
import type { AgentProcess, AgentProcessEvents, StartOptions } from "@/server/agentProcess";
import type { AgentEvent, Provider } from "@/server/types";
import { runReviewAgent } from "./workflows";
import type { ApiProvider } from "./providers";

export class ApiAgentProcess extends EventEmitter implements AgentProcess {
  private sessionId: string | null = null;
  private opts: StartOptions | null = null;
  private closed = false;
  private running = false;

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

  private async runTurn(opts: StartOptions, content: string): Promise<void> {
    this.running = true;
    const startedAt = Date.now();
    this.emitAgentEvent({
      type: "user",
      message: { content: [{ type: "text", text: content }] },
      provider: this.provider as Provider,
    });

    try {
      if (opts.workflow !== "review") {
        throw new Error(
          "Desktop API sessions support the review workflow. Use checklist/readiness/preflight run endpoints for methods checks.",
        );
      }
      const result = await runReviewAgent({
        manuscriptId: opts.manuscriptId,
        config: {
          provider: this.provider,
          model: opts.model,
          timeoutMs: Number(process.env.API_AGENT_TIMEOUT_MS || 180_000),
        },
      });
      this.emitAgentEvent({
        type: "assistant",
        message: {
          content: [{
            type: "text",
            text: `${result.summary_md}\n\nCreated ${result.created} review item(s).`,
          }],
        },
        provider: this.provider as Provider,
      });
      this.emitAgentEvent({
        type: "result",
        duration_ms: Math.max(Date.now() - startedAt, 0),
        provider: this.provider as Provider,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emitTyped("error", new Error(message));
      this.emitAgentEvent({
        type: "assistant",
        message: { content: [{ type: "text", text: `Agent error: ${message}` }] },
        provider: this.provider as Provider,
      });
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
