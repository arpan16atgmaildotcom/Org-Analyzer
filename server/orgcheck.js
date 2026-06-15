const { execFile } = require("child_process");

// Run `sf check <subcommand> --target-org <alias> --json --accept-the-terms`.
// Timeout is 10 minutes — OrgCheck can take several minutes on large orgs.
// --accept-the-terms (-y) is required on production orgs.
function runOrgCheckCommand(alias, subcommand) {
  return new Promise((resolve, reject) => {
    const args = [
      "check", subcommand,
      "--target-org", alias,
      "--accept-the-terms",
      "--json",
    ];
    execFile(
      "sf", args,
      { maxBuffer: 100 * 1024 * 1024, timeout: 600_000 },
      (err, stdout) => {
        let parsed;
        try { parsed = JSON.parse(stdout); } catch { parsed = {}; }
        if (parsed.status === 1 && !parsed.result) {
          reject(new Error(parsed.message || err?.message || `sf check ${subcommand} failed`));
        } else {
          resolve(parsed.result ?? parsed);
        }
      }
    );
  });
}

// Run all four OrgCheck analysis commands:
//  1. clear-all-cache  — flush stale cache so results are fresh (no output)
//  2. global-view      — org-wide tech debt summary across all metadata types
//  3. apex-classes     — per-class tech debt metrics
//  4. hardcoded-urls   — salesforce.com / force.com URLs embedded in metadata
//  5. run-all-tests    — full Apex test run (may be slow; errors are swallowed)
//
// Commands 2–5 run in parallel after the cache clear. allSettled ensures a
// slow or failing command never blocks the others.
async function runAllOrgChecks(alias, onProgress) {
  onProgress && onProgress("OrgCheck: clearing local cache…");
  await runOrgCheckCommand(alias, "clear-all-cache").catch(() => null);

  onProgress && onProgress("OrgCheck: running global view, Apex classes, hardcoded URLs, tests…");

  const [globalView, apexClasses, hardcodedUrls, runAllTests] = await Promise.allSettled([
    runOrgCheckCommand(alias, "global-view"),
    runOrgCheckCommand(alias, "apex-classes"),
    runOrgCheckCommand(alias, "hardcoded-urls"),
    runOrgCheckCommand(alias, "run-all-tests"),
  ]);

  const val  = s => s.status === "fulfilled" ? s.value  : null;
  const err  = s => s.status === "rejected"  ? (s.reason?.message || "Command failed") : null;

  return {
    globalView:    val(globalView),
    apexClasses:   val(apexClasses),
    hardcodedUrls: val(hardcodedUrls),
    runAllTests:   val(runAllTests),
    errors: {
      globalView:    err(globalView),
      apexClasses:   err(apexClasses),
      hardcodedUrls: err(hardcodedUrls),
      runAllTests:   err(runAllTests),
    },
  };
}

module.exports = { runAllOrgChecks };
