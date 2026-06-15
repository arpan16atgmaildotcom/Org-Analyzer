const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");

const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: true });

function globFiles(dir, ext) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(ext)) results.push(full);
    }
  }
  walk(dir);
  return results;
}

function hasSoqlInLoop(source) {
  const loopRegex = /\b(for|while)\s*\([^)]*\)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/gs;
  const soqlRegex = /\[\s*SELECT\b/i;
  let match;
  while ((match = loopRegex.exec(source)) !== null) {
    if (soqlRegex.test(match[2])) return true;
  }
  return false;
}

module.exports = async function checkApex(metaDir, ctx = {}) {
  const findings = [];
  const apexDir = path.join(metaDir, "force-app", "main", "default", "classes");
  const clsFiles = globFiles(apexDir, ".cls");

  if (clsFiles.length === 0) {
    return {
      score: 100,
      findings: [{
        severity: "info",
        title: "No Apex Classes Retrieved",
        description: "No Apex class files found in the retrieved metadata.",
        action: "Ensure ApexClass is included in the retrieve metadata types if Apex analysis is needed.",
        components: [],
      }],
    };
  }

  // ── SOQL in loops ─────────────────────────────────────────────────────────
  const soqlInLoopClasses = [];
  for (const f of clsFiles) {
    const source = fs.readFileSync(f, "utf8");
    if (hasSoqlInLoop(source)) soqlInLoopClasses.push(path.basename(f, ".cls"));
  }

  if (soqlInLoopClasses.length > 0) {
    findings.push({
      severity: "critical",
      title: `SOQL in Loops in ${soqlInLoopClasses.length} Apex Class(es)`,
      description: `Classes with SOQL inside loops — risk of hitting governor limits at scale.`,
      action: "Refactor to collect IDs in the loop, then query once outside the loop using a Map pattern.",
      components: soqlInLoopClasses,
    });
  }

  // ── API version staleness ─────────────────────────────────────────────────
  const metaFiles = globFiles(apexDir, ".cls-meta.xml");
  const staleClasses = [];
  for (const f of metaFiles) {
    try {
      const doc = parser.parse(fs.readFileSync(f, "utf8"));
      const version = parseFloat(doc?.ApexClass?.apiVersion ?? doc?.apiVersion ?? 0);
      if (version > 0 && version < 55)
        staleClasses.push(path.basename(f, ".cls-meta.xml"));
    } catch { /* skip */ }
  }

  if (staleClasses.length > 0) {
    findings.push({
      severity: "warning",
      title: `${staleClasses.length} Apex Class(es) on API Version < 55.0`,
      description: `${staleClasses.length} of ${metaFiles.length} classes reference API versions below v55 and may lose platform support.`,
      action: "Update apiVersion in each .cls-meta.xml to the current API version, test, and redeploy.",
      components: staleClasses,
    });
  }

  // ── Triggers ──────────────────────────────────────────────────────────────
  const triggerDir = path.join(metaDir, "force-app", "main", "default", "triggers");
  const triggerFiles = globFiles(triggerDir, ".trigger");
  const triggerNames = triggerFiles.map(f => path.basename(f, ".trigger"));

  if (triggerNames.length > 10) {
    findings.push({
      severity: "warning",
      title: `${triggerNames.length} Apex Triggers — High Volume`,
      description: "Large trigger count increases risk of conflicting logic and order-of-execution issues.",
      action: "Consider a Trigger Framework (one trigger per object, handler pattern) to centralise trigger logic.",
      components: triggerNames,
    });
  }

  // ── Test coverage ─────────────────────────────────────────────────────────
  // Only available when the live REST helper succeeded (Tooling API access +
  // tests have been run at least once in this org). Salesforce blocks
  // production deploys below 75% org-wide; the per-class 80% threshold is the
  // industry-standard "healthy" floor.
  const coverage = ctx.coverage;
  if (coverage) {
    const orgPct = coverage.orgWidePercent;
    if (orgPct !== null && orgPct < 75) {
      findings.push({
        severity: "critical",
        title: `Org-Wide Apex Coverage Below 75% (${orgPct}%)`,
        description: "Salesforce blocks production deploys when org-wide test coverage falls below 75%. New deployments will fail.",
        action: "Add tests for the lowest-coverage classes first. See the affected components list for classes below 80%.",
        components: [],
      });
    } else if (orgPct !== null && orgPct < 80) {
      findings.push({
        severity: "warning",
        title: `Org-Wide Apex Coverage Below 80% (${orgPct}%)`,
        description: "Org-wide coverage is above the 75% deploy threshold but below the recommended 80% healthy floor.",
        action: "Add unit tests for the lowest-coverage classes to build a safety margin above the deploy threshold.",
        components: [],
      });
    }

    const lowClasses = coverage.classes.filter(c => c.percent < 80);
    if (lowClasses.length > 0) {
      // Stamp class names with their percent for richer display, e.g.
      // "MyService (42%)". Sorted ascending so the worst offenders surface first.
      const labelled = lowClasses.map(c => `${c.name} (${c.percent}%)`);
      findings.push({
        severity: "warning",
        title: `${lowClasses.length} Apex Class(es)/Trigger(s) Below 80% Coverage`,
        description: `${lowClasses.length} of ${coverage.classes.length} tested classes/triggers fall below the 80% recommended coverage threshold.`,
        action: "Prioritise the lowest-coverage classes in the list below and add focused unit tests for uncovered branches.",
        components: labelled,
      });
    }

    if (coverage.classes.length === 0 && orgPct === null) {
      findings.push({
        severity: "info",
        title: "No Apex Test Coverage Data Available",
        description: "The org has not run Apex tests recently, or coverage data has not been computed.",
        action: "Run all tests with `sf apex run test --code-coverage` to populate coverage data, then re-scan.",
        components: [],
      });
    }
  }

  const critCount = findings.filter(f => f.severity === "critical").length;
  const warnCount = findings.filter(f => f.severity === "warning").length;
  const score = Math.max(0, 100 - critCount * 25 - warnCount * 10);
  return { score: Math.min(100, score), findings };
};
