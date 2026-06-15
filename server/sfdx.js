const { execFile } = require("child_process");
const path = require("path");

function run(args) {
  return new Promise((resolve, reject) => {
    execFile("sf", [...args, "--json"], { maxBuffer: 50 * 1024 * 1024 }, (err, stdout) => {
      let parsed;
      try { parsed = JSON.parse(stdout); } catch { parsed = {}; }
      // sf CLI exits non-zero for some warnings — check result status instead
      if (parsed.status === 1 && !parsed.result) {
        reject(new Error(parsed.message || err?.message || "sf command failed"));
      } else {
        resolve(parsed.result ?? parsed);
      }
    });
  });
}

async function listOrgs() {
  const result = await run(["org", "list"]);
  const all = [
    ...(result?.nonScratchOrgs ?? []),
    ...(result?.scratchOrgs ?? []),
  ];
  return all.map(o => ({
    alias: o.alias || o.username,
    username: o.username,
    orgId: o.orgId,
    instanceUrl: o.instanceUrl,
    connectedStatus: o.connectedStatus,
    isSandbox: o.isSandbox ?? false,
  }));
}

async function loginWeb(alias) {
  // Opens browser for user to authenticate; sf manages the token
  return run(["org", "login", "web", "--alias", alias || "sf-org-analyzer-org"]);
}

async function getOrgInfo(alias) {
  return run(["org", "display", "--target-org", alias]);
}

function retrieveMetadata(alias, outputDir, onProgress, isSandbox = false) {
  const fs = require("fs");
  const { spawn } = require("child_process");

  // sf project retrieve start requires a valid SFDX project workspace.
  // Bootstrap one inside the run directory so sf never looks at the parent.
  const projectJson = {
    packageDirectories: [{ path: "force-app", default: true }],
    namespace: "",
    sfdcLoginUrl: isSandbox ? "https://test.salesforce.com" : "https://login.salesforce.com",
    sourceApiVersion: "62.0",
  };
  fs.mkdirSync(path.join(outputDir, "force-app"), { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, "sfdx-project.json"),
    JSON.stringify(projectJson, null, 2)
  );

  const metadataTypes = [
    "ApexClass", "ApexTrigger", "Flow", "FlowDefinition",
    "CustomObject", "CustomField", "Profile", "PermissionSet",
    "PermissionSetGroup",
    "WorkflowRule", "ConnectedApp", "ExperienceBundle",
    "ValidationRule", "RecordType",
  ];

  // Pass each type as a separate --metadata flag — sf CLI does not accept
  // a comma-joined string as a single argument value.
  const metadataFlags = metadataTypes.flatMap(t => ["--metadata", t]);
  const args = [
    "project", "retrieve", "start",
    "--target-org", alias,
    ...metadataFlags,
    "--json",
  ];

  return new Promise((resolve, reject) => {
    // Use spawn (not execFile) so stdout/stderr are streamed without a buffer limit.
    // cwd ensures sf resolves the workspace from outputDir, not the Node process cwd.
    const child = spawn("sf", args, { cwd: outputDir });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", d => { stdout += d.toString(); });
    child.stderr.on("data", d => {
      const chunk = d.toString();
      stderr += chunk;
      onProgress && onProgress(chunk);
    });

    child.on("error", err => reject(new Error(`sf CLI not found: ${err.message}`)));

    child.on("close", code => {
      let parsed = {};
      try { parsed = JSON.parse(stdout); } catch { /* stdout wasn't JSON */ }

      if (code !== 0 && !parsed.result) {
        // Prefer sf's own JSON error message over raw stderr/exit code noise
        const msg = parsed.message || stderr.trim() || `sf exited with code ${code}`;
        reject(new Error(msg));
      } else {
        resolve(parsed.result ?? parsed);
      }
    });
  });
}

async function getOrgFeatures(alias) {
  const https = require("https");

  const info = await getOrgInfo(alias);
  const instanceUrl = (info?.instanceUrl || "").replace(/\/$/, "");
  const accessToken = info?.accessToken;
  const apiVersion = info?.apiVersion || "62.0";

  if (!instanceUrl || !accessToken) return null;

  function restGet(urlPath) {
    return new Promise((resolve) => {
      const req = https.get(`${instanceUrl}${urlPath}`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      }, (res) => {
        let body = "";
        res.on("data", d => { body += d; });
        res.on("end", () => {
          try { resolve(JSON.parse(body)); } catch { resolve(null); }
        });
      });
      req.on("error", () => resolve(null));
      req.setTimeout(8000, () => { req.destroy(); resolve(null); });
    });
  }

  const enc = s => encodeURIComponent(s);

  // InstalledSubscriberPackage stores only foreign keys; name/namespace live on
  // the SubscriberPackage parent, and version components live on
  // SubscriberPackageVersion. Querying scalar fields like SubscriberPackageName
  // directly returns INVALID_FIELD.
  const pkgQuery =
    "SELECT Id,SubscriberPackage.Name,SubscriberPackage.NamespacePrefix," +
    "SubscriberPackageVersion.MajorVersion,SubscriberPackageVersion.MinorVersion," +
    "SubscriberPackageVersion.PatchVersion,SubscriberPackageVersion.BuildNumber " +
    "FROM InstalledSubscriberPackage";

  const [botResult, pkgResult] = await Promise.all([
    restGet(`/services/data/v${apiVersion}/tooling/query?q=${enc("SELECT Id,MasterLabel,Status FROM BotDefinition")}`).catch(() => null),
    restGet(`/services/data/v${apiVersion}/tooling/query?q=${enc(pkgQuery)}`).catch(() => null),
  ]);

  const allAgents = (botResult?.records || []).map(r => ({ name: r.MasterLabel, status: r.Status }));
  const agentforce = {
    enabled: allAgents.length > 0,
    activeCount: allAgents.filter(a => a.status === "Active").length,
    totalCount: allAgents.length,
  };

  function formatVersion(v) {
    if (!v) return null;
    const parts = [v.MajorVersion, v.MinorVersion, v.PatchVersion, v.BuildNumber]
      .filter(p => p !== null && p !== undefined);
    return parts.length ? parts.join(".") : null;
  }

  // Tooling API returns errors as a top-level array (no `records` key) — treat
  // that as "couldn't query" (null) rather than "no packages" (empty array).
  const packages = Array.isArray(pkgResult?.records)
    ? pkgResult.records
        .map(r => ({
          name: r.SubscriberPackage?.Name || r.SubscriberPackage?.NamespacePrefix || null,
          namespace: r.SubscriberPackage?.NamespacePrefix || null,
          version: formatVersion(r.SubscriberPackageVersion),
        }))
        .filter(p => p.name || p.namespace)
    : null;

  const NAMESPACE_TO_CLOUD = {
    SBQQ: "Salesforce CPQ / Revenue Cloud", sbqq: "Salesforce CPQ / Revenue Cloud",
    FSL: "Field Service Lightning",
    HealthCloud: "Health Cloud", HC: "Health Cloud",
    FSC: "Financial Services Cloud", FinServ: "Financial Services Cloud",
    EDA: "Education Cloud", HEDA: "Education Cloud",
    npsp: "Nonprofit Success Pack", npe: "Nonprofit Cloud", npo: "Nonprofit Cloud",
    OmniStudio: "OmniStudio", omnistudio: "OmniStudio",
    vlocity_cmt: "Communications Cloud", vlocity_ins: "Insurance Cloud", vlocity_ps: "Public Sector Solutions",
  };

  const seen = new Set(["Sales Cloud", "Service Cloud"]);
  const clouds = ["Sales Cloud", "Service Cloud"];
  if (packages) {
    for (const pkg of packages) {
      const cloud = NAMESPACE_TO_CLOUD[pkg.namespace];
      if (cloud && !seen.has(cloud)) { seen.add(cloud); clouds.push(cloud); }
    }
  }

  return { agentforce, clouds, packages };
}

// Fetch storage limits from the Salesforce REST /limits endpoint.
// Uses the access token that sf already holds — no credentials needed from us.
async function getStorageLimits(alias) {
  const https = require("https");

  const info = await getOrgInfo(alias);
  const instanceUrl = (info?.instanceUrl || "").replace(/\/$/, "");
  const accessToken = info?.accessToken;

  if (!instanceUrl || !accessToken) return null;

  const apiVersion = info?.apiVersion || "62.0";
  const url = `${instanceUrl}/services/data/v${apiVersion}/limits/`;

  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    }, (res) => {
      let body = "";
      res.on("data", d => { body += d; });
      res.on("end", () => {
        try {
          const limits = JSON.parse(body);
          // Pull the three storage limit keys
          const pick = (key) => {
            const l = limits[key];
            if (!l) return null;
            return { used: l.Used, max: l.Max, remaining: l.Max - l.Used };
          };
          resolve({
            dataStorage:       pick("DataStorageMB"),
            fileStorage:       pick("FileStorageMB"),
            bigObjectStorage:  pick("BigObjectStorageMB"),
          });
        } catch {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
  });
}

// Fetch Apex test-coverage data via the Tooling API.
//   ApexOrgWideCoverage      → single org-wide PercentCovered value
//   ApexCodeCoverageAggregate→ aggregated rows per class/trigger
// Returns null if the org blocks the call or returns a non-JSON body.
async function getApexCoverage(alias) {
  const https = require("https");

  const info = await getOrgInfo(alias);
  const instanceUrl = (info?.instanceUrl || "").replace(/\/$/, "");
  const accessToken = info?.accessToken;
  const apiVersion = info?.apiVersion || "62.0";

  if (!instanceUrl || !accessToken) return null;

  function restGet(urlPath) {
    return new Promise((resolve) => {
      const req = https.get(`${instanceUrl}${urlPath}`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      }, (res) => {
        let body = "";
        res.on("data", d => { body += d; });
        res.on("end", () => {
          try { resolve(JSON.parse(body)); } catch { resolve(null); }
        });
      });
      req.on("error", () => resolve(null));
      req.setTimeout(8000, () => { req.destroy(); resolve(null); });
    });
  }

  const enc = s => encodeURIComponent(s);
  const orgWideQuery = "SELECT PercentCovered FROM ApexOrgWideCoverage";
  const perClassQuery =
    "SELECT ApexClassOrTrigger.Name,NumLinesCovered,NumLinesUncovered " +
    "FROM ApexCodeCoverageAggregate";

  const [orgWideResult, perClassResult] = await Promise.all([
    restGet(`/services/data/v${apiVersion}/tooling/query?q=${enc(orgWideQuery)}`).catch(() => null),
    restGet(`/services/data/v${apiVersion}/tooling/query?q=${enc(perClassQuery)}`).catch(() => null),
  ]);

  // Tooling API returns errors as a top-level array (no `records` key); treat
  // that as "couldn't query" rather than "no coverage data".
  if (!Array.isArray(orgWideResult?.records) && !Array.isArray(perClassResult?.records)) {
    return null;
  }

  const orgWidePercent = Array.isArray(orgWideResult?.records) && orgWideResult.records.length > 0
    ? Number(orgWideResult.records[0].PercentCovered ?? 0)
    : null;

  const classes = Array.isArray(perClassResult?.records)
    ? perClassResult.records
        .map(r => {
          const covered = Number(r.NumLinesCovered ?? 0);
          const uncovered = Number(r.NumLinesUncovered ?? 0);
          const total = covered + uncovered;
          // Skip rows with zero executable lines — they pollute the "low
          // coverage" list with empty interfaces and trivial constants.
          if (total === 0) return null;
          // ApexClassOrTrigger.attributes.url tells us the actual sobject
          // type, so we can label triggers separately from classes.
          const url = r.ApexClassOrTrigger?.attributes?.url || "";
          const type = url.includes("/ApexTrigger/") ? "ApexTrigger" : "ApexClass";
          return {
            name: r.ApexClassOrTrigger?.Name || "Unknown",
            type,
            percent: Math.round((covered / total) * 100),
            coveredLines: covered,
            totalLines: total,
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.percent - b.percent)
    : [];

  return { orgWidePercent, classes };
}

// Count active users assigned to the standard "System Administrator" profile.
// Standard profiles cannot be renamed, so Profile.Name is a stable match.
// Uses the data API (not Tooling) — User is a regular sobject.
async function getSysAdminUserCount(alias) {
  const https = require("https");

  const info = await getOrgInfo(alias);
  const instanceUrl = (info?.instanceUrl || "").replace(/\/$/, "");
  const accessToken = info?.accessToken;
  const apiVersion = info?.apiVersion || "62.0";

  if (!instanceUrl || !accessToken) return null;

  const soql = "SELECT COUNT() FROM User WHERE Profile.Name = 'System Administrator' AND IsActive = true";
  const url = `${instanceUrl}/services/data/v${apiVersion}/query?q=${encodeURIComponent(soql)}`;

  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    }, (res) => {
      let body = "";
      res.on("data", d => { body += d; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          // SELECT COUNT() returns { totalSize, done, records: [] }
          if (typeof parsed?.totalSize === "number") resolve({ count: parsed.totalSize });
          else resolve(null);
        } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
  });
}

// User access hygiene signals derived from User + LoginHistory.
//
//   • multiCountryLogins  — users with logins from ≥3 distinct CountryIso codes
//                           in the last 30 days (credible suspicion line; 2 is
//                           normal for VPN / travel)
//   • apiOnlyBrowserLogin — users on API-only profiles who recorded an
//                           interactive UI login (LoginType = 'Application')
//   • staleActiveUsers    — Standard userType, active, real human profile,
//                           LastLoginDate older than 90 days
//   • neverLoggedIn       — Standard userType, active, real human profile,
//                           LastLoginDate null AND created >30 days ago
//                           (grace period for fresh provisioning)
//
// LoginHistory has a 180-day platform retention window; we read the last 30
// days to keep the response compact and the signal recent.
async function getUserSecuritySignals(alias) {
  const https = require("https");

  const info = await getOrgInfo(alias);
  const instanceUrl = (info?.instanceUrl || "").replace(/\/$/, "");
  const accessToken = info?.accessToken;
  const apiVersion = info?.apiVersion || "62.0";

  if (!instanceUrl || !accessToken) return null;

  function restGet(urlPath) {
    return new Promise((resolve) => {
      const req = https.get(`${instanceUrl}${urlPath}`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      }, (res) => {
        let body = "";
        res.on("data", d => { body += d; });
        res.on("end", () => {
          try { resolve(JSON.parse(body)); } catch { resolve(null); }
        });
      });
      req.on("error", () => resolve(null));
      req.setTimeout(10000, () => { req.destroy(); resolve(null); });
    });
  }

  const enc = s => encodeURIComponent(s);
  const userQuery =
    "SELECT Id, Username, Name, LastLoginDate, CreatedDate, UserType, Profile.Name " +
    "FROM User WHERE IsActive = true";
  const loginQuery =
    "SELECT UserId, LoginType, Status, CountryIso, Browser, LoginTime " +
    "FROM LoginHistory WHERE LoginTime = LAST_N_DAYS:30";

  const [userResult, loginResult] = await Promise.all([
    restGet(`/services/data/v${apiVersion}/query?q=${enc(userQuery)}`).catch(() => null),
    restGet(`/services/data/v${apiVersion}/query?q=${enc(loginQuery)}`).catch(() => null),
  ]);

  if (!Array.isArray(userResult?.records)) return null;

  // Salesforce caps query responses at 2000 records; for large orgs we'd need
  // to chase nextRecordsUrl. Acceptable trade-off for v1: most orgs scanned
  // by this tool fit comfortably under that.
  const users = userResult.records;
  const logins = Array.isArray(loginResult?.records) ? loginResult.records : [];

  // API-only profiles are conventionally named with "integration" or "api only"
  // tokens. We also include the standard analytics integration/security user
  // profiles which Salesforce ships pre-flagged as non-interactive.
  const API_ONLY_PROFILE_RE = /\b(integration|api[\s_-]?only|analytics cloud (integration|security) user)\b/i;
  const isApiOnlyProfile = (name) => !!name && API_ONLY_PROFILE_RE.test(name);

  // Restrict the human-login checks to Standard userType. AutomatedProcess /
  // CloudIntegrationUser / Guest / CsnOnly are platform-managed and don't
  // represent licensable seats users would log into.
  const isHumanCandidate = (u) => u.UserType === "Standard" && !isApiOnlyProfile(u.Profile?.Name);

  const userById = new Map(users.map(u => [u.Id, u]));

  // ── Multi-country logins ────────────────────────────────────────────────
  const countriesByUser = new Map();
  for (const l of logins) {
    if (l.Status !== "Success" || !l.CountryIso) continue;
    if (!countriesByUser.has(l.UserId)) countriesByUser.set(l.UserId, new Set());
    countriesByUser.get(l.UserId).add(l.CountryIso);
  }
  const multiCountryLogins = [];
  for (const [userId, countries] of countriesByUser) {
    if (countries.size >= 3) {
      const u = userById.get(userId);
      multiCountryLogins.push({
        username: u?.Username || userId,
        countries: [...countries].sort(),
      });
    }
  }

  // ── API-only user with browser/UI login ─────────────────────────────────
  // 'Application' is the form-post UI login. OAuth logins (sf CLI, JWT bearer,
  // refresh-token flows) report as 'Remote Access 2.0' and are expected for
  // API-only users, so we don't flag those.
  const apiOnlyBrowserLogins = [];
  const apiOnlyUserIds = new Set(users.filter(u => isApiOnlyProfile(u.Profile?.Name)).map(u => u.Id));
  const seenApiOnlyHits = new Set();
  for (const l of logins) {
    if (!apiOnlyUserIds.has(l.UserId)) continue;
    if (l.LoginType !== "Application") continue;
    if (seenApiOnlyHits.has(l.UserId)) continue;
    seenApiOnlyHits.add(l.UserId);
    const u = userById.get(l.UserId);
    apiOnlyBrowserLogins.push({
      username: u?.Username || l.UserId,
      profile: u?.Profile?.Name || "Unknown",
    });
  }

  // ── Stale / never-logged-in active users ────────────────────────────────
  const STALE_DAYS = 90;
  const NEVER_GRACE_DAYS = 30;
  const now = Date.now();
  const staleActiveUsers = [];
  const neverLoggedInUsers = [];

  for (const u of users) {
    if (!isHumanCandidate(u)) continue;
    const created = u.CreatedDate ? Date.parse(u.CreatedDate) : NaN;
    if (!u.LastLoginDate) {
      // Skip users freshly provisioned in the last NEVER_GRACE_DAYS — they
      // haven't had a fair chance to log in yet.
      if (Number.isFinite(created) && (now - created) / 86400000 < NEVER_GRACE_DAYS) continue;
      neverLoggedInUsers.push({ username: u.Username, profile: u.Profile?.Name || "Unknown" });
    } else {
      const last = Date.parse(u.LastLoginDate);
      const daysSince = Math.floor((now - last) / 86400000);
      if (daysSince >= STALE_DAYS) {
        staleActiveUsers.push({
          username: u.Username,
          profile: u.Profile?.Name || "Unknown",
          daysSinceLogin: daysSince,
        });
      }
    }
  }
  // Worst offenders first
  staleActiveUsers.sort((a, b) => b.daysSinceLogin - a.daysSinceLogin);

  return {
    windowDays: 30,
    multiCountryLogins,
    apiOnlyBrowserLogins,
    staleActiveUsers,
    neverLoggedInUsers,
    activeStandardUserCount: users.filter(isHumanCandidate).length,
  };
}

// Shared Tooling REST primitive for cloud / feature checks. Returns the parsed
// JSON response body, or null on auth failure / network error / non-JSON body.
// Cloud modules call this instead of duplicating the https.get + bearer-auth
// + 8s-timeout boilerplate. Use { tooling: false } to hit the data API instead
// of the Tooling API (some sobjects like AssignmentRule + DuplicateRule live
// only on Tooling, but business-data sobjects like Account live on data).
async function toolingQuery(alias, soql, opts = {}) {
  const https = require("https");
  const tooling = opts.tooling !== false;

  const info = await getOrgInfo(alias);
  const instanceUrl = (info?.instanceUrl || "").replace(/\/$/, "");
  const accessToken = info?.accessToken;
  const apiVersion = info?.apiVersion || "62.0";

  if (!instanceUrl || !accessToken) return null;

  const apiPath = tooling ? "tooling/query" : "query";
  const url = `${instanceUrl}/services/data/v${apiVersion}/${apiPath}?q=${encodeURIComponent(soql)}`;

  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    }, (res) => {
      let body = "";
      res.on("data", d => { body += d; });
      res.on("end", () => {
        try { resolve(JSON.parse(body)); } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
  });
}

// Multi-signal cloud detection. Today's `getOrgFeatures` only catches
// managed-package clouds (CPQ, FSL, NPSP, OmniStudio, vlocity). Native
// industry clouds (modern Health Cloud, FSC), licence-only clouds (Service
// Cloud Voice, Sales Engagement, CRM Analytics), Experience Cloud, and
// Commerce all need different signals.
//
// Returns four parallel queries:
//   userLicenses    — active UserLicense rows (Salesforce, Service Cloud, …)
//   permSetLicenses — active PermissionSetLicense rows (Voice, Tableau, …)
//   networks        — Experience Cloud sites (formerly Communities)
//   webStores       — Commerce B2B/B2C storefronts
//
// Every query is wrapped in try/catch returning [] on failure: WebStore /
// Network 404 cleanly on orgs that don't have those features enabled, and
// that's correct, not an error.
async function getCloudDetectionSignals(alias) {
  const userLicenseQuery =
    "SELECT Name, Status, TotalLicenses, UsedLicenses FROM UserLicense WHERE Status = 'Active'";
  const permSetLicenseQuery =
    "SELECT DeveloperName, MasterLabel, Status FROM PermissionSetLicense WHERE Status = 'Active'";
  const networkQuery = "SELECT Id, Name, Status FROM Network";
  const webStoreQuery = "SELECT Id, Name, Type FROM WebStore";

  const [ul, psl, net, ws] = await Promise.all([
    toolingQuery(alias, userLicenseQuery, { tooling: false }).catch(() => null),
    toolingQuery(alias, permSetLicenseQuery, { tooling: false }).catch(() => null),
    toolingQuery(alias, networkQuery, { tooling: false }).catch(() => null),
    toolingQuery(alias, webStoreQuery, { tooling: false }).catch(() => null),
  ]);

  const recordsOf = (r) => (Array.isArray(r?.records) ? r.records : []);

  return {
    userLicenses: recordsOf(ul).map(r => ({
      name: r.Name,
      status: r.Status,
      total: r.TotalLicenses,
      used: r.UsedLicenses,
    })),
    permSetLicenses: recordsOf(psl).map(r => ({
      developerName: r.DeveloperName,
      label: r.MasterLabel,
      status: r.Status,
    })),
    networks: recordsOf(net).map(r => ({ id: r.Id, name: r.Name, status: r.Status })),
    webStores: recordsOf(ws).map(r => ({ id: r.Id, name: r.Name, type: r.Type })),
  };
}

module.exports = { listOrgs, loginWeb, getOrgInfo, retrieveMetadata, getStorageLimits, getOrgFeatures, getApexCoverage, getSysAdminUserCount, getUserSecuritySignals, toolingQuery, getCloudDetectionSignals };
