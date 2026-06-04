"""FastAPI sidecar for OpenAI Agents SDK sessions."""

import asyncio
import json
import os
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

app = FastAPI(title="reviewer-agent-sidecar")

sessions: dict[str, dict[str, Any]] = {}
event_queues: dict[str, asyncio.Queue] = {}


class CreateSessionRequest(BaseModel):
    session_id: str
    workflow: str
    system_prompt: str
    manuscript_id: str
    tools: list[dict[str, Any]] = []
    resume_session_id: str | None = None


class MessageRequest(BaseModel):
    content: str


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/sessions")
async def create_session(req: CreateSessionRequest):
    from agents.revision_agent import create_revision_agent
    from agents.reviewer_agent import create_review_agent

    if req.workflow == "revision":
        agent = create_revision_agent(req.system_prompt)
    elif req.workflow == "review":
        agent = create_review_agent(req.system_prompt)
    else:
        raise HTTPException(400, f"unknown workflow: {req.workflow}")

    queue: asyncio.Queue = asyncio.Queue()
    sessions[req.session_id] = {
        "agent": agent,
        "manuscript_id": req.manuscript_id,
        "workflow": req.workflow,
        "history": [],
        "running": False,
    }
    event_queues[req.session_id] = queue

    return {"session_id": req.session_id}


@app.post("/sessions/{session_id}/messages")
async def send_message(session_id: str, req: MessageRequest):
    if session_id not in sessions:
        raise HTTPException(404, "session not found")

    session = sessions[session_id]
    if session["running"]:
        raise HTTPException(409, "agent is already running")

    session["running"] = True
    queue = event_queues[session_id]

    asyncio.create_task(_run_agent(session_id, req.content))

    return {"ok": True}


async def _run_agent(session_id: str, content: str):
    from agents import Runner

    session = sessions[session_id]
    queue = event_queues[session_id]
    agent = session["agent"]

    try:
        await queue.put({"type": "assistant", "message": {"content": [{"type": "text", "text": ""}]}})

        result = await Runner.run(agent, content)

        text = result.final_output if isinstance(result.final_output, str) else str(result.final_output)

        await queue.put({
            "type": "assistant",
            "message": {"content": [{"type": "text", "text": text}]},
        })

        await queue.put({"type": "result"})
    except Exception as e:
        await queue.put({"type": "error", "message": str(e)})
    finally:
        session["running"] = False


@app.get("/sessions/{session_id}/stream")
async def stream_events(session_id: str):
    if session_id not in event_queues:
        raise HTTPException(404, "session not found")

    queue = event_queues[session_id]

    async def generate():
        yield "retry: 2000\n\n"
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=15.0)
                yield f"data: {json.dumps(event)}\n\n"
                if event.get("type") == "result":
                    break
            except asyncio.TimeoutError:
                yield ": keepalive\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/sessions/{session_id}/interrupt")
async def interrupt_session(session_id: str):
    if session_id not in sessions:
        raise HTTPException(404, "session not found")
    sessions[session_id]["running"] = False
    return {"ok": True}


@app.post("/sessions/{session_id}/shutdown")
async def shutdown_session(session_id: str):
    sessions.pop(session_id, None)
    event_queues.pop(session_id, None)
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PYTHON_SIDECAR_PORT", "8100"))
    uvicorn.run(app, host="127.0.0.1", port=port)
