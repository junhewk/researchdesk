import type { SettingsSection } from "./types";


export const settingsSections: SettingsSection[] = [
  {
    title: "AI providers",
    caption:
      "The assistants behind reviews, checklists, readiness checks, and the Methods Workbench. Cloud providers send text off this computer: OpenAI, Gemini, and DeepSeek use API keys, while Codex uses ChatGPT sign-in. Local providers (Ollama, LM Studio, llama-server) run models on this machine — private and free, and required for local-only studies. The AI-status list above shows what's currently working.",
    fields: [
      { label: "OpenAI — cloud", placeholder: "Set OPENAI_API_KEY and OPENAI_MODEL" },
      { label: "Codex — cloud", placeholder: "Sign in with ChatGPT in API Providers" },
      { label: "Gemini — cloud", placeholder: "Set GEMINI_API_KEY and GEMINI_MODEL" },
      { label: "DeepSeek — cloud", placeholder: "Set DEEPSEEK_API_KEY and DEEPSEEK_MODEL" },
      { label: "Ollama — on this computer", placeholder: "Set OLLAMA_BASE_URL and OLLAMA_MODEL (defaults work if Ollama is installed)" },
      { label: "LM Studio — on this computer", placeholder: "Set LMSTUDIO_BASE_URL and LMSTUDIO_MODEL (defaults work with the LM Studio server)" },
      { label: "llama-server — on this computer", placeholder: "Set LLAMA_SERVER_BASE_URL and LLAMA_SERVER_MODEL" },
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
        placeholder: "Set RESEARCHDESK_DATA_DIR (default ./data)",
      },
    ],
  },
];
