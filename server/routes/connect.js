const express = require("express");
const { spawn } = require("child_process");
const { v4: uuidv4 } = require("uuid");
const { isValidAlias } = require("../util/validate");

const router = express.Router();

// In-memory login job store
const logins = {};

// POST /api/connect  { alias, isSandbox }
// Spawns sf org login web in the background and returns immediately.
// The browser OAuth flow can take 30–120s; we never block the HTTP request.
//
// `isSandbox` controls --instance-url: sandboxes authenticate against
// test.salesforce.com; production / dev orgs use login.salesforce.com (sf's
// default, so we omit the flag in that case).
router.post("/", (req, res) => {
  const alias = (req.body.alias || "").trim();
  const isSandbox = req.body.isSandbox === true;
  if (!isValidAlias(alias)) {
    return res.status(400).json({ error: "Invalid alias. Use letters, digits, underscore, or hyphen (max 64 chars)." });
  }

  // Kill any still-pending sf children before starting a new one — they bind
  // port 1717 for the OAuth redirect, and a stale child blocks the next login
  // with "Cannot start the OAuth redirect server on port 1717."
  for (const [id, rec] of Object.entries(logins)) {
    if (rec.status === "pending" && rec.child && !rec.child.killed) {
      try { rec.child.kill("SIGTERM"); } catch { /* ignore */ }
      logins[id] = { status: "error", error: "Superseded by new login attempt" };
    }
  }

  const loginId = uuidv4();

  const args = ["org", "login", "web", "--alias", alias, "--json"];
  if (isSandbox) args.push("--instance-url", "https://test.salesforce.com");

  // Spawn without waiting — sf opens the system browser for the user to log in
  const child = spawn("sf", args, {
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  logins[loginId] = { status: "pending", error: null, child };

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", d => { stdout += d.toString(); });
  child.stderr.on("data", d => { stderr += d.toString(); });

  child.on("close", (code, signal) => {
    let parsed = {};
    try { parsed = JSON.parse(stdout); } catch { /* ignore */ }

    // Preserve a "cancelled / superseded" status set before close fired
    const prior = logins[loginId];
    if (prior?.status === "error" && prior.error) {
      logins[loginId] = { status: "error", error: prior.error };
    } else if (code === 0 || parsed.status === 0) {
      logins[loginId] = { status: "success", error: null };
    } else if (signal === "SIGTERM") {
      logins[loginId] = { status: "error", error: "Login cancelled" };
    } else {
      let msg = parsed.message || stderr.trim() || `sf exited with code ${code}`;
      if (/port 1717/i.test(msg)) {
        msg += " — close any other browser tab still on the Salesforce login page, or run `pkill -f \"sf org login\"` and try again.";
      }
      logins[loginId] = { status: "error", error: msg };
    }

    // Clean up after 10 min
    setTimeout(() => delete logins[loginId], 10 * 60 * 1000);
  });

  res.json({ loginId });
});

// DELETE /api/connect/:loginId — cancel a pending login by killing the sf child
router.delete("/:loginId", (req, res) => {
  const login = logins[req.params.loginId];
  if (!login) return res.status(404).json({ error: "Login session not found" });
  if (login.child && !login.child.killed) {
    try { login.child.kill("SIGTERM"); } catch { /* ignore */ }
  }
  logins[req.params.loginId] = { status: "error", error: "Login cancelled" };
  res.json({ ok: true });
});

// GET /api/connect/status/:loginId
router.get("/status/:loginId", (req, res) => {
  const login = logins[req.params.loginId];
  if (!login) return res.status(404).json({ error: "Login session not found" });
  // Don't serialise the ChildProcess handle — only the polled fields
  res.json({ status: login.status, error: login.error });
});

module.exports = router;
