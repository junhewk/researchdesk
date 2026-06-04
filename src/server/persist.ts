import { nanoid } from "nanoid";
import { getDb } from "./db";
import { nowUnix } from "@/lib/utils";
import type { AgentEvent, SessionMessage } from "./types";

export function persistAgentEvent(
  sessionId: string,
  event: AgentEvent,
  turnSeq: number,
): void {
  if (event.type === "stream_event" || event.type === "keep_alive") return;

  const db = getDb();
  const id = nanoid();
  const now = nowUnix();

  let role: string;
  let contentJson: string;

  switch (event.type) {
    case "system":
      role = "system";
      contentJson = JSON.stringify(event);
      break;
    case "assistant":
      role = "assistant";
      contentJson = JSON.stringify(
        (event as { message?: { content?: unknown } }).message?.content ?? [],
      );
      break;
    case "user":
      role = "user";
      contentJson = JSON.stringify(
        (event as { message?: { content?: unknown } }).message?.content ?? [],
      );
      break;
    case "tool_use":
      role = "tool_use";
      contentJson = JSON.stringify({
        name: (event as { name: string }).name,
        input: (event as { input: unknown }).input,
        id: (event as { id?: string }).id,
      });
      break;
    case "tool_result":
      role = "tool_result";
      contentJson = JSON.stringify({
        tool_use_id: (event as { tool_use_id: string }).tool_use_id,
        content: (event as { content: unknown }).content,
        is_error: (event as { is_error?: boolean }).is_error,
      });
      break;
    case "result":
      role = "system";
      contentJson = JSON.stringify({ result_type: "result", ...event });
      break;
    default:
      role = event.type;
      contentJson = JSON.stringify(event);
      break;
  }

  db.prepare(
    `INSERT INTO session_messages (id, session_id, role, content_json, turn_seq, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, sessionId, role, contentJson, turnSeq, now);
}

export function listSessionMessages(sessionId: string): SessionMessage[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM session_messages WHERE session_id = ? ORDER BY created_at")
    .all(sessionId) as SessionMessage[];
}
