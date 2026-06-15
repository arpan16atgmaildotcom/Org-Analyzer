const express = require("express");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { getOrgInfo, retrieveMetadata, getStorageLimits, getOrgFeatures, getApexCoverage, getSysAdminUserCount, getUserSecuritySignals, getCloudDetectionSignals } = require("../sfdx");
const runAnalysis = require("../analyzer/index");
const analyzeOrgCheck = require("../analyzer/orgcheck");
const { runAllOrgChecks } = require("../orgcheck");
const { isValidAlias } = require("../util/validate");

const router = express.Router();

// In-memory job store (local tool — no persistence needed for active jobs)
const jobs = {};

const ROOT = path.join(__dirname, "../../");
const ORGS_DIR = path.join(ROOT, "orgs");
const HISTORY_DIR = path.join(ROOT, "history");

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// POST /api/scan/start
router.post("/start", async (req, res) => {
  const { orgAlias } = req.body;
  if (!isValidAlias(orgAlias)) {
    return res.status(400).json({ error: "Invalid orgAlias. Use letters, digits, underscore, or hyphen (max 64 chars)." });
  }

  const runId = uuidv4();
  jobs[runId] = { status: "running", steps: [], result: null, error: null, orgAlias };

  res.json({ runId });

  // Run async — do not await
  runJob(runId, orgAlias).catch(err => {
    jobs[runId].status = "error";
    jobs[runId].error = err.message;
  });
});

async function runJob(runId, orgAlias) {
  const job = jobs[runId];

  function addStep(label, progress) {
    job.steps.push({ label, progress, ts: Date.now() });
  }

  try {
    addStep("Verifying org authentication…", 5);
    const orgInfo = await getOrgInfo(orgAlias);

    addStep("Preparing metadata output directory…", 10);
    const metaDir = path.join(ORGS_DIR, orgAlias, runId);
    ensureDir(metaDir);
    job.metaDir = metaDir;

    const isSandbox = orgInfo?.isSandbox ?? false;

    // Metadata retrieval, live org metrics, and OrgCheck tech-debt analysis all
    // talk directly to the org and are independent of each other — run them in
    // parallel. runAnalysis (below) is the only step that needs the populated
    // metaDir, so it waits for all three to finish first.
    addStep("Retrieving metadata from Salesforce org (this may take a few minutes)…", 15);
    addStep("Running OrgCheck tech debt analysis in parallel with metadata retrieval…", 16);

    const [
      _meta,
      storage, orgFeatures, coverage, sysAdminUsers, userSignals, orgSignals,
      orgCheckRaw,
    ] = await Promise.all([
      retrieveMetadata(orgAlias, metaDir, (msg) => {
        if (msg.trim()) addStep(`  ${msg.trim()}`, job.steps.length * 3);
      }, isSandbox),
      getStorageLimits(orgAlias).catch(() => null),
      getOrgFeatures(orgAlias).catch(() => null),
      getApexCoverage(orgAlias).catch(() => null),
      getSysAdminUserCount(orgAlias).catch(() => null),
      getUserSecuritySignals(orgAlias).catch(() => null),
      getCloudDetectionSignals(orgAlias).catch(() => null),
      runAllOrgChecks(orgAlias, (msg) => {
        if (msg.trim()) addStep(`  ${msg.trim()}`, job.steps.length * 2);
      }).catch(() => null),
    ]);

    const orgCheckResult = analyzeOrgCheck(orgCheckRaw);

    addStep("Running security checks…", 50);
    addStep("Analysing automation & flows…", 58);
    addStep("Scanning Apex classes for governor limit risks…", 64);
    addStep("Inspecting data model…", 70);
    addStep("Reviewing deployment metadata…", 75);

    const analysis = await runAnalysis(metaDir, (label) => {
      addStep(label, job.steps.length * 2);
    }, { coverage, sysAdminUsers, userSignals, orgFeatures, orgSignals, alias: orgAlias, orgCheckResult });

    addStep("Saving health report to history…", 95);

    const orgId = orgInfo?.id || orgInfo?.orgId || orgAlias;
    const historyOrgDir = path.join(HISTORY_DIR, orgId.replace(/[^a-zA-Z0-9_-]/g, "_"));
    ensureDir(historyOrgDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
    const historyFile = path.join(historyOrgDir, `${timestamp}.json`);

    const folderSize = getDirSize(metaDir);

    // Org block intended for the dashboard render. Includes instanceUrl so the
    // current session can show it; the persisted history record (below) drops
    // it to avoid fingerprinting the org topology in source control.
    const orgForUi = {
      id: orgId,
      alias: orgAlias,
      name: orgInfo?.name || orgInfo?.alias || orgAlias,
      edition: orgInfo?.edition || "Unknown",
      instanceUrl: orgInfo?.instanceUrl || "",
      apiVersion: orgInfo?.apiVersion || "",
      isSandbox: orgInfo?.isSandbox ?? false,
    };

    // Persisted features: keep only what the dashboard derives clouds from
    // (namespace) and the package count. Names + versions are dropped from
    // disk so old runs don't leak the installed-ISV inventory.
    const orgFeaturesForHistory = orgFeatures && {
      ...orgFeatures,
      packages: Array.isArray(orgFeatures.packages)
        ? orgFeatures.packages.map(p => ({ namespace: p.namespace || null }))
        : orgFeatures.packages,
    };

    // Persisted coverage: keep org-wide percent + summary counts; drop the
    // full per-class list to avoid bloating history files for orgs with
    // thousands of classes. Class names are still in actionItems.components
    // when the analyzer flags them.
    const coverageForHistory = coverage && {
      orgWidePercent: coverage.orgWidePercent,
      classCount: coverage.classes.length,
      lowCoverageCount: coverage.classes.filter(c => c.percent < 80).length,
    };

    // Cloud-skills summary for history. Per-cloud scores (or null for
    // detect-only) keep the dashboard's history view useful; full cloud
    // findings are already in actionItems[].
    const cloudScores = Object.fromEntries(
      (analysis.clouds || []).map(c => [c.id, c.score])
    );
    // Counts only — never raw licence inventories. Mirrors the
    // memory-vs-history split we use for `coverage` and `userSignals`.
    const cloudSignals = orgSignals && {
      userLicenseCount: orgSignals.userLicenses?.length ?? 0,
      permSetLicenseCount: orgSignals.permSetLicenses?.length ?? 0,
      experienceCloudSiteCount: orgSignals.networks?.length ?? 0,
      webStoreCount: orgSignals.webStores?.length ?? 0,
    };

    const historyRecord = {
      runId,
      timestamp: new Date().toISOString(),
      org: {
        id: orgId,
        alias: orgAlias,
        name: orgInfo?.name || orgInfo?.alias || orgAlias,
        edition: orgInfo?.edition || "Unknown",
        apiVersion: orgInfo?.apiVersion || "",
        isSandbox: orgInfo?.isSandbox ?? false,
      },
      score: analysis.summary.score,
      categoryScores: Object.fromEntries(
        analysis.categories.map(c => [c.id, c.score])
      ),
      cloudScores,
      cloudSignals,
      findingCounts: {
        critical: analysis.summary.critical,
        warning: analysis.summary.warning,
        info: analysis.summary.info,
      },
      actionItems: analysis.actionItems,
      storage,
      orgFeatures: orgFeaturesForHistory,
      coverage: coverageForHistory,
      sysAdminUsers,
      // Persist only counts: usernames + countries fingerprint individuals,
      // and the ones that matter are already stamped into actionItems[].components.
      userSignals: userSignals && {
        windowDays: userSignals.windowDays,
        activeStandardUserCount: userSignals.activeStandardUserCount,
        multiCountryLoginCount: userSignals.multiCountryLogins.length,
        apiOnlyBrowserLoginCount: userSignals.apiOnlyBrowserLogins.length,
        staleActiveUserCount: userSignals.staleActiveUsers.length,
        neverLoggedInUserCount: userSignals.neverLoggedInUsers.length,
      },
      metadataRetained: null,
      folderSizeBytes: folderSize,
      orgCheck: orgCheckResult ? {
        score: orgCheckResult.score,
        findingCounts: {
          critical: orgCheckResult.findings.filter(f => f.severity === "critical").length,
          warning:  orgCheckResult.findings.filter(f => f.severity === "warning").length,
          info:     orgCheckResult.findings.filter(f => f.severity === "info").length,
        },
        summary: orgCheckResult.summary,
      } : null,
    };

    fs.writeFileSync(historyFile, JSON.stringify(historyRecord, null, 2));
    job.historyFile = historyFile;
    job.historyRecord = historyRecord;

    job.result = {
      org: orgForUi,
      summary: analysis.summary,
      categories: analysis.categories,
      actionItems: analysis.actionItems,
      clouds: analysis.clouds,
      storage,
      orgFeatures,
      coverage,
      sysAdminUsers,
      userSignals,
      orgSignals,
      // Relative path so the cleanup screen has something readable to show
      // without leaking the user's absolute home directory.
      metaPath: path.relative(ROOT, metaDir),
      folderSizeBytes: folderSize,
      runId,
      orgCheckResult,
    };

    addStep("Health report complete.", 100);
    job.status = "done";

  } catch (err) {
    job.status = "error";
    job.error = err.message;
    addStep(`Error: ${err.message}`, 100);
  }
}

// GET /api/scan/status/:id  (SSE)
router.get("/status/:id", (req, res) => {
  const job = jobs[req.params.id];
  if (!job) return res.status(404).json({ error: "Job not found" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let sent = 0;

  const flush = () => {
    while (sent < job.steps.length) {
      const step = job.steps[sent];
      res.write(`data: ${JSON.stringify({ type: "step", ...step })}\n\n`);
      sent++;
    }
    if (job.status === "done" || job.status === "error") {
      res.write(`data: ${JSON.stringify({ type: job.status, error: job.error })}\n\n`);
      res.end();
      clearInterval(timer);
    }
  };

  const timer = setInterval(flush, 300);
  flush();

  req.on("close", () => clearInterval(timer));
});

// GET /api/scan/result/:id
router.get("/result/:id", (req, res) => {
  const job = jobs[req.params.id];
  if (!job) return res.status(404).json({ error: "Job not found" });
  if (job.status !== "done") return res.status(202).json({ status: job.status });
  res.json(job.result);
});

// DELETE /api/scan/:id  — keep=true|false
router.delete("/:id", async (req, res) => {
  const job = jobs[req.params.id];
  if (!job) return res.status(404).json({ error: "Job not found" });

  const keep = req.query.keep === "true";
  const metaDir = job.metaDir;

  if (!keep && metaDir && fs.existsSync(metaDir)) {
    fs.rmSync(metaDir, { recursive: true, force: true });
  }

  // Update history record with retention choice
  if (job.historyFile && fs.existsSync(job.historyFile)) {
    const record = JSON.parse(fs.readFileSync(job.historyFile, "utf8"));
    record.metadataRetained = keep;
    fs.writeFileSync(job.historyFile, JSON.stringify(record, null, 2));
  }

  delete jobs[req.params.id];
  res.json({ success: true, kept: keep });
});

function getDirSize(dir) {
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else total += fs.statSync(full).size;
    }
  }
  walk(dir);
  return total;
}

module.exports = router;
