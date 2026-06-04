"""Revision workflow agent using OpenAI Agents SDK."""

from agents import Agent, function_tool
from . import tools


@function_tool
def search_commentaries_tool(query: str, research_domain: str = "", journal_type: str = "", limit: int = 10) -> str:
    """Search past commentaries by full-text query to find reviewer feedback patterns."""
    result = tools.search_commentaries(query, research_domain or None, journal_type or None, limit)
    return str(result)


@function_tool
def search_revisions_tool(query: str, category: str = "", status: str = "", limit: int = 10) -> str:
    """Search past revisions to see how the user addressed similar feedback."""
    result = tools.search_revisions(query, category or None, status or None, limit)
    return str(result)


@function_tool
def get_commentaries_tool(manuscript_id: str, round: int = 0) -> str:
    """Get all commentaries for a manuscript."""
    result = tools.get_commentaries(manuscript_id, round if round > 0 else None)
    return str(result)


@function_tool
def create_suggestion_tool(
    manuscript_id: str,
    commentary_id: str,
    category: str,
    suggestion: str,
    revised_text: str = "",
) -> str:
    """Create a revision suggestion. Category must be 'mechanical' or 'rewrite'."""
    result = tools.create_suggestion(manuscript_id, commentary_id, category, suggestion, revised_text or None)
    return str(result)


def create_revision_agent(system_prompt: str) -> Agent:
    return Agent(
        name="RevisionAgent",
        instructions=system_prompt,
        tools=[
            search_commentaries_tool,
            search_revisions_tool,
            get_commentaries_tool,
            create_suggestion_tool,
        ],
    )
