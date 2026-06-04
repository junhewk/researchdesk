"""Tool implementations that call back to the Next.js API for DB access."""

import os
import json
import urllib.request
import urllib.parse
from typing import Any

NEXTJS_BASE = os.environ.get(
    "NEXTJS_BASE_URL",
    os.environ.get("REVIEWER_API_URL", "http://localhost:3871"),
)


def _call_api(path: str, params: dict[str, Any] | None = None) -> Any:
    url = f"{NEXTJS_BASE}{path}"
    if params:
        filtered = {k: str(v) for k, v in params.items() if v is not None}
        url += "?" + urllib.parse.urlencode(filtered)

    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


def _post_api(path: str, body: dict[str, Any]) -> Any:
    url = f"{NEXTJS_BASE}{path}"
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


def search_commentaries(
    query: str,
    research_domain: str | None = None,
    journal_type: str | None = None,
    limit: int = 10,
) -> list[dict[str, Any]]:
    return _call_api("/api/search/internal", {
        "q": query,
        "type": "commentaries",
        "research_domain": research_domain,
        "journal_type": journal_type,
        "limit": limit,
    })


def search_revisions(
    query: str,
    category: str | None = None,
    status: str | None = None,
    limit: int = 10,
) -> list[dict[str, Any]]:
    return _call_api("/api/search/internal", {
        "q": query,
        "type": "revisions",
        "category": category,
        "status": status,
        "limit": limit,
    })


def search_reviews(
    query: str,
    category: str | None = None,
    research_domain: str | None = None,
    limit: int = 10,
) -> list[dict[str, Any]]:
    return _call_api("/api/search/internal", {
        "q": query,
        "type": "reviews",
        "category": category,
        "research_domain": research_domain,
        "limit": limit,
    })


def get_manuscript(manuscript_id: str) -> dict[str, Any]:
    return _call_api(f"/api/manuscripts/{manuscript_id}")


def get_commentaries(manuscript_id: str, round: int | None = None) -> list[dict[str, Any]]:
    params = {"round": round} if round else {}
    return _call_api(f"/api/manuscripts/{manuscript_id}/commentaries", params)


def create_suggestion(
    manuscript_id: str,
    commentary_id: str,
    category: str,
    suggestion: str,
    revised_text: str | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "commentary_id": commentary_id,
        "category": category,
        "suggestion_md": suggestion,
    }
    if revised_text:
        body["revised_md" if category == "mechanical" else "rewrite_context"] = revised_text
    return _post_api(f"/api/manuscripts/{manuscript_id}/revisions", body)


def article_search(
    query: str,
    year_from: int | None = None,
    year_to: int | None = None,
    source: str = "both",
    limit: int = 10,
) -> list[dict[str, Any]]:
    return _call_api("/api/search/articles", {
        "q": query,
        "year_from": year_from,
        "year_to": year_to,
        "source": source,
        "limit": limit,
    })


def create_review_item(
    manuscript_id: str,
    category: str,
    severity: str,
    content: str,
    section_ref: str | None = None,
    revised_text: str | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "category": category,
        "content_md": content,
        "severity": severity,
    }
    if section_ref:
        body["section_ref"] = section_ref
    return _post_api(f"/api/manuscripts/{manuscript_id}/reviews", body)
