"""Review workflow agent using OpenAI Agents SDK."""

from agents import Agent, function_tool
from . import tools


@function_tool
def search_reviews_tool(query: str, category: str = "", research_domain: str = "", limit: int = 10) -> str:
    """Search past reviews to calibrate severity and style."""
    result = tools.search_reviews(query, category or None, research_domain or None, limit)
    return str(result)


@function_tool
def search_commentaries_tool(query: str, research_domain: str = "", limit: int = 10) -> str:
    """Search past commentaries for review pattern context."""
    result = tools.search_commentaries(query, research_domain or None, None, limit)
    return str(result)


@function_tool
def article_search_tool(query: str, year_from: int = 0, year_to: int = 0, source: str = "both", limit: int = 10) -> str:
    """Search scholarly databases for academic articles."""
    result = tools.article_search(query, year_from if year_from > 0 else None, year_to if year_to > 0 else None, source, limit)
    return str(result)


@function_tool
def create_review_item_tool(
    manuscript_id: str,
    category: str,
    severity: str,
    content: str,
    section_ref: str = "",
    revised_text: str = "",
) -> str:
    """Create a review item. Category: mechanical/rewrite/structural/evidence. Severity: minor/major/critical."""
    result = tools.create_review_item(manuscript_id, category, severity, content, section_ref or None, revised_text or None)
    return str(result)


def create_review_agent(system_prompt: str) -> Agent:
    return Agent(
        name="ReviewAgent",
        instructions=system_prompt,
        tools=[
            search_reviews_tool,
            search_commentaries_tool,
            article_search_tool,
            create_review_item_tool,
        ],
    )
