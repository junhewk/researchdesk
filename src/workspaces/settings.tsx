import type { SettingsSection } from "./types";


export const settingsSections: SettingsSection[] = [
  {
    title: "API agent providers",
    caption:
      "Structured-output review, checklist, readiness, and preflight agents powered by LangChain chat providers.",
    fields: [
      { label: "OpenAI", placeholder: "Set OPENAI_API_KEY and OPENAI_MODEL" },
      { label: "Gemini", placeholder: "Set GEMINI_API_KEY and GEMINI_MODEL" },
      { label: "DeepSeek", placeholder: "Set DEEPSEEK_API_KEY and DEEPSEEK_MODEL" },
      { label: "Ollama", placeholder: "Set OLLAMA_BASE_URL and OLLAMA_MODEL" },
      { label: "LM Studio", placeholder: "Set LMSTUDIO_BASE_URL and LMSTUDIO_MODEL" },
      { label: "llama-server", placeholder: "Set LLAMA_SERVER_BASE_URL and LLAMA_SERVER_MODEL" },
    ],
  },
  {
    title: "Scholarly search",
    caption:
      "Semantic Scholar + OpenAlex for citation and evidence checks.",
    fields: [
      { label: "Semantic Scholar key", placeholder: "Set SEMANTIC_SCHOLAR_API_KEY" },
      { label: "OpenAlex email", placeholder: "Set OPENALEX_EMAIL" },
    ],
  },
  {
    title: "Data",
    caption: "SQLite database and markdown exports.",
    fields: [
      {
        label: "Data directory",
        placeholder: "Set REVIEWER_DATA_DIR (default ./data)",
      },
    ],
  },
];
