// Provider-agnostic LLM adapter. Configured by env vars:
//   AI_PROVIDER=anthropic (default) | gemini
//   AI_API_KEY=<key>
//   ANTHROPIC_BEDROCK_BASE_URL=<url>  (optional — routes Anthropic requests through a Bedrock gateway)
//
// Callers use streamCompletion() (async generator, yields string chunks)
// or complete() (awaitable, returns full string).
//
// The API key is checked at call time — a missing key surfaces as a
// streaming error in the UI rather than crashing the server at startup.

const MAX_CONTENT_CHARS = 400_000;

let _defaultClient = null;

// Returns a client instance. If apiKey/provider overrides are supplied they
// take precedence over env vars (user-supplied key from the UI config panel).
// Override clients are not cached — they are created fresh per call so that
// different keys don't collide in the same process.
function getClient(opts = {}) {
  const provider = (opts.provider || process.env.AI_PROVIDER || "anthropic").toLowerCase();
  const apiKey   = opts.apiKey || process.env.AI_API_KEY;

  if (!apiKey) {
    throw new Error("AI_API_KEY is not set. Add it to your .env file or configure it in the AI Insights settings panel.");
  }

  // Use cached default client only when relying purely on env-var config
  if (!opts.apiKey && !opts.provider && _defaultClient) return { client: _defaultClient, provider };

  if (provider === "anthropic") {
    const Anthropic = require("@anthropic-ai/sdk");
    const clientOpts = { apiKey };
    const bedrockBaseUrl = process.env.ANTHROPIC_BEDROCK_BASE_URL;

    if (bedrockBaseUrl) clientOpts.baseURL = bedrockBaseUrl;

    const client = new Anthropic.default(clientOpts);
    if (!opts.apiKey && !opts.provider) _defaultClient = client;
    return { client, provider };
  }

  if (provider === "openai") {
    try {
      const OpenAI = require("openai");
      const client = new OpenAI.default({ apiKey });
      return { client, provider };
    } catch {
      throw new Error("openai package not installed. Run: npm install openai");
    }
  }

  if (provider === "gemini") {
    const { GoogleGenerativeAI } = require("@google/generative-ai");
    const client = new GoogleGenerativeAI(apiKey);
    return { client, provider };
  }

  throw new Error(`Unknown AI provider "${provider}". Supported: anthropic, gemini`);
}

// Truncate combined content if it would blow out the context window.
// Appends a [TRUNCATED] marker so the AI knows data was cut.
function truncateIfNeeded(text) {
  if (text.length <= MAX_CONTENT_CHARS) return text;
  return text.slice(0, MAX_CONTENT_CHARS) + "\n\n[TRUNCATED — content exceeds limit]";
}

// Yields string chunks as they arrive from the provider.
// opts: { provider?, apiKey?, model? } — override env-var defaults for this call.
async function* streamCompletion({ systemPrompt, userPrompt, maxTokens = 4096 }, opts = {}) {
  const { client, provider } = getClient(opts);
  const truncatedUser = truncateIfNeeded(userPrompt);

  if (provider === "anthropic") {
    const model          = opts.model || "claude-sonnet-4-6";
    const bedrockBaseUrl = process.env.ANTHROPIC_BEDROCK_BASE_URL;

    if (bedrockBaseUrl) {
      // The SDK always appends /v1/messages regardless of baseURL; the Bedrock
      // gateway requires /model/{modelId}/invoke with anthropic_version in the body.
      // Use a direct fetch so we control the URL and body shape exactly.
      //
      // Bedrock model IDs are prefixed with "anthropic." — add it if not already present.
      const bedrockModel = model.startsWith("anthropic.") ? model : `anthropic.${model}`;
      const url  = `${bedrockBaseUrl}/model/${bedrockModel}/invoke`;
      const body = JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens:        maxTokens,
        system:            systemPrompt,
        messages:          [{ role: "user", content: truncatedUser }],
      });
      const apiKey = opts.apiKey || process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || "";

      // 5-minute timeout — Bedrock can be slow on large prompts.
      // Also honour an external abort signal (e.g. client disconnect).
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 300_000);
      if (opts.signal) opts.signal.addEventListener("abort", () => abort.abort());

      // The SF Bedrock gateway authenticates via Bearer token, not x-api-key.
      const authHeader = process.env.ANTHROPIC_AUTH_TOKEN
        ? `Bearer ${process.env.ANTHROPIC_AUTH_TOKEN}`
        : `Bearer ${apiKey}`;

      let resp;
      try {
        resp = await fetch(url, {
          method:  "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": authHeader,
          },
          body,
          signal: abort.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!resp.ok) {
        const detail = await resp.text().catch(() => resp.statusText);
        throw new Error(`${resp.status} ${detail}`);
      }

      // Read response as text first — the gateway may return plain JSON or a
      // streamed body; both cases are handled by parsing the accumulated text.
      const rawText = await resp.text();
      let data;
      try { data = JSON.parse(rawText); } catch {
        throw new Error(`Bedrock gateway returned non-JSON response: ${rawText.slice(0, 200)}`);
      }
      const text = data.content?.find(b => b.type === "text")?.text || "";
      if (text) yield text;
      return;
    }

    const stream = await client.messages.stream({
      model,
      max_tokens: maxTokens,
      system:     systemPrompt,
      messages:   [{ role: "user", content: truncatedUser }],
    });
    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta?.type === "text_delta") {
        yield chunk.delta.text;
      }
    }
    return;
  }

  if (provider === "openai") {
    const model = opts.model || "gpt-4o";
    const stream = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      stream:   true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: truncatedUser },
      ],
    });
    for await (const chunk of stream) {
      const text = chunk.choices?.[0]?.delta?.content;
      if (text) yield text;
    }
    return;
  }

  if (provider === "gemini") {
    const model = opts.model || "gemini-2.0-flash";
    // Gemini combines system + user into the generateContentStream call.
    // System instructions are passed via systemInstruction, user content as the prompt.
    const generativeModel = client.getGenerativeModel({
      model,
      systemInstruction: systemPrompt,
    });
    const result = await generativeModel.generateContentStream(truncatedUser);
    for await (const chunk of result.stream) {
      const text = chunk.text?.();
      if (text) yield text;
    }
    return;
  }

  throw new Error(`Streaming not implemented for provider "${provider}"`);
}

// Non-streaming convenience wrapper.
async function complete({ systemPrompt, userPrompt, maxTokens = 4096 }, opts = {}) {
  let result = "";
  for await (const chunk of streamCompletion({ systemPrompt, userPrompt, maxTokens }, opts)) {
    result += chunk;
  }
  return result;
}

// Reset cached default client — used when env vars change at runtime.
function resetClient() { _defaultClient = null; }

// Available models per provider, for the UI config panel.
const PROVIDER_MODELS = {
  anthropic: [
    { id: "claude-sonnet-4-6",         label: "Claude Sonnet 4.6 (default)" },
    { id: "claude-opus-4-8",           label: "Claude Opus 4.8" },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  ],
  gemini: [
    { id: "gemini-2.0-flash",         label: "Gemini 2.0 Flash (default)" },
    { id: "gemini-2.0-flash-lite",    label: "Gemini 2.0 Flash Lite" },
    { id: "gemini-1.5-pro",           label: "Gemini 1.5 Pro" },
    { id: "gemini-1.5-flash",         label: "Gemini 1.5 Flash" },
  ],
};

module.exports = { streamCompletion, complete, resetClient, PROVIDER_MODELS };
