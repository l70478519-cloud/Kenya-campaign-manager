# Free-tier public-document AI review

The existing Kenya evidence panel (Analyst and documents pages) now offers evidence analysis, evidence-quality SWOT and a neutral factual response draft. Only the curated public-document context for the configured county is submitted; voter/contact records, chat history and arbitrary client prompts are not submitted. Source catalogue, original dates and limitations remain visible. Generated output is a draft, not independently verified research. Provider failures return a clearly labelled document digest, not a fake AI answer.

## Render environment

Choose one provider with `KENYA_EVIDENCE_PROVIDER=groq` and `GROQ_API_KEY`, optionally `GROQ_MODEL` (default `openai/gpt-oss-120b`); or `KENYA_EVIDENCE_PROVIDER=gemini`, `GEMINI_API_KEY` and `GEMINI_MODEL` set to an available text model in your Google AI Studio account. Quotas and model availability depend on the provider/account. Free tier is not unlimited; Gemini free-tier data handling must be considered before adding non-public material. Set keys in Render environment settings, never the frontend or git. No key means deterministic public-document review remains available. These variables affect this public-document review only; existing OpenAI features are not silently rerouted.

## Social listening scope

Current public search covers indexed news/public pages. It does not provide comprehensive direct Facebook, X or TikTok access. Sentiment is a fallible content label, not public opinion or voting intention. Source date and retrieval date are different. No public-source scan establishes representative polling.

## OpenClaw feasibility (checked 2026-10-22)

Official docs: https://docs.openclaw.ai/gateway/openai-http-api and https://docs.openclaw.ai/gateway/openresponses-http-api . The gateway exposes optional OpenAI-compatible endpoints; endpoint must be enabled and bearer authentication configured. Its `model` selects an agent, not the underlying provider model. This makes a server adapter technically possible, but it is an agent runtime rather than a free inference provider; hosting and the chosen model have separate costs/quotas.

Do not point the shared multi-organization application at one privileged OpenClaw agent. OpenClaw's documented gateway trust boundary is not an adversarial multi-tenant boundary. Use isolated agent state and credentials per organization, an authenticated private server-to-server connection, disabled shell/browser/messaging tools for document review, and no automatic publication. The application must enforce authorization and retain tenant boundaries. No OpenClaw process, agent, credentials, external messaging or gateway connection has been installed or enabled by this change. A generic base URL switch would bypass these requirements and is intentionally not provided.

Provider compatibility documentation: https://ai.google.dev/gemini-api/docs/openai and https://console.groq.com/docs/openai .
