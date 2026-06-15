const registry = require("./registry");

// Cloud-skills orchestrator. For each registered cloud module:
//   1. Run its `detect({ orgFeatures, orgSignals })` predicate.
//      Skipped clouds drop out entirely — they don't appear in the dashboard.
//   2. If detected and the module exports `run`, invoke it with (metaDir, ctx)
//      and collect { score, findings }.
//   3. If detected but no `run`, emit a detect-only entry with score=null so
//      the UI can render a "Detection only" card.
//
// All `run` calls execute in Promise.all so total scan time stays flat as
// the registry grows. Cloud findings are returned in module shape; the
// top-level analyzer is responsible for tagging them with `source: "cloud:<id>"`
// before they flow into actionItems.
module.exports = async function runCloudChecks(metaDir, ctx = {}) {
  const orgFeatures = ctx.orgFeatures || null;
  const orgSignals = ctx.orgSignals || null;

  const detected = registry.filter(mod => {
    try { return mod.detect({ orgFeatures, orgSignals }); }
    catch { return false; }
  });

  const results = await Promise.all(detected.map(async mod => {
    if (typeof mod.run !== "function") {
      const detectOnly = await safeDetectOnly(mod, { orgFeatures, orgSignals });
      return {
        id: mod.id,
        label: mod.label,
        icon: mod.icon,
        score: null,
        scoredChecks: 0,
        findings: detectOnly.findings,
      };
    }
    let outcome;
    try {
      outcome = await mod.run(metaDir, { orgFeatures, orgSignals, alias: ctx.alias });
    } catch (err) {
      outcome = {
        score: null,
        scoredChecks: 0,
        findings: [{
          severity: "info",
          title: `${mod.label} check failed to run`,
          description: err.message,
          action: "Re-run the scan; if the failure persists the org may not have permissions for this check.",
          components: [],
        }],
      };
    }
    return {
      id: mod.id,
      label: mod.label,
      icon: mod.icon,
      score: outcome.score ?? null,
      scoredChecks: outcome.scoredChecks ?? 0,
      findings: outcome.findings || [],
    };
  }));

  return { clouds: results };
};

// Detect-only modules can optionally export an `info({ orgFeatures, orgSignals })`
// helper that returns a single info finding (e.g. "12 of 25 Service Cloud Voice
// licences in use"). Falling back to an empty findings list keeps the card
// clean when no info-level data is available.
async function safeDetectOnly(mod, ctx) {
  if (typeof mod.info !== "function") return { findings: [] };
  try {
    const f = await mod.info(ctx);
    return { findings: Array.isArray(f) ? f : (f ? [f] : []) };
  } catch {
    return { findings: [] };
  }
}
