# Salesforce Org Health Analyzer

A local developer tool that connects to your Salesforce orgs via the Salesforce CLI, retrieves metadata, and runs an automated health check. Results are shown in a browser dashboard with prioritised action items. A persistent history folder tracks metrics across runs without retaining the metadata itself.

The dashboard also surfaces live org context fetched via the REST API: storage usage (data / file / Big Object), Agentforce status, enabled Salesforce Clouds, installed managed packages, and a full tech-debt analysis powered by the OrgCheck SF CLI plugin. An **AI Insights** tab lets you run LLM-powered deep analysis of individual metadata items (Apex classes, flows, profiles, and more) against Claude (via the Bedrock gateway) or Gemini — with a configurable prompt you can review and edit before sending. The UI supports dark and light themes, switchable from the Connect screen.

---

## Prerequisites

| Requirement | Minimum version | Check |
|---|---|---|
| Node.js | 18.x | `node --version` |
| npm | 9.x | `npm --version` |
| Salesforce CLI (`sf`) | 2.x | `sf --version` |
| OrgCheck SF CLI plugin | 8.x | `sf plugins` |
| LLM API key *(optional)* | — | required only for the AI Insights tab |

### Install Salesforce CLI (if not already installed)

```bash
npm install --global @salesforce/cli
```

Verify:

```bash
sf --version
# @salesforce/cli/2.x.x ...
```

### Install the OrgCheck plugin

The Tech Debt tab requires the `@orgcheck/sfdx-plugin` Salesforce CLI plugin. Check whether it is already installed:

```bash
sf plugins
```

If `@orgcheck/sfdx-plugin` does not appear in the list, install it:

```bash
sf plugins install @orgcheck/sfdx-plugin
```

Verify:

```bash
sf plugins
# @orgcheck/sfdx-plugin 8.x.x
```

> The plugin is called automatically during every scan. If it is missing, the Tech Debt tab shows an "unavailable" notice but the rest of the scan completes normally.

---

## Installation

### 1. Clone or download the project

```bash
git clone <repo-url> "Org Analyzer"
cd "Org Analyzer"
```

Or if you have the folder already:

```bash
cd "Org Analyzer"
```

### 2. Install all dependencies (server + client in one command)

```bash
npm run install:all
```

This runs `npm install` in the root (server dependencies) and then `npm install` inside `client/` (React/Vite dependencies).

> **First-run only.** `start.sh` checks for `node_modules` and runs this automatically if missing, so you can skip this step and go straight to [Running the tool](#running-the-tool).

---

## Running the tool

`start.sh` auto-detects which mode to run:

| Has `client/dist/index.html`? | Mode | Port | What runs |
|---|---|---|---|
| Yes (a packaged release) | **Production** | `3001` | Express serves the API **and** the pre-built React bundle from one process |
| No (a fresh git clone) | **Dev** | `5173` | Express on `3001` + Vite dev server on `5173`, hot-reload enabled |

End users running a packaged release get production mode automatically. Developers cloning the repo get dev mode automatically.

### Option A — Executable script (recommended)

Double-click `start.sh` in Finder, or run from the terminal:

```bash
./start.sh
```

What it does:
1. Checks that `node` and `sf` are on your PATH
2. Installs dependencies automatically if `node_modules` is missing
3. Checks that ports 3001 and 5173 are free
4. Starts both servers in the background using `nohup` — **you can close the terminal immediately**
5. Waits until the UI is ready, then opens **http://localhost:5173** in your default browser automatically

Output after a successful start:

```
✓ Opened http://localhost:5173

  The tool is running in the background.
  To stop it, run:  ./stop.sh
  To view logs:     tail -f server.log
```

**To stop the tool:**

```bash
./stop.sh
# or
npm stop
```

**To view server logs:**

```bash
tail -f server.log
```

**Running `./start.sh` again** while already running will skip startup and just open a new browser tab.

### Option B — npm scripts

```bash
npm start    # same as ./start.sh — runs in background, terminal can be closed
npm stop     # same as ./stop.sh
```

### Option C — Dev mode (manual)

```bash
npm run dev
```

Starts both processes without the port check or automatic browser open. Useful if you want to keep the terminal output visible while developing.

This starts two processes concurrently:

| Process | Address | Purpose |
|---|---|---|
| Express server | `http://localhost:3001` | Runs Salesforce CLI commands, analysis engine, history API |
| Vite dev server | `http://localhost:5173` | React browser UI |

Open your browser manually at **http://localhost:5173**.

You should see the Org Health Analyzer connect screen with any orgs you already have authenticated via `sf`.

### Option D — Production mode (manual)

If you've built the client (`npm run build`) and want to run a single-process server yourself:

```bash
npm run start:prod
```

Open **http://localhost:3001** — Express serves both the API and the React UI on the same port. No Vite, no proxying.

---

## Packaging a release for other users

The repo ships with a one-command packager that builds the client, stages the runtime files, and tarballs them:

```bash
npm run package
```

This produces:

```
dist/sf-org-analyzer-v<version>.tar.gz   (~370 KB)
dist/sf-org-analyzer-v<version>.zip      (Windows-friendly, if `zip` is installed)
```

The tarball contains:
- `server/` — the Express app
- `client/dist/` — the pre-built React bundle (no source, no node_modules, no Vite)
- `package.json` + `package-lock.json` — server-only deps installed at first run
- `start.sh` / `stop.sh`
- `README.md`

To distribute: upload the tarball to a GitHub Release, or any shared drive. Recipients only need:
- **Node.js 18+** (`node --version`)
- **Salesforce CLI** (`sf --version`)
- **OrgCheck plugin** (`sf plugins install @orgcheck/sfdx-plugin`)

Then:

```bash
tar -xzf sf-org-analyzer-v1.0.0.tar.gz
cd sf-org-analyzer-v1.0.0
./start.sh
```

`start.sh` runs `npm install --omit=dev` on first launch (≈10 seconds — installs Express + a handful of helpers, no React dev tooling), then opens **http://localhost:3001** in the browser.

Subsequent launches are instant — `node_modules` is already there.

---

## First-time use walkthrough

### Step 1 — Connect an org

**If you already have orgs authenticated via `sf`**, they will appear on the screen automatically. Skip to Step 2.

**To add a new org:**

1. Pick the environment with the **Production / Sandbox** toggle. Production routes login to `login.salesforce.com` (the `sf` default); Sandbox passes `--instance-url https://test.salesforce.com` so OAuth lands on the sandbox login page.
2. Enter an alias in the **"Org alias"** field (e.g. `my-prod`, `acme-sandbox`)
3. Click **Login with Salesforce**
4. Your system browser opens to the Salesforce login page
5. Log in normally — the CLI manages the OAuth token in your system keychain; this tool never sees your credentials
6. Once login is complete, the UI detects it automatically (polls every 2 seconds) and adds the org to the list

> The browser must open on the same machine running the tool. Remote/headless environments require running `sf org login web` manually first.

> **Cancelling a login.** While a login is pending, the banner shows a **Cancel** button that calls `DELETE /api/connect/:loginId` to terminate the spawned `sf` child. This frees the OAuth redirect listener on port 1717 — without it, a stale child blocks the next attempt with `Cannot start the OAuth redirect server on port 1717.` Starting a fresh login also kills any prior pending child as a "supersede" guard.

### Step 2 — Run a health check

Click **Analyse** next to the org you want to check.

The scan screen shows real-time progress as the tool:

1. Verifies org authentication
2. Creates a temporary metadata folder at `orgs/{alias}/{runId}/`
3. Retrieves metadata from Salesforce (Apex, Flows, Profiles, Objects, etc.) — this is the longest step, typically 1–5 minutes depending on org size
4. Runs five core analysis modules against the downloaded files
5. Fetches live org metrics (storage, coverage, user signals, cloud signals)
6. Runs OrgCheck plugin analysis (global view, Apex classes, hardcoded URLs, full test run)
7. Saves the health report to `history/`

### Step 3 — Review the dashboard

Seven tabs:

| Tab | Contents |
|---|---|
| **Overview** | Overall health score, critical/warning/info counts, per-category score bars, storage usage (data/file/Big Object), Agentforce status, enabled Salesforce Clouds, installed packages, and a colour legend |
| **Checks Performed** | Catalogue of every rule the analyzer runs — what it inspects, which metadata file, score impact, and pass/fail outcome. Filter chips (All / Core / Per-Cloud) toggle between scored and informational checks |
| **Findings** | Collapsible categories → individual findings with severity, description, recommended action, and the affected component list |
| **Cloud Skills** | Per-cloud cards (Sales / Service / CPQ scored; everything else detect-only). Cloud findings still flow into the Action Plan; the score here is informational and does not affect the overall org score |
| **Tech Debt** | Results from the OrgCheck plugin: global metadata tech-debt summary, per-class Apex issues (sharing, bulk safety, deprecated classes, hardcoded URLs), hardcoded URL findings across all metadata types, and Apex test run results. Score is informational and does not affect the overall org score |
| **AI Insights** | LLM-powered deep analysis of selected metadata items. Choose a metadata type (Apex Classes, Triggers, Flows, Custom Objects, Permission Sets, Profiles), pick up to 20 items, select an analysis scenario, review and optionally edit the generated prompt, then stream the response from your chosen AI provider |
| **Action Plan** | Prioritised list of remediation steps with effort level, impact, deadline, and components. The PDF download exports Overview + Checks + Findings + Cloud Skills + Action Plan as a single report |
| **History** | All past scan results for this org with score trend; the current run is highlighted. Click any past run to open its dedicated History Run screen |

### Step 4 — Choose what to do with the metadata

After reviewing the dashboard, click **Finish →**.

You will be asked whether to keep or delete the retrieved metadata folder:

- **Keep** — retains `orgs/{alias}/{runId}/` for local development, further inspection, or deployment prep
- **Delete** — removes the folder; the health report and action plan are already saved in `history/` and are not affected

---

## What gets analysed

### Core categories (weighted overall score)

The tool reads local metadata files after retrieval and runs five analysis modules. Each module produces a 0–100 sub-score; the overall score is a weighted average:

| Category | Weight |
|---|---|
| Security & Access | 30% |
| Automation & Flows | 25% |
| Apex & Governor Limits | 20% |
| Data Model & Architecture | 15% |
| Metadata & Deployment | 10% |

### Security & Access (`server/analyzer/security.js`)
- Active System Administrator user count — live SOQL `SELECT COUNT() FROM User WHERE Profile.Name = 'System Administrator' AND IsActive = true`; flagged critical when more than 5
- Profiles with broad permissions (ModifyAllData, ViewAllData, ManageUsers) — flagged when more than 2
- Permission sets granting ModifyAllData
- **Permission sets granting ViewAllData** — flagged critical; grants read access to every record regardless of sharing rules
- **Permission sets granting other sensitive permissions** — one warning finding per permission type with any hits; covers `ManageUsers`, `AuthorApex`, `ResetPasswords`, `ModifyMetadata`, `InstallPackaging`, `ManageIPAddresses`
- **Overlapping permission sets** — computes Jaccard similarity across user permissions, object permissions, field permissions, and Apex class accesses; pairs with >60% overlap are flagged as a warning (e.g. `SalesRep ↔ SalesManager (78%)`). Only permission sets with 5+ permissions are included; requires at least 3 permission sets to run
- **Permission Set Group structural quality** — parses `PermissionSetGroup` metadata; PSGs with 0 or 1 constituent permission set are flagged as info (indirection without benefit); permission sets that appear as a member of 3+ groups are flagged as a warning (unpredictable change propagation)
- Connected Apps with Full OAuth scope
- **Multi-country logins** — joins `LoginHistory` (last 30 days, Status = Success) by `UserId`; flagged critical when a single user logs in from 3+ distinct `CountryIso` codes (two countries can be VPN/travel — three is the suspicion line)
- **API-only user with interactive UI login** — users whose profile name matches `/integration|api[\s_-]?only|analytics cloud (integration|security) user/i` who recorded a `LoginType = 'Application'` login (the form-post UI login). OAuth flows report as `Remote Access 2.0` and are intentionally excluded
- **Stale active users** — `IsActive = true AND UserType = 'Standard'` (excluding API-only profiles) with `LastLoginDate` older than 90 days; warning, sorted worst-offender first
- **Never-logged-in active users** — same population, `LastLoginDate IS NULL` AND `CreatedDate` older than 30 days (grace period for fresh provisioning); warning

### Automation & Flows (`server/analyzer/automation.js`)
- Active Process Builders — flows with `processType = Workflow` (retired Salesforce product, migration required)
- Active Flows without Fault/error handling paths (no `faultConnector` and no `<Fault>` element)
- Objects with 3+ active flows (automation conflict risk)
- Active Workflow Rules (legacy — migration recommended)
- Total active flow count (informational)

### Apex & Governor Limits (`server/analyzer/apex.js`)
- SOQL queries inside `for`/`while` loops, detected via regex scan of class bodies
- Apex classes on API versions below v55
- High trigger count (>10 triggers — framework recommendation)
- **Org-wide test coverage** — sourced from the Tooling API (`ApexOrgWideCoverage`). Critical finding when below 75% (Salesforce blocks production deploys at this threshold), warning when 75–79%.
- **Per-class test coverage** — sourced from `ApexCodeCoverageAggregate`. Warning when any class or trigger with executable lines falls below 80%; the affected components list shows each name with its percentage (e.g. `MyService (42%)`), sorted ascending so the worst offenders surface first.

### Data Model & Architecture (`server/analyzer/datamodel.js`)
- Custom object count (`__c`, `__mdt`, `__e`) — warned when above 300
- Lookup fields without `deleteConstraint` configured
- Custom fields with descriptions/labels containing "deprecated", "do not use", or "obsolete"

### Metadata & Deployment (`server/analyzer/deployment.js`)
- All metadata files (`*-meta.xml`) checked for `apiVersion` below v55, grouped by type
- LWC bundles on stale API versions
- Missing `sfdx-project.json` (source control not configured)

---

### Cloud Skills (informational — not part of scoring)

In addition to the five weighted core categories, the tool runs a **Cloud Skills** pass that detects which Salesforce clouds are enabled in the org and runs cloud-specific checks. Per-cloud scores are intentionally **not** rolled into the overall org-health score — orgs are not penalised for adopting more clouds. Cloud findings still flow into the unified Action Plan.

Detection uses four parallel signals so the analyzer catches more than just managed-package clouds:

| Signal | Source | Examples |
|---|---|---|
| Managed-package namespaces | `InstalledSubscriberPackage` (Tooling) | CPQ (`SBQQ`), Field Service (`FSL`), NPSP (`npsp`), OmniStudio, vlocity_*, Pardot (`pi`) |
| Active user licences | `SELECT … FROM UserLicense WHERE Status='Active'` | Service Cloud, Health Cloud, Field Service, Financial Services Cloud, CRM Analytics Plus |
| Active permission-set licences | `SELECT … FROM PermissionSetLicense WHERE Status='Active'` | Service Cloud Voice, Sales Engagement, CRM Analytics |
| Sobject presence | `Network` (Experience Cloud), `WebStore` (Commerce) | Experience Cloud sites, B2B/B2C storefronts |

Each cloud module declares its own detection rule against whichever signals are authoritative for that cloud. Sales Cloud and Service Cloud are treated as always-on.

#### v1 scored clouds

- **Sales Cloud** (`server/analyzer/clouds/salescloud.js`) — active Opportunity record types (info), Duplicate Rules (warning if zero active), Lead Assignment Rule (warning if zero active).
- **Service Cloud** (`server/analyzer/clouds/servicecloud.js`) — Case Assignment Rule (critical if zero active), Case Auto-Response Rule (warning if zero), active Case record types (info).
- **CPQ / Revenue Cloud** (`server/analyzer/clouds/cpq.js`) — installed CPQ version (info), active SBQQ Price Rules count (info), active Quote-to-Cash flows (info).

#### Detect-only clouds

Clouds with no shipped checks yet still appear as cards on the Cloud Skills tab so you can see what's installed. The card displays a 100% gauge with a **"No checks shipped yet — detection only"** sub-label so the score isn't misread as a verified pass:

- *Managed-package signals:* Field Service, Health Cloud, FSC, Education / NPSP, OmniStudio, Industries (Communications / Insurance / Public Sector), Marketing Cloud Account Engagement (Pardot).
- *Permission-set-licence / user-licence signals:* Service Cloud Voice, Sales Engagement, CRM Analytics (Tableau).
- *Sobject-presence signals:* Experience Cloud, Commerce Cloud (B2B / B2C).
- *Feature-flag signals:* Agentforce.

Where the detection signal carries useful inventory data (licence usage, number of Experience sites, number of WebStores), the detect-only module emits a single info finding so the card has at least one data point.

---

### AI Insights (optional — requires an LLM API key)

The **AI Insights** tab is a provider-agnostic LLM analysis layer that reasons directly over the retrieved metadata files. It runs as a five-step wizard:

1. **Select a metadata type** — one of six categories:

| Type | What it reads |
|---|---|
| Apex Classes | `.cls` source files from `classes/` |
| Apex Triggers | `.trigger` source files from `triggers/` |
| Flows | `.flow-meta.xml` files from `flows/` |
| Custom Objects | `objects/{name}/{name}.object-meta.xml` |
| Permission Sets | `.permissionset-meta.xml` files |
| Profiles | `.profile-meta.xml` files |

2. **Select items** — filterable checklist of every item in that metadata type. Up to 20 items per analysis. If the metadata was deleted after the scan, the tab falls back to using the stored scan findings (names from `actionItems[].components`) instead of raw files.
3. **Choose an analysis scenario** — six built-in scenarios:

| Scenario | Best for |
|---|---|
| Quick Health Check | Any metadata type — concise overview of key issues and top recommendations |
| Deep Code Review | Apex Classes, Triggers — line-level governor limits, null safety, SObject coupling, dead code |
| Logic & Flow Analysis | Flows, Apex Triggers — business logic explanation, fault-handling gaps, automation overlap |
| Security & Access Audit | Profiles, Permission Sets — privilege escalation, over-broad access, sharing gaps |
| Cross-Metadata Impact | Mixed selection — hidden dependencies and coupling risks across all selected items together |
| Executive Summary | Any metadata type — plain-English narrative for a non-technical stakeholder |

4. **Review & edit the prompt** — the server builds a structured prompt from the selected items and their metadata content, then shows it in two editable textareas (system prompt + user prompt). You can fine-tune both before sending.
5. **Stream the response** — the analysis streams token-by-token as Server-Sent Events. You can abort mid-stream, copy the output, or start a new analysis.

#### Get your AI Provider API key

You need an API key from one of the three supported providers before using AI Insights.

**Anthropic (Claude)**
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign in → **API Keys** in the left sidebar → **Create Key**
3. Your key starts with `sk-ant-api03-…`

**OpenAI (GPT)**
1. Go to [platform.openai.com](https://platform.openai.com)
2. Sign in → click your profile → **API keys** → **Create new secret key**
3. Your key starts with `sk-…`

**Google (Gemini)**
1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Sign in → **Get API key** → **Create API key**
3. Your key starts with `AIza…`

Once you have a key, paste it into the **AI Config** panel on the AI Insights tab and click **💾 Save to .env** — it persists across server restarts.

#### Provider configuration

Three LLM providers are supported. Configure them via the **AI Config** panel on the AI Insights tab or by editing the `.env` file in the project root:

| Provider | Default model | Env vars |
|---|---|---|
| Anthropic (default) | `claude-sonnet-4-6` | `AI_PROVIDER=anthropic`, `AI_API_KEY=sk-ant-api03-…` |
| OpenAI | `gpt-4o` | `AI_PROVIDER=openai`, `AI_API_KEY=sk-…` |
| Google Gemini | `gemini-2.0-flash` | `AI_PROVIDER=gemini`, `AI_API_KEY=AIza…` |

The **💾 Save to .env** button in the AI Config panel writes the key to a `.env` file at the project root and persists it across server restarts. The server must be restarted for a new provider selection to take effect; the API key is picked up immediately for the current session via the per-request override path.

> **OpenAI package.** The `openai` npm package is not bundled — it is not installed by default. If you select OpenAI as the provider, install it manually: `npm install openai` in the project root.

> **Content limits.** Each metadata file is truncated to 50 000 characters before being included in the prompt. The combined user prompt is truncated to 400 000 characters with a `[TRUNCATED]` marker so the model is always informed when data was cut.

#### Security notes for AI Insights

- API keys are stored in `.env` at the project root (gitignored by default). They are never written to `history/` or `orgs/`.
- The `.env` read/write endpoints (`GET /api/ai/env-config`, `POST /api/ai/env-config`) validate key format with `/^[^\s\n\r]{8,500}$/` to prevent newline injection.
- Metadata content sent to the LLM is always sourced from the local `orgs/` directory — the server never proxies arbitrary file paths.
- An API key supplied via the UI config panel is used only for the current streaming request and is never cached server-side.

---

### Tech Debt — OrgCheck Plugin (informational — not part of scoring)

The **Tech Debt** tab is powered by the `@orgcheck/sfdx-plugin` SF CLI plugin. During every scan the tool runs four OrgCheck commands in sequence and normalises the results into the standard findings format:

#### Commands run

| Command | Purpose |
|---|---|
| `sf check clear-all-cache` | Flushes the OrgCheck local cache before the run so results are always fresh |
| `sf check global-view` | Org-wide tech-debt summary across all metadata types OrgCheck can scan |
| `sf check apex-classes` | Per-class Apex tech-debt metrics (sharing, bulk safety, deprecated classes, hardcoded URLs, missing descriptions) |
| `sf check hardcoded-urls` | Finds hardcoded `salesforce.com` / `force.com` URLs across multiple metadata types |
| `sf check run-all-tests` | Runs the full Apex test suite and reports pass/fail/skipped counts |

All four analysis commands run in parallel after the cache clear. A timeout or failure on any individual command is silently swallowed — the scan completes and the Tech Debt tab shows an error notice for the affected command only.

#### What is reported

- **Global View** — warning when OrgCheck detects items violating best practices across any metadata type; info when none found. The overview panel shows total types scanned, total items, and items with debt.
- **Apex Classes — No Explicit Sharing** — classes missing a `with sharing` / `without sharing` declaration; warning per group of affected classes.
- **Apex Classes — Not Bulk-Safe** — classes OrgCheck flags for non-bulkified DML or SOQL patterns; warning.
- **Apex Classes — Deprecated** — classes still active but flagged deprecated; warning.
- **Apex Classes — Hardcoded URLs** — Apex classes containing hardcoded Salesforce domain strings; warning.
- **Apex Classes — Missing Description** — classes with no ApexDoc comment; info.
- **Hardcoded URLs** — grouped by metadata type (e.g. Flow, LWC, Custom Label); warning per type with affected components listed.
- **Test Run — Failures** — critical finding listing each failing test method when any tests fail.
- **Test Run — Skipped** — warning when tests are being skipped.
- **Test Run — All Passing** — info when the full suite passes.

The Tech Debt score starts at 100 and deducts 20 per critical finding and 10 per warning. It is **not** rolled into the overall org health score — orgs are not penalised for the volume of metadata they maintain.

---

### Live org metrics (REST API — not part of scoring)

In addition to the metadata analysis, the tool calls the org's REST API while the access token is fresh and embeds the results in the dashboard / history record:

- **Storage limits** — `/services/data/v{api}/limits/` → DataStorageMB, FileStorageMB, BigObjectStorageMB
- **Agentforce** — Tooling API `BotDefinition` query → enabled flag, active/total count
- **Installed packages** — Tooling API `InstalledSubscriberPackage` query (joined to `SubscriberPackage` and `SubscriberPackageVersion`) → name, namespace, dotted version string
- **Salesforce Clouds** — derived from installed-package namespaces (CPQ, FSL, Health Cloud, FSC, EDA, NPSP, OmniStudio, vlocity_cmt/ins/ps), in addition to the always-on Sales Cloud and Service Cloud
- **Cloud detection signals** — `getCloudDetectionSignals(alias)` runs four parallel REST queries that drive the Cloud Skills tab: `UserLicense`, `PermissionSetLicense`, `Network` (Experience Cloud sites), and `WebStore` (Commerce). Each query is wrapped in `try/catch` returning `[]` on failure — the `Network` and `WebStore` sobjects only exist on orgs with those features enabled, so a 404 is the correct "no, this cloud isn't here" answer.
- **Apex test coverage** — Tooling API `ApexOrgWideCoverage` (single org-wide percent) and `ApexCodeCoverageAggregate` (per-class `NumLinesCovered` / `NumLinesUncovered`). Feeds both the Apex analyzer findings (above) and the dedicated coverage panel on the Overview tab.
- **System Administrator user count** — data API SOQL `SELECT COUNT() FROM User WHERE Profile.Name = 'System Administrator' AND IsActive = true`. Replaces the old metadata-only check (the System Administrator profile exists in every org, so its presence is meaningless). Feeds a critical finding when the count exceeds 5.
- **User access signals** — two parallel queries, aggregated in Node:
  - `SELECT Id, Username, Name, LastLoginDate, CreatedDate, UserType, Profile.Name FROM User WHERE IsActive = true`
  - `SELECT UserId, LoginType, Status, CountryIso, Browser, LoginTime FROM LoginHistory WHERE LoginTime = LAST_N_DAYS:30`
  Drives the multi-country, API-only-browser-login, stale, and never-logged-in findings (see Security & Access above). LoginHistory has 180-day platform retention; the 30-day window is chosen for signal strength. The persisted history record keeps only the four counts plus `activeStandardUserCount` — usernames stay in `actionItems[].components` and are discarded with the in-memory job on server restart.

These are best-effort lookups and degrade silently when the org blocks API access or returns a non-JSON response.

---

## History folder

Every scan writes a summary to:

```
history/{orgId}/{ISO-timestamp}.json
```

The filename is the run's UTC ISO timestamp with `:` and `.` replaced by `-` (e.g. `2026-05-24T16-14.json`). Files sort lexicographically by timestamp.

Each file contains:

```json
{
  "runId": "467c8e4d-7bcf-4c77-bc2f-ea35e60bcc78",
  "timestamp": "2026-05-24T16:14:32.586Z",
  "org": {
    "id": "00Daj00000rTYuDEAW",
    "alias": "AF_DX2",
    "name": "AF_DX2",
    "edition": "Unknown",
    "apiVersion": "66.0",
    "isSandbox": false
  },
  "score": 89,
  "categoryScores": { "security": 70, "automation": 92, "apex": 100, "datamodel": 100, "deployment": 100 },
  "cloudScores":    { "salescloud": 88, "servicecloud": 70, "cpq": 100, "experiencecloud": null, "crmanalytics": null },
  "cloudSignals":   { "userLicenseCount": 14, "permSetLicenseCount": 22, "experienceCloudSiteCount": 1, "webStoreCount": 0 } | null,
  "findingCounts": { "critical": 1, "warning": 2, "info": 3 },
  "actionItems": [ /* prioritised, with priority, effort, impact, title, action, components, deadline */ ],
  "storage":      { "dataStorage": { ... }, "fileStorage": { ... }, "bigObjectStorage": null },
  "orgFeatures":  { "agentforce": { ... }, "clouds": [ ... ], "packages": [ { "namespace": "..." } ] | null },
  "coverage":     { "orgWidePercent": 78, "classCount": 142, "lowCoverageCount": 23 } | null,
  "sysAdminUsers": { "count": 7 } | null,
  "userSignals": {
    "windowDays": 30,
    "activeStandardUserCount": 42,
    "multiCountryLoginCount": 0,
    "apiOnlyBrowserLoginCount": 0,
    "staleActiveUserCount": 5,
    "neverLoggedInUserCount": 3
  } | null,
  "orgCheck": {
    "score": 80,
    "findingCounts": { "critical": 0, "warning": 2, "info": 3 },
    "summary": {
      "globalView": { "scannedTypes": 24, "totalBad": 12, "totalItems": 340 },
      "runAllTests": { "passing": 198, "failing": 0, "skipped": 2, "total": 200 },
      "errors": []
    }
  } | null,
  "metadataRetained": false,
  "folderSizeBytes": 1461199
}
```

> **OrgCheck record shape.** History stores only the tech-debt score, finding counts, and summary stats — not the full per-component list. Component names are still reachable via the corresponding `actionItems[].components` entries.

> **Coverage record shape.** History only stores the org-wide percent, total class count, and number of low-coverage classes — the full per-class list is held in memory for the active dashboard session and discarded on server restart. Class names of low-coverage classes are still reachable via the corresponding `actionItems[].components` entry stamped with their percentage (`MyClass (42%)`).

`metadataRetained` is `null` until the user makes a Keep/Delete choice on the cleanup screen.

> **What's deliberately not stored.** The persisted record omits `instanceUrl`, package names, and package versions to avoid leaking the org's host and ISV inventory. The dashboard still shows those values in the current session — they're held in the in-memory job result, not on disk.

### Is `history/` safe to commit?

It contains **no credentials, no access tokens, and no record data**, but it **does fingerprint your org topology**: org ID, alias, edition, API version, sandbox flag, package namespaces, Agentforce status, storage usage, and the names of affected components (Apex classes, profiles, flows, lookup fields). Implications:

- **Internal repo** — generally fine. Useful for tracking score trends across runs.
- **Public repo** — recommend gitignoring `history/`. The combination of org ID + custom schema names + installed-package namespaces is reconnaissance material.

The `orgs/` folder (where retrieved metadata lands) is always excluded from source control by `.gitignore`.

---

## Project structure

```
Org Analyzer/
├── server/
│   ├── index.js              Express server (port 3001) — mounts the four routers
│   ├── sfdx.js               Salesforce CLI wrapper + REST helpers
│   │                         (listOrgs, loginWeb, getOrgInfo, retrieveMetadata,
│   │                          getStorageLimits, getOrgFeatures, getApexCoverage,
│   │                          getSysAdminUserCount, getUserSecuritySignals,
│   │                          toolingQuery, getCloudDetectionSignals)
│   ├── orgcheck.js           OrgCheck plugin runner — executes the four sf check
│   │                         commands (clear-all-cache, global-view, apex-classes,
│   │                         hardcoded-urls, run-all-tests) with Promise.allSettled
│   │                         so individual failures don't abort the scan
│   ├── analyzer/
│   │   ├── index.js          Orchestrator — runs all modules, computes weighted score,
│   │   │                     builds findings + action plan, derives effort
│   │   ├── security.js       Profile, permission set, Connected App checks
│   │   ├── automation.js     Flow, Process Builder, Workflow Rule checks
│   │   ├── apex.js           SOQL-in-loop detection, API version checks, trigger count
│   │   ├── datamodel.js      Object/field structure checks
│   │   ├── deployment.js     Metadata API version and source-control checks
│   │   ├── orgcheck.js       Normalises raw OrgCheck JSON into standard findings shape
│   │   │                     (global-view, apex-classes, hardcoded-urls, run-all-tests)
│   │   └── clouds/           Per-cloud scoring (informational, not in overall score)
│   │       ├── index.js      Orchestrator — runs detect() then run() for each module
│   │       ├── registry.js   Flat array of every cloud module
│   │       ├── salescloud.js / servicecloud.js / cpq.js   Scored clouds
│   │       └── *.js          Detect-only clouds (FSL, Health, FSC, NPSP, etc.)
│   ├── routes/
│   │   ├── orgs.js           GET  /api/orgs
│   │   ├── connect.js        POST   /api/connect            (spawns sf org login web)
│   │   │                                                    accepts { alias, isSandbox }
│   │   │                     GET    /api/connect/status/:loginId
│   │   │                     DELETE /api/connect/:loginId   (cancels by killing the sf child)
│   │   ├── scan.js           POST   /api/scan/start
│   │   │                     GET    /api/scan/status/:id  (Server-Sent Events stream)
│   │   │                     GET    /api/scan/result/:id
│   │   │                     DELETE /api/scan/:id?keep=true|false
│   │   ├── history.js        GET /api/history
│   │   │                     GET /api/history/:orgId
│   │   └── ai.js             GET  /api/ai/config            (provider + model lists)
│   │                         GET  /api/ai/scenarios         (scenario registry)
│   │                         GET  /api/ai/env-config        (read .env AI keys)
│   │                         POST /api/ai/env-config        (write .env AI keys)
│   │                         GET  /api/ai/items             (list metadata items for a type)
│   │                         POST /api/ai/prompt            (build prompt for review phase)
│   │                         POST /api/ai/analyse           (stream SSE analysis)
│   └── ai/
│       ├── adapter.js        Provider-agnostic LLM wrapper — streamCompletion() yields chunks;
│       │                     supports anthropic (@anthropic-ai/sdk), openai, gemini
│       └── prompts.js        Six scenario prompt builders (quick-health, deep-code-review,
│                             logic-flow, security-audit, cross-impact, exec-summary)
├── client/                   React 19 + Vite app (port 5173, /api proxied to 3001)
│   ├── index.html
│   ├── vite.config.js        Proxies /api → http://localhost:3001
│   └── src/
│       ├── main.jsx
│       ├── App.jsx           Screen state machine (connect → scan → dashboard → cleanup → historyrun)
│       ├── api.js            fetch helpers + EventSource for the SSE scan stream + AI Insights calls
│       ├── colors.js         Design tokens (dark theme)
│       ├── components/       ScoreRing, ProgressBar, SeverityBadge
│       └── screens/
│           ├── ConnectScreen.jsx     Lists authenticated orgs; new-org login flow; History tab
│           ├── ScanScreen.jsx        Live progress via SSE
│           ├── DashboardScreen.jsx   Tabs: Overview / Checks / Findings / Cloud Skills /
│           │                               Tech Debt / AI Insights / Action Plan / History
│           ├── AiInsightsTab.jsx     Five-step AI analysis wizard (type → items → scenario →
│           │                         review prompt → stream); AI Config panel; SSE consumer
│           ├── HistoryRunScreen.jsx  Full-screen view of a past scan: Overview / Findings /
│           │                         AI Insights / Action Plan tabs; PDF export
│           └── CleanupScreen.jsx     Keep-or-delete metadata folder
├── history/                  Scan metrics (committed, no metadata)
├── orgs/                     Retrieved metadata (gitignored, temporary)
├── dist/                     Packaged release tarballs (gitignored — produced by `npm run package`)
├── scripts/
│   └── package-release.sh    Builds client/dist, stages runtime files, emits dist/<name>.tar.gz
├── start.sh / stop.sh        Background launcher + stopper. Auto-detects prod vs dev mode by
│                             checking for client/dist/index.html. Writes .server.pid, server.log.
├── package.json              Server deps: express, cors, fast-xml-parser, uuid, @anthropic-ai/sdk, dotenv
└── .gitignore
```

> **Note:** `salesforce-health-tool.jsx` at the repo root is a legacy single-file design prototype. The real app lives under `client/src/`.

---

## Troubleshooting

### "Could not load orgs" on start

The Salesforce CLI is not found or returned an error.

```bash
# Verify sf is on your PATH
which sf
sf org list
```

If `sf` is not found, install it: `npm install --global @salesforce/cli`

### Org shows as disconnected / expired session

Re-authenticate that org:

```bash
sf org login web --alias <your-alias>
```

Then refresh the org list in the tool UI (↻ Refresh button).

### Metadata retrieval times out or returns partial results

Large orgs can take several minutes. If it fails:

- Check that your session is still valid: `sf org display --target-org <alias>`
- Reduce the metadata types retrieved by editing `server/sfdx.js` — remove types you don't need from the `metadataTypes` array in `retrieveMetadata()`

### Tech Debt tab shows "unavailable"

The `@orgcheck/sfdx-plugin` is not installed. Install it and re-run the scan:

```bash
sf plugins install @orgcheck/sfdx-plugin
```

### Tech Debt tab shows partial results or command errors

Individual OrgCheck commands can fail independently (e.g. `run-all-tests` times out on a very large org). The other commands still complete and their results are shown. The error notice in the Tech Debt tab names which command failed. You can run the failing command manually to diagnose:

```bash
sf check global-view   --target-org <alias> --accept-the-terms --json
sf check apex-classes  --target-org <alias> --accept-the-terms --json
sf check hardcoded-urls --target-org <alias> --accept-the-terms --json
sf check run-all-tests  --target-org <alias> --accept-the-terms --json
```

### Port already in use

In **production mode** the tool only uses port `3001`. In **dev mode** it uses both `3001` (Express) and `5173` (Vite). Change them:

- **Server port:** edit `server/index.js` — change `const PORT = 3001`
- **Client port + proxy target (dev mode only):** edit `client/vite.config.js` — change `port: 5173` and update the `target` in the proxy to match the server port

### "Cannot start the OAuth redirect server on port 1717"

Salesforce CLI binds port 1717 for the OAuth redirect during `sf org login web`. If a previous login was killed without cleanup, the child can still be holding the port. Recover with:

```bash
pkill -f "sf org login"
```

The current build also kills the prior `sf` child whenever a new login is started, and the **Cancel** button on the login banner now calls `DELETE /api/connect/:loginId` to terminate the child explicitly — so this should self-heal in normal use.

### "Login with Salesforce" button does nothing / browser doesn't open

This happens in headless or remote environments where `sf` cannot open a system browser. Run the login manually in a terminal first:

```bash
sf org login web --alias <your-alias>
```

Once authenticated, click **↻ Refresh** in the tool UI and the org will appear.

---

## Metadata types retrieved

The tool retrieves the following metadata types during a scan (defined in the `metadataTypes` array of `server/sfdx.js → retrieveMetadata`):

`ApexClass` · `ApexTrigger` · `Flow` · `FlowDefinition` · `CustomObject` · `CustomField` · `Profile` · `PermissionSet` · `PermissionSetGroup` · `WorkflowRule` · `ConnectedApp` · `ExperienceBundle` · `ValidationRule` · `RecordType`

The retrieve runs against a freshly bootstrapped SFDX workspace inside `orgs/{alias}/{runId}/` — `sfdx-project.json` is generated on the fly with `sourceApiVersion: "62.0"` and the appropriate `sfdcLoginUrl` (production vs sandbox) so `sf project retrieve start` always has a valid project root and never falls back to a parent directory.

To add or remove types, edit that array.

---

## Architecture notes

- **Auth model.** This tool never sees Salesforce credentials. The Salesforce CLI handles OAuth — tokens live in the system keychain — and the tool shells out to `sf` via `execFile` / `spawn`. The REST calls for storage and feature lookups reuse the access token returned by `sf org display`.
- **Scan job lifecycle.** `POST /api/scan/start` returns a `runId` immediately and runs the job asynchronously in an in-memory `jobs` store on the Express process. Step updates are pushed to the client via Server-Sent Events at `GET /api/scan/status/:id`. Result is fetched separately at `GET /api/scan/result/:id` once the SSE stream emits `done`.
- **OrgCheck integration.** `server/orgcheck.js` shells out to `sf check` commands via `execFile` with a 10-minute timeout per command. All four analysis commands are dispatched in parallel via `Promise.allSettled` after the cache is cleared. Results are normalised in `server/analyzer/orgcheck.js` into the same `{ severity, title, description, action, components[] }` shape used by all other analyzer modules. OrgCheck errors never fail the scan.
- **Cleanup contract.** `DELETE /api/scan/:id?keep=true|false` removes the in-memory job and either retains or deletes `orgs/{alias}/{runId}/`. The history JSON is updated in place to record the user's choice (`metadataRetained`).
- **Score derivation.** Each core module starts at 100 and deducts per finding (criticals deduct more than warnings — see each module's `score = Math.max(0, 100 − …)`). The orchestrator combines them with the weights above, rounded to an integer. The OrgCheck tech-debt score uses the same deduction formula but is stored separately and does not feed the overall score.
- **AI Insights streaming.** `POST /api/ai/analyse` reads metadata files from `orgs/{alias}/{runId}/`, builds a prompt via `server/ai/prompts.js`, and pipes the provider stream to the client as SSE (`{ type:"token", text }` / `{ type:"done" }` / `{ type:"error" }`). The client uses a `POST` fetch with a `ReadableStream` reader rather than `EventSource` (which only supports `GET`). An `AbortController` is wired so the user can cancel mid-stream. Individual file reads are capped at 50 000 characters; the combined prompt is capped at 400 000 characters.
- **AI key handling.** API keys supplied via the UI config panel travel in the POST body as `apiKey` and are used for that request only — they are never written to disk or cached. Keys saved via `POST /api/ai/env-config` are written to a `.env` file at the project root; the server picks them up on the next restart via `dotenv`.
- **State boundaries.** No database. Active scan jobs live in memory and disappear on server restart. Persistent state is only the JSON files in `history/` and (if retained) the metadata folders in `orgs/`.

---

## Security model

This is a single-user, localhost-only tool. The hardening reflects that scope:

- **Loopback bind.** The Express server listens on `127.0.0.1:3001` only — not reachable from other machines on the LAN.
- **Origin allowlist.** Every API request must come from `http://localhost:5173` or `http://127.0.0.1:5173` (or have no `Origin` header, e.g. SSE / curl). A malicious browser tab on another site cannot drive the API.
- **Strict alias validation.** `alias` and `orgAlias` inputs are accepted only against `^[A-Za-z0-9_-]{1,64}$` before being passed to the `sf` CLI. This prevents an attacker-controlled alias starting with `--` from injecting extra flags into `sf org login web`, `sf project retrieve start`, or `sf check` commands. See `server/util/validate.js`.
- **Org-ID path validation.** `GET /api/history/:orgId` rejects anything outside `[A-Za-z0-9_-]{1,64}` to stop path-traversal into directories outside `history/`.
- **No secrets on disk.** Salesforce access tokens never leave memory. They're fetched fresh from `sf org display` for each REST call (storage, feature lookups) and discarded.
- **Reduced fingerprint.** Persisted history JSON omits `instanceUrl`, package names, and package versions. Component lists (Apex class names, profile names, flow names) are still written because they drive the action plan — see the warning above about committing `history/` to a public repo.
- **No session middleware.** The previous `express-session` setup with a hard-coded secret was removed — nothing read `req.session`.

Threats explicitly **not** mitigated (out of scope for a single-user local tool):
- Other processes running as the same OS user (they can read tokens via `sf` themselves)
- Physical access to the laptop
- Compromise of the Salesforce CLI keychain entry

---

## Version history

### v1.0.3 — 2026-06-04

#### AI Insights tab

- Added an **🧠 AI Insights** tab to both the scan dashboard (`DashboardScreen`) and the History Run screen (`HistoryRunScreen`).
- New server module `server/ai/adapter.js` — provider-agnostic streaming LLM wrapper supporting Anthropic (`@anthropic-ai/sdk`, default), OpenAI (`openai`, optional install), and Google Gemini (`@google/generative-ai`). `streamCompletion()` is an async generator that yields text chunks from any provider. An API-key-absent error streams gracefully to the UI rather than crashing the server.
- New server module `server/ai/prompts.js` — six scenario prompt builders (`quick-health`, `deep-code-review`, `logic-flow`, `security-audit`, `cross-impact`, `exec-summary`), each accepting org context, selected items, file contents, and existing scan findings as context.
- New server router `server/routes/ai.js` mounted at `/api/ai` — seven endpoints: `GET /config`, `GET /scenarios`, `GET /env-config`, `POST /env-config` (`.env` read/write), `GET /items`, `POST /prompt`, `POST /analyse` (SSE stream). All endpoints validate `runId`, `orgAlias`, `type`, `scenario`, and item names before touching the filesystem.
- New client component `client/src/screens/AiInsightsTab.jsx` — five-phase wizard (type selection → item selection → scenario selection → prompt review → streaming output). Includes a collapsible **AI Config** panel for live provider/model/key overrides and a **💾 Save to .env** button. Degrades gracefully when metadata was deleted — falls back to item names derived from stored scan findings.
- All API client methods for AI Insights added to `client/src/api.js`: `getAiConfig`, `getEnvConfig`, `saveEnvConfig`, `listAiItems`, `getAiPrompt`, `analyseWithAI` (POST fetch + `ReadableStream` SSE consumer with abort support).
- Added `@anthropic-ai/sdk` and `dotenv` to server dependencies (`package.json`).

#### History Run screen

- Clicking any past scan row in the History tab now navigates to a dedicated **History Run screen** (`HistoryRunScreen.jsx`) rather than a modal. The screen is a full-page view with its own tab bar: **Overview**, **Findings**, **AI Insights**, and **Action Plan**.
- **Overview** tab shows score ring, critical/warning/info counts, category score bars, cloud skill bars, storage usage, test coverage summary, and OrgCheck tech-debt score — mirroring the main dashboard but sourced from the history JSON.
- **Findings** tab reconstructs collapsible category groups from the persisted `actionItems` array.
- **AI Insights** tab is the same `AiInsightsTab` component, wired with `isHistory=true` and the run's `metadataRetained` flag so the fallback path activates automatically when files are gone.
- **Action Plan** tab shows the prioritised action list with a **Download Report (PDF)** button (`exportHistoryPdf`).
- Back navigation returns to whichever screen launched the history run (Connect screen History tab or main dashboard History tab).
- `App.jsx` adds a `historyrun` screen state and an `openHistoryRun(run, backTo)` helper to track the originating screen.

---

### v1.0.2 — 2026-06-02

#### Dark / light theme

- Added a two-palette theme system (`dark` and `light`) via a React context provider (`ThemeContext.jsx`).
- A pill-shaped theme toggle (`☀️ Light` / `🌙 Dark`) appears in the top-right corner of the Connect screen header on every visit.
- Theme choice persists across page reloads via `localStorage`.
- The `<html>` element background and text colour are synced on every theme switch so viewport edges never flash the wrong colour.
- All components — `App`, `ScanScreen`, `CleanupScreen`, `ConnectScreen` (both tabs), `DashboardScreen` and every sub-component inside it (`StorageBar`, `ChecksTab`, `CloudsTab`, `CoveragePanel`, `Legend`, `ComponentList`, `TechDebtTab`, `HistoryTab`), plus `ProgressBar`, `ScoreRing`, and `SeverityBadge` — now read colours from the live theme context instead of a static import.

**Light theme palette**

| Token | Value | Usage |
|---|---|---|
| `bg` | `#ffffe6` | Page background |
| `panel` | `#ffffff` | Card / panel surface |
| `panelBorder` | `#d0daea` | Card borders and dividers |
| `accent` | `#0070a8` | Primary interactive colour, tab underlines |
| `accentSoft` | `#005a87` | Buttons, toggles |
| `critical` | `#d9213a` | Critical severity, PRODUCTION badge |
| `warning` | `#c47a00` | Warning severity, SANDBOX badge |
| `info` | `#0070a8` | Info severity |
| `success` | `#007a55` | Pass / success states |
| `text` | `#0d1a2e` | Body text |
| `muted` | `#5a6f8a` | Secondary / helper text |
| `highlight` | `#e6edf7` | Row hover, code chips, highlighted cells |

---

#### History tab on the Connect screen

- The Connect (landing) screen now has two tabs: **🔌 Orgs** (the original content) and **📅 History**.
- The History tab calls `GET /api/history` on mount and groups all past scans by org.
- Each org row is collapsible and shows the latest score (colour-coded), org alias, org ID, sandbox/production badge, and total run count. Orgs with a single entry auto-expand.
- Expanded rows display a full run table with columns: timestamp (latest highlighted), score, critical / warning / info counts, and metadata retention status.

---

#### Back button on the Cleanup screen

- A **← Back to Dashboard** link appears at the top of the Keep/Delete choice screen, letting users return to the dashboard without committing to a metadata decision.
- A secondary **← Back to Dashboard** button is also shown alongside **Analyse Another Org →** on the post-choice confirmation screen.

---

### v1.0.1 — 2026-05-26

#### OrgCheck plugin integration

- Added a **🔩 Tech Debt** tab to the dashboard, powered by the `@orgcheck/sfdx-plugin` SF CLI plugin.
- New server module `server/orgcheck.js` runs four commands during every scan — `check clear-all-cache`, `check global-view`, `check apex-classes`, `check hardcoded-urls`, and `check run-all-tests` — in parallel via `Promise.allSettled`. Individual command failures are silently swallowed and never abort the scan.
- New analyzer module `server/analyzer/orgcheck.js` normalises raw OrgCheck JSON into the standard `{ severity, title, description, action, components[] }` finding shape, grouping Apex issues by sub-type (sharing, bulk safety, deprecated, hardcoded URLs, missing descriptions).
- OrgCheck score (0–100, −20 per critical, −10 per warning) is stored separately in the history record under `orgCheck` and does not affect the overall org health score.
- The `@orgcheck/sfdx-plugin` prerequisite was added to the README and installation instructions.
- Plugin version confirmed at the time of integration: **8.0.6**.

---

### v1.0.0 — initial release

- Express server (`server/`) with four routers: `orgs`, `connect`, `scan`, `history`.
- Five weighted analysis modules: Security & Access (30%), Automation & Flows (25%), Apex & Governor Limits (20%), Data Model & Architecture (15%), Metadata & Deployment (10%).
- Cloud Skills pass: three scored clouds (Sales Cloud, Service Cloud, CPQ/Revenue Cloud) and fourteen detect-only clouds detected via managed-package namespaces, user/permission-set licences, and sobject presence.
- Live REST API metrics: storage limits, Agentforce status, installed packages, Apex test coverage (org-wide and per-class), System Administrator user count, and user security signals (multi-country logins, API-only browser logins, stale users, never-logged-in users).
- React 19 + Vite browser UI with six dashboard tabs: Overview, Checks Performed, Findings, Cloud Skills, Action Plan, History.
- PDF report export (Overview + Checks + Findings + Cloud Skills + Action Plan).
- `start.sh` / `stop.sh` background launcher with auto-detection of production vs dev mode.
- Packaging script producing a self-contained tarball for distribution (`npm run package`).
- Persistent `history/{orgId}/{timestamp}.json` scan records — no database, no credentials on disk.
