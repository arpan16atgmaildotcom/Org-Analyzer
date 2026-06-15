const express = require("express");
const path    = require("path");
const fs      = require("fs");
const { isValidAlias } = require("../util/validate");
const { streamCompletion, PROVIDER_MODELS } = require("../ai/adapter");
const { SCENARIOS, buildPrompt } = require("../ai/prompts");

const router   = express.Router();
const ROOT     = path.join(__dirname, "../../");
const ORGS_DIR = path.join(ROOT, "orgs");
const ENV_FILE = path.join(ROOT, ".env");

// ── .env helpers ──────────────────────────────────────────────────────────────

// Parse a .env file into a plain key→value object. Handles comments and blanks.
function parseEnvFile(content) {
  const result = {};
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    result[key] = val;
  }
  return result;
}

// Serialise a key→value object back to .env format, preserving any comment
// lines that were in the original content.
function serialiseEnvFile(existing, updates) {
  const merged = { ...existing, ...updates };
  // Re-emit the standard header if the file is new
  const header = [
    "# AI Insights configuration — managed by Salesforce Org Health Analyzer",
    "# Supported providers: anthropic | gemini",
    "#",
    "# Anthropic (Claude):  AI_API_KEY=<auth-token>  — routed via ANTHROPIC_BEDROCK_BASE_URL",
    "# Google (Gemini):     AI_API_KEY=AIza...",
    "",
  ].join("\n");

  // Write each key in a stable order; provider keys grouped together
  const lines = [];
  const written = new Set();

  // Known ordering
  const preferred = ["AI_PROVIDER", "AI_API_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_BEDROCK_BASE_URL", "GEMINI_API_KEY"];
  for (const k of preferred) {
    if (k in merged) { lines.push(`${k}=${merged[k]}`); written.add(k); }
  }
  for (const [k, v] of Object.entries(merged)) {
    if (!written.has(k)) lines.push(`${k}=${v}`);
  }

  return header + lines.join("\n") + "\n";
}

// ── Metadata type registry ────────────────────────────────────────────────────
const META_TYPE_MAP = {
  classes:        { folder: "classes",        ext: ".cls",                    label: "Apex Classes" },
  triggers:       { folder: "triggers",       ext: ".trigger",                label: "Apex Triggers" },
  flows:          { folder: "flows",          ext: ".flow-meta.xml",          label: "Flows" },
  objects:        { folder: "objects",        ext: null,  isDir: true,        label: "Custom Objects" },
  permissionsets: { folder: "permissionsets", ext: ".permissionset-meta.xml", label: "Permission Sets" },
  profiles:       { folder: "profiles",       ext: ".profile-meta.xml",       label: "Profiles" },
};

const VALID_SCENARIO_IDS = new Set(SCENARIOS.map(s => s.id));
const VALID_PROVIDERS    = new Set(Object.keys(PROVIDER_MODELS));
const UUID_RE     = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ITEM_NAME_RE = /^[A-Za-z0-9 _\-\.]{1,150}$/;

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveMetaTypeDir(orgAlias, runId, typeKey) {
  const { folder } = META_TYPE_MAP[typeKey];
  return path.join(ORGS_DIR, orgAlias, runId, "force-app", "main", "default", folder);
}

function listItems(typeDir, typeKey) {
  const { ext, isDir } = META_TYPE_MAP[typeKey];
  if (!fs.existsSync(typeDir)) return null;
  const entries = fs.readdirSync(typeDir, { withFileTypes: true });
  if (isDir) return entries.filter(e => e.isDirectory()).map(e => e.name).sort();
  return entries.filter(e => e.isFile() && e.name.endsWith(ext)).map(e => e.name.slice(0, -ext.length)).sort();
}

function readItemContent(typeDir, typeKey, itemName) {
  const { ext, isDir } = META_TYPE_MAP[typeKey];
  let filePath;
  if (isDir) {
    filePath = path.join(typeDir, itemName, `${itemName}.object-meta.xml`);
    if (!fs.existsSync(filePath)) {
      const objDir = path.join(typeDir, itemName);
      if (!fs.existsSync(objDir)) return null;
      const xmlFiles = fs.readdirSync(objDir).filter(f => f.endsWith(".xml"));
      if (!xmlFiles.length) return null;
      filePath = path.join(objDir, xmlFiles[0]);
    }
  } else {
    filePath = path.join(typeDir, itemName + ext);
  }
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(ORGS_DIR))) return null;
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  return raw.length > 50_000 ? raw.slice(0, 50_000) + "\n[TRUNCATED]" : raw;
}

// Shared body parser for the two POST routes that accept the same payload shape.
function parseAnalyseBody(body) {
  const errors = [];
  const { runId, orgAlias, type, scenario, items, orgContext, findings, provider, model, apiKey } = body;

  if (!UUID_RE.test(runId || ""))           errors.push("Invalid runId");
  if (!isValidAlias(orgAlias || ""))         errors.push("Invalid orgAlias");
  if (!META_TYPE_MAP[type])                  errors.push(`Unknown type "${type}"`);
  if (scenario && !VALID_SCENARIO_IDS.has(scenario)) errors.push(`Unknown scenario "${scenario}"`);
  if (provider && !VALID_PROVIDERS.has(provider))    errors.push(`Unknown provider "${provider}"`);

  if (!Array.isArray(items) || items.length === 0 || items.length > 20)
    errors.push("items must be a non-empty array of up to 20 names");
  else if (!items.every(n => typeof n === "string" && ITEM_NAME_RE.test(n)))
    errors.push("Invalid item name(s)");

  return { errors, runId, orgAlias, type, scenario, items, orgContext: orgContext || {}, findings: Array.isArray(findings) ? findings : [], provider, model, apiKey };
}

// Read file contents from disk into a Map<name, string>.
function readFileContents(orgAlias, runId, type, items) {
  const typeDir = resolveMetaTypeDir(orgAlias, runId, type);
  if (!fs.existsSync(typeDir)) return { available: false, fileContents: new Map() };
  const fileContents = new Map();
  for (const itemName of items) {
    const content = readItemContent(typeDir, type, itemName);
    if (content) fileContents.set(itemName, content);
  }
  return { available: true, fileContents };
}

// ── GET /api/ai/config ────────────────────────────────────────────────────────
// Returns available providers and their model lists for the UI config panel.
router.get("/config", (req, res) => {
  res.json({ providers: PROVIDER_MODELS });
});

// ── GET /api/ai/scenarios ─────────────────────────────────────────────────────
router.get("/scenarios", (req, res) => {
  res.json({ scenarios: SCENARIOS });
});

// ── GET /api/ai/env-config ────────────────────────────────────────────────────
// Reads the .env file and returns the AI-related keys (with values masked for
// display). Returns { exists, provider, keys: { anthropic, gemini } }
// where each key value is the stored string (shown masked in the UI).
router.get("/env-config", (req, res) => {
  if (!fs.existsSync(ENV_FILE)) {
    return res.json({ exists: false, provider: "", keys: { anthropic: "", gemini: "" } });
  }
  const parsed = parseEnvFile(fs.readFileSync(ENV_FILE, "utf8"));
  res.json({
    exists:   true,
    provider: parsed.AI_PROVIDER || "",
    keys: {
      anthropic: parsed.ANTHROPIC_API_KEY || (parsed.AI_PROVIDER === "anthropic" ? parsed.AI_API_KEY : "") || "",
      gemini:    parsed.GEMINI_API_KEY    || (parsed.AI_PROVIDER === "gemini"    ? parsed.AI_API_KEY : "") || "",
    },
  });
});

// ── POST /api/ai/env-config ───────────────────────────────────────────────────
// Creates or updates the .env file with the supplied AI provider keys.
// Body: { provider?, keys: { anthropic?, gemini? } }
// Each non-empty key is stored under its provider-specific var (ANTHROPIC_API_KEY
// etc.) AND as AI_API_KEY when it matches the active provider — so the server
// picks it up via dotenv on the next restart without any other change.
router.post("/env-config", (req, res) => {
  const { provider, keys = {} } = req.body;

  if (provider && !["anthropic", "gemini"].includes(provider)) {
    return res.status(400).json({ error: "Invalid provider" });
  }

  // Validate key format: must be non-empty printable ASCII, no newlines
  const KEY_RE = /^[^\s\n\r]{8,500}$/;
  for (const [prov, val] of Object.entries(keys)) {
    if (val && !KEY_RE.test(val)) {
      return res.status(400).json({ error: `Invalid API key format for ${prov}` });
    }
  }

  // Read existing .env so we preserve non-AI keys (e.g. NODE_ENV)
  const existing = fs.existsSync(ENV_FILE)
    ? parseEnvFile(fs.readFileSync(ENV_FILE, "utf8"))
    : {};

  const updates = {};

  if (provider)                updates.AI_PROVIDER       = provider;
  if (keys.anthropic)          updates.ANTHROPIC_API_KEY = keys.anthropic;
  if (keys.gemini)             updates.GEMINI_API_KEY    = keys.gemini;

  // Also keep AI_API_KEY pointing at the active provider's key so the adapter
  // picks it up on next restart when AI_PROVIDER is set.
  const activeProvider = provider || existing.AI_PROVIDER || "anthropic";
  const activeKey = keys[activeProvider] || existing[`${activeProvider.toUpperCase()}_API_KEY`] || existing.AI_API_KEY;
  if (activeKey) updates.AI_API_KEY = activeKey;

  const content = serialiseEnvFile(existing, updates);
  fs.writeFileSync(ENV_FILE, content, "utf8");

  res.json({ success: true, message: ".env saved. Restart the server to apply provider/key changes." });
});

// ── GET /api/ai/items ─────────────────────────────────────────────────────────
router.get("/items", (req, res) => {
  const { runId, orgAlias, type } = req.query;
  if (!UUID_RE.test(runId || ""))    return res.status(400).json({ error: "Invalid runId" });
  if (!isValidAlias(orgAlias || "")) return res.status(400).json({ error: "Invalid orgAlias" });
  if (!META_TYPE_MAP[type])          return res.status(400).json({ error: `Unknown type "${type}"` });

  const typeDir = resolveMetaTypeDir(orgAlias, runId, type);
  if (!fs.existsSync(typeDir)) return res.json({ available: false, reason: "metadata_deleted" });

  const items = listItems(typeDir, type);
  if (!items) return res.json({ available: false, reason: "metadata_deleted" });
  res.json({ available: true, items });
});

// ── POST /api/ai/prompt ───────────────────────────────────────────────────────
// Builds and returns the generated prompt for a given scenario + selection.
// The client displays this in the "Review Prompt" phase so the user can edit it.
// Body: { runId, orgAlias, type, scenario, items[], orgContext, findings[] }
// Returns: { systemPrompt, userPrompt }
router.post("/prompt", (req, res) => {
  const parsed = parseAnalyseBody(req.body);
  if (!parsed.scenario) parsed.errors.push("scenario is required");
  if (parsed.errors.length) return res.status(400).json({ error: parsed.errors.join("; ") });

  const { runId, orgAlias, type, scenario, items, orgContext, findings } = parsed;
  const { fileContents } = readFileContents(orgAlias, runId, type, items);

  try {
    const { systemPrompt, userPrompt } = buildPrompt(scenario, {
      orgContext,
      selectedItems: items,
      fileContents,
      findings,
    });
    res.json({ systemPrompt, userPrompt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/ai/analyse ──────────────────────────────────────────────────────
// Streams the AI analysis as SSE. Uses POST so the (potentially edited) prompt
// travels in the request body instead of the URL — avoids the 8 KB URL limit.
//
// Body: { runId, orgAlias, type, scenario, items[], orgContext, findings[],
//         provider?, model?, apiKey?,
//         customSystemPrompt?, customUserPrompt? }
//
// If customSystemPrompt / customUserPrompt are present they are used directly
// (user edited the prompt in the Review stage). Otherwise the prompt is rebuilt
// from scenario + metadata on the server.
//
// Streams SSE: { type:"token", text } | { type:"done" } | { type:"error", message }
router.post("/analyse", async (req, res) => {
  const parsed = parseAnalyseBody(req.body);
  if (parsed.errors.length) return res.status(400).json({ error: parsed.errors.join("; ") });

  const { runId, orgAlias, type, items, orgContext, findings, provider, model, apiKey } = parsed;
  const { customSystemPrompt, customUserPrompt } = req.body;

  // Require either a scenario (to build prompt) or custom prompts (edited by user)
  const scenario = parsed.scenario;
  const hasCustomPrompt = customSystemPrompt && customUserPrompt;
  if (!scenario && !hasCustomPrompt) {
    return res.status(400).json({ error: "Provide scenario or customSystemPrompt + customUserPrompt" });
  }

  // ── SSE headers ──
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  const abort   = new AbortController();
  let aborted   = false;
  req.on("close", () => { aborted = true; abort.abort(); });

  try {
    let systemPrompt, userPrompt;

    if (hasCustomPrompt) {
      systemPrompt = customSystemPrompt;
      userPrompt   = customUserPrompt;
    } else {
      const { fileContents } = readFileContents(orgAlias, runId, type, items);
      const built = buildPrompt(scenario, { orgContext, selectedItems: items, fileContents, findings });
      systemPrompt = built.systemPrompt;
      userPrompt   = built.userPrompt;
    }

    const adapterOpts = {};
    if (provider)      adapterOpts.provider = provider;
    if (model)         adapterOpts.model    = model;
    if (apiKey)        adapterOpts.apiKey   = apiKey;
    adapterOpts.signal = abort.signal;

    const gen = streamCompletion({ systemPrompt, userPrompt }, adapterOpts);

    for await (const chunk of gen) {
      if (aborted) break;
      send({ type: "token", text: chunk });
    }

    if (!aborted) send({ type: "done" });
  } catch (err) {
    send({ type: "error", message: err.message });
  } finally {
    res.end();
  }
});

module.exports = router;
