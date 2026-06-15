const express = require("express");
const path = require("path");
const fs = require("fs");

const router = express.Router();
const HISTORY_DIR = path.join(__dirname, "../../history");

// Org IDs are written to disk after being scrubbed to [A-Za-z0-9_-] (see
// scan.js). Anything outside that set is a path-traversal attempt.
const ORG_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

// GET /api/history — list all orgs with run history
router.get("/", (req, res) => {
  if (!fs.existsSync(HISTORY_DIR)) return res.json({ orgs: [] });
  const orgDirs = fs.readdirSync(HISTORY_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  const orgs = orgDirs.map(orgDir => {
    const dir = path.join(HISTORY_DIR, orgDir);
    const runs = fs.readdirSync(dir)
      .filter(f => f.endsWith(".json"))
      .sort()
      .reverse()
      .map(f => {
        try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); }
        catch { return null; }
      })
      .filter(Boolean);
    return { orgDir, runs };
  }).filter(o => o.runs.length > 0);

  res.json({ orgs });
});

// GET /api/history/:orgId — runs for a specific org
router.get("/:orgId", (req, res) => {
  const { orgId } = req.params;
  if (!ORG_ID_REGEX.test(orgId)) {
    return res.status(400).json({ error: "Invalid orgId" });
  }
  const dir = path.join(HISTORY_DIR, orgId);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: "No history for this org" });

  const runs = fs.readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .sort()
    .reverse()
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); }
      catch { return null; }
    })
    .filter(Boolean);

  res.json({ runs });
});

module.exports = router;
