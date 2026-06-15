# Salesforce Org Health Analyzer — CLAUDE.md

## What this project is

A local developer tool that connects to Salesforce orgs via the Salesforce CLI, retrieves metadata, and runs an automated health check. Results are shown in a browser dashboard. No Salesforce credentials ever touch this codebase — the CLI owns the OAuth tokens.

---

## Stack

| Layer | Development | Production (packaged) |
|---|---|---|
| Server | Node.js 18 + Express on port 3001 | Same — single Express process on port 3001 |
| Client | React 19 + Vite dev server on port 5173, hot-reload, proxies `/api` to 3001 | Pre-built bundle in `client/dist/` served as static files by Express — no Vite, no proxy, single port (3001) |
| Persistence | JSON files in `history/` | Same — no database in either mode |
| Auth | Salesforce CLI (`sf`) delegates all OAuth | Same — tokens never touch this codebase |
| AI | `@anthropic-ai/sdk` bundled in `package.json` | Same — bundled. `openai` and `@google/generative-ai` are **optional** (not pre-installed; user must run `npm install openai` / `npm install @google/generative-ai` to enable those providers) |

The packaged tarball (`npm run package`) contains `server/`, `client/dist/`, `package.json`, `package-lock.json`, `start.sh`, `stop.sh`, and `README.md`. It has no `client/src/`, no `node_modules/`, and no Vite — `start.sh` detects the presence of `client/dist/index.html` to choose production mode automatically.

---

## Running locally

```bash
npm run install:all   # first time — installs server + client deps
npm run dev           # starts Express (3001) + Vite (5173) concurrently
```

Or use `./start.sh` which auto-detects prod vs dev, runs in background, and opens the browser.

---

## Project layout

```
server/
  index.js              Express entry — mounts all routers, loopback-only bind
  sfdx.js               SF CLI wrapper + REST helpers (listOrgs, retrieveMetadata, getStorageLimits, …)
  orgcheck.js           Runs sf check commands via execFile, Promise.allSettled
  util/validate.js      isValidAlias() — ALWAYS use this before passing user input to sf CLI
  analyzer/
    index.js            Orchestrator — runs 5 modules, computes weighted score, builds action plan
    security.js         30% weight
    automation.js       25% weight
    apex.js             20% weight
    datamodel.js        15% weight
    deployment.js       10% weight
    orgcheck.js         Normalises OrgCheck JSON → standard finding shape
    clouds/
      index.js          Runs detect() then run() for each cloud module
      registry.js       Flat array of all cloud modules — add new clouds here
      salescloud.js     Scored cloud
      servicecloud.js   Scored cloud
      cpq.js            Scored cloud
      *.js              Detect-only clouds
  routes/
    orgs.js             GET /api/orgs
    connect.js          POST/GET/DELETE /api/connect
    scan.js             POST/GET/DELETE /api/scan
    history.js          GET /api/history, GET /api/history/:orgId
    ai.js               /api/ai/* — all AI Insights endpoints
  ai/
    adapter.js          Provider-agnostic streaming LLM wrapper (anthropic / openai / gemini)
    prompts.js          Six scenario prompt builders

client/src/
  App.jsx               Screen state machine: connect → scan → dashboard → cleanup → historyrun
  api.js                All fetch helpers + SSE consumers (scan stream + AI stream)
  ThemeContext.jsx       dark/light theme provider — all components read from useTheme()
  screens/
    ConnectScreen.jsx   Org list + new-org login + History tab
    ScanScreen.jsx      Live scan progress via SSE
    DashboardScreen.jsx 8 tabs: Overview / Checks / Findings / Cloud Skills / Tech Debt / AI Insights / Action Plan / History
    AiInsightsTab.jsx   5-step AI wizard (type → items → scenario → review prompt → stream)
    HistoryRunScreen.jsx Full-screen past-scan view: Overview / Findings / AI Insights / Action Plan
    CleanupScreen.jsx   Keep-or-delete metadata folder
```

---

## Core conventions

### Input validation — never skip this

**Always** call `isValidAlias()` from `server/util/validate.js` before passing `alias` or `orgAlias` to any `sf` CLI command or filesystem path. The regex is `^[A-Za-z0-9_-]{1,64}$`. An alias starting with `--` would inject flags into `sf`.

Org IDs passed to `/api/history/:orgId` are validated against the same pattern to prevent path traversal.

### Scoring system

- Five core modules each produce a 0–100 sub-score. The orchestrator in `server/analyzer/index.js` combines them with fixed weights (security 30%, automation 25%, apex 20%, datamodel 15%, deployment 10%).
- Each module starts at 100 and deducts points per finding. Criticals deduct more than warnings. Scores floor at 0 via `Math.max(0, ...)`.
- **Cloud scores and OrgCheck score are stored separately and do NOT affect the overall score.** Never roll them into the weighted average.

### Finding shape

All analyzer modules must produce findings in this shape:

```js
{
  severity: "critical" | "warning" | "info",
  title: string,
  description: string,
  action: string,
  components: string[],   // affected component names
  source: "core" | "cloud:<cloudId>" | "orgcheck",
}
```

The orchestrator reads `severity` to deduct score points and `source` to route findings to the right tab.

### Action items shape

The orchestrator converts findings into action items for the Action Plan:

```js
{
  priority: number,
  title: string,
  action: string,
  impact: "Critical" | "High" | "Medium" | "Low",
  effort: "Low" | "Medium" | "High",
  deadline: "Immediate" | "30 days" | "60 days" | "90 days",
  components: string[],
  source: string,
}
```

### SSE streaming pattern

Both the scan progress and AI Insights output use Server-Sent Events, but with different transports:

- **Scan** (`GET /api/scan/status/:id`): uses `EventSource` in the client (GET endpoint, standard SSE).
- **AI** (`POST /api/ai/analyse`): uses `fetch` + `ReadableStream` reader in the client because the prompt travels in the POST body. The client in `api.js → analyseWithAI()` reads the stream manually and parses `data: {...}\n\n` lines.

When writing new streaming endpoints, follow the existing SSE format: `res.write(`data: ${JSON.stringify(obj)}\n\n`)`.

### Theme — always use useTheme()

Never import from `colors.js` directly in components. Always use:

```js
import { useTheme } from "../ThemeContext";
const { colors } = useTheme();
```

The `colors.js` file is the dark-theme palette used only as a fallback/reference. All UI colours must come from the live theme context.

### No database

All active scan jobs live in an in-memory `jobs` Map in `server/routes/scan.js`. They disappear on server restart. This is intentional — do not add a database.

Persistent state lives only in:
- `history/{orgId}/{ISO-timestamp}.json` — scan summaries
- `orgs/{alias}/{runId}/` — retrieved metadata (gitignored, temporary)
- `.env` — AI API keys (written by the AI config panel)

### What goes in history JSON

The history record stores **no credentials, no access tokens, no instance URLs, no package names/versions**. It stores: org ID, alias, edition, API version, sandbox flag, scores, finding counts, action items (with component names), storage stats, coverage counts, user signal counts, OrgCheck summary counts.

Component names (Apex class names, profile names, flow names) ARE stored because they drive the action plan. Warn users not to commit `history/` to public repos.

---

## Adding a new cloud module

1. Create `server/analyzer/clouds/{cloudname}.js` following the existing pattern:
   - Export `id`, `label`, `icon`, `detect(signals)` → boolean, `run(alias, findings, signals)` → `{ score, findings[] }`
   - For detect-only clouds: `run` returns `{ score: null, findings: [...] }` and emits a single info finding
2. Add the module to `server/analyzer/clouds/registry.js`
3. Add the cloud to `CLOUD_META` in `client/src/screens/DashboardScreen.jsx` and `HistoryRunScreen.jsx`

Detection signals available to `detect()`: `packages[]` (installed namespaces), `userLicenses[]`, `permSetLicenses[]`, `experienceCloudSiteCount`, `webStoreCount`.

---

## Adding a new AI scenario

1. Add an entry to the `SCENARIOS` array in `server/ai/prompts.js` with `id`, `label`, `icon`, `description`, `bestFor`
2. Add a builder function to `PROMPT_BUILDERS[id]` in the same file — receives `ctx: { orgContext, selectedItems, fileContents, findings }`, returns `{ systemPrompt, userPrompt }`
3. The client `AiInsightsTab.jsx` hardcodes the scenario list locally for display — update `SCENARIOS` there too to keep them in sync

---

## Adding a new core analyzer check

1. Add the check logic to the appropriate module in `server/analyzer/` (or create a new module)
2. Push a finding object into the module's `findings` array
3. Deduct from the module's running `score` variable: criticals typically −10 to −20, warnings −5 to −10
4. If adding a new module, register it in `server/analyzer/index.js` with its weight; the weights must sum to 100

---

## Security constraints

- Express listens on `127.0.0.1:3001` only — do not change to `0.0.0.0`
- CORS origin allowlist: `http://localhost:5173` and `http://127.0.0.1:5173` only
- All `alias`/`orgAlias` inputs must pass `isValidAlias()` before any CLI call or path join
- Org ID path segments must match `[A-Za-z0-9_-]{1,64}` before being joined to `history/`
- AI API keys in POST bodies are used for that request only — never cache them server-side
- The `.env` write endpoint (`POST /api/ai/env-config`) validates key format with `/^[^\s\n\r]{8,500}$/`

---

## Ports and configuration

| Port | Purpose | Change location |
|---|---|---|
| 3001 | Express API (+ static in prod) | `server/index.js` → `const PORT` |
| 5173 | Vite dev server | `client/vite.config.js` → `port:` |
| 1717 | Salesforce CLI OAuth redirect | Controlled by `sf` — not configurable here |

---

## Package commands

```bash
npm run dev          # Express + Vite concurrently (hot reload)
npm start            # ./start.sh — background, auto-detects prod vs dev
npm stop             # ./stop.sh
npm run build        # builds client/dist (Vite)
npm run start:prod   # single-process prod server (Express serves client/dist)
npm run package      # builds + tarballs for distribution → dist/
npm run install:all  # installs server + client deps in one step
```
