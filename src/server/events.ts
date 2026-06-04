import { EventEmitter } from "events";
import type { SupervisorEvent } from "./types";

const GLOBAL_KEY = "__REVIEWER_AGENT_BUS__" as const;
const g = globalThis as unknown as Record<string, EventEmitter | undefined>;

function bus(): EventEmitter {
  if (!g[GLOBAL_KEY]) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(100);
    g[GLOBAL_KEY] = emitter;
  }
  return g[GLOBAL_KEY]!;
}

export function publish(event: SupervisorEvent): void {
  bus().emit(event.session_id, event);
  bus().emit("*", event);
}

export function subscribe(sessionId: string, listener: (event: SupervisorEvent) => void): () => void {
  bus().on(sessionId, listener);
  return () => bus().off(sessionId, listener);
}

export function subscribeAll(listener: (event: SupervisorEvent) => void): () => void {
  bus().on("*", listener);
  return () => bus().off("*", listener);
}

export function createSseResponse(channelId: string, abortSignal: AbortSignal): Response {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode("retry: 2000\n\n"));

      const unsubscribe = subscribe(channelId, (event) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // stream already closed
        }
      });

      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
        }
      }, 15_000);

      abortSignal.addEventListener("abort", () => {
        unsubscribe();
        clearInterval(keepalive);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
