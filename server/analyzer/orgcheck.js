// Normalize raw OrgCheck JSON output into the standard findings shape used
// by the rest of the analyzer. OrgCheck returns nested result structures that
// vary per command — this module extracts the useful signals and maps them to
// { severity, title, description, action, components[] } objects.

// ── Helpers ────────────────────────────────────────────────────────────────

// OrgCheck wraps its output in a `records` array most of the time; some
// commands use `data` or return the array at the top level directly.
function extractRecords(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.records)) return raw.records;
  if (Array.isArray(raw.data))    return raw.data;
  if (raw.result && Array.isArray(raw.result)) return raw.result;
  return [];
}

// Pick a string from several candidate paths, return the first non-empty one.
function pick(obj, ...keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

// ── Global View ─────────────────────────────────────────────────────────────
// global-view returns high-level counts per metadata type with `badCount` /
// `totalCount` / `errorCount` columns. We surface anything with badCount > 0
// as a warning finding, and flag null/error entries as info.
function analyzeGlobalView(raw) {
  const findings = [];
  const records = extractRecords(raw);

  const badItems = [];
  for (const rec of records) {
    const type  = pick(rec, "type", "label", "name", "metadataType") || "Unknown type";
    const bad   = Number(rec.badCount ?? rec.bad ?? rec.issueCount ?? 0);
    const total = Number(rec.totalCount ?? rec.total ?? rec.count ?? 0);

    if (bad > 0) {
      badItems.push(`${type} (${bad}/${total} items)`);
    }
  }

  if (badItems.length > 0) {
    findings.push({
      severity: "warning",
      title: `OrgCheck Global View: Tech Debt Detected Across ${badItems.length} Metadata Type(s)`,
      description: `OrgCheck found issues in ${badItems.length} metadata type(s) out of ${records.length} scanned. These are items that violate best practices as detected by OrgCheck's global analysis.`,
      action: "Review the OrgCheck Tech Debt tab for the full breakdown by type. Prioritise types with the highest bad/total ratio.",
      components: badItems,
    });
  } else if (records.length > 0) {
    findings.push({
      severity: "info",
      title: "OrgCheck Global View: No Tech Debt Detected",
      description: `OrgCheck scanned ${records.length} metadata type(s) and found no items violating best practices.`,
      action: "No action required.",
      components: [],
    });
  }

  // Summary counts for the overview panel
  const totalBad   = records.reduce((s, r) => s + Number(r.badCount   ?? r.bad         ?? r.issueCount ?? 0), 0);
  const totalItems = records.reduce((s, r) => s + Number(r.totalCount ?? r.total        ?? r.count      ?? 0), 0);

  return { findings, summary: { scannedTypes: records.length, totalBad, totalItems } };
}

// ── Apex Classes ────────────────────────────────────────────────────────────
// apex-classes returns one row per Apex class with numeric debt metrics.
// We surface classes that have any score (lower is better — OrgCheck uses
// 0 = no debt) or any explicitly flagged issues.
function analyzeApexClasses(raw) {
  const findings = [];
  const records = extractRecords(raw);
  if (!records.length) return { findings };

  // Collect classes that OrgCheck considers "bad" — use the `isBad`, `score`,
  // or presence of any flagged sub-metrics.
  const debtClasses = records.filter(r => {
    if (r.isBad === true) return true;
    const score = Number(r.score ?? r.techDebtScore ?? r.debtScore ?? -1);
    if (score > 0) return true;
    // Some versions expose individual boolean flags
    const flags = [
      r.hasNoExplicitSharing, r.hasNoDmlOperationBulkSafe, r.hasNoSoqlBulkSafe,
      r.isDeprecated, r.hasHardcodedUrl, r.hasNoDescription,
    ];
    return flags.some(Boolean);
  });

  if (debtClasses.length === 0) {
    findings.push({
      severity: "info",
      title: "OrgCheck Apex Classes: No Tech Debt Found",
      description: `OrgCheck analysed ${records.length} Apex class(es) and found no tech-debt violations.`,
      action: "No action required.",
      components: [],
    });
    return { findings };
  }

  // Group by debt sub-type to give actionable findings
  const noSharing     = debtClasses.filter(r => r.hasNoExplicitSharing);
  const noBulkSafe    = debtClasses.filter(r => r.hasNoDmlOperationBulkSafe || r.hasNoSoqlBulkSafe);
  const deprecated    = debtClasses.filter(r => r.isDeprecated);
  const hardcoded     = debtClasses.filter(r => r.hasHardcodedUrl);
  const noDescription = debtClasses.filter(r => r.hasNoDescription);
  const other         = debtClasses.filter(r =>
    !r.hasNoExplicitSharing && !r.hasNoDmlOperationBulkSafe && !r.hasNoSoqlBulkSafe &&
    !r.isDeprecated && !r.hasHardcodedUrl && !r.hasNoDescription
  );

  const name = r => pick(r, "name", "label", "fullName", "id") || "Unknown";

  if (noSharing.length > 0) {
    findings.push({
      severity: "warning",
      title: `OrgCheck Apex: ${noSharing.length} Class(es) Without Explicit Sharing Declaration`,
      description: "Classes without `with sharing` or `without sharing` inherit the caller's context, which can inadvertently expose records beyond the user's sharing access.",
      action: "Add an explicit `with sharing` declaration to each affected class. Use `without sharing` only where intentional data elevation is required and documented.",
      components: noSharing.map(name),
    });
  }

  if (noBulkSafe.length > 0) {
    findings.push({
      severity: "warning",
      title: `OrgCheck Apex: ${noBulkSafe.length} Class(es) Not Bulk-Safe (DML or SOQL)`,
      description: "Classes flagged by OrgCheck as not bulk-safe perform DML or SOQL in a way that risks hitting governor limits when called from bulk context (e.g. from a Flow or Data Loader).",
      action: "Refactor affected classes to move SOQL outside loops and batch DML using List/Map patterns. Run with large test data volumes to verify.",
      components: noBulkSafe.map(name),
    });
  }

  if (deprecated.length > 0) {
    findings.push({
      severity: "warning",
      title: `OrgCheck Apex: ${deprecated.length} Deprecated Class(es) Still Active`,
      description: "These Apex classes are marked deprecated but are still active and being detected by OrgCheck. Deprecated classes add noise to the codebase and can mask real issues in coverage metrics.",
      action: "Review each deprecated class — delete if unused, or remove the @deprecated annotation if still needed.",
      components: deprecated.map(name),
    });
  }

  if (hardcoded.length > 0) {
    findings.push({
      severity: "warning",
      title: `OrgCheck Apex: ${hardcoded.length} Class(es) Contain Hardcoded URLs`,
      description: "Apex classes containing hardcoded Salesforce URLs (salesforce.com, force.com) are environment-coupled — the same code won't work across production and sandbox without manual edits.",
      action: "Replace hardcoded URLs with Custom Settings, Custom Metadata, or Named Credentials. Use $Network.ProtocolAndHost in LWC for UI references.",
      components: hardcoded.map(name),
    });
  }

  if (noDescription.length > 0) {
    findings.push({
      severity: "info",
      title: `OrgCheck Apex: ${noDescription.length} Class(es) Missing Description`,
      description: "These classes have no ApexDoc description. While not a functional risk, undocumented classes increase onboarding time and maintenance cost.",
      action: "Add a one-line ApexDoc comment (`/** ... */`) to each class describing its purpose and main collaborators.",
      components: noDescription.map(name),
    });
  }

  if (other.length > 0) {
    findings.push({
      severity: "warning",
      title: `OrgCheck Apex: ${other.length} Class(es) Flagged with Tech Debt`,
      description: "OrgCheck flagged these classes for tech debt. Review each class in the OrgCheck Tech Debt tab for the specific violation breakdown.",
      action: "Open the OrgCheck Tech Debt tab, filter by Apex Classes, and address each flagged class in order of debt score.",
      components: other.map(name),
    });
  }

  return { findings };
}

// ── Hardcoded URLs ──────────────────────────────────────────────────────────
// hardcoded-urls returns one row per component that contains a salesforce.com
// or force.com URL. Group by metadata type for a cleaner finding.
function analyzeHardcodedUrls(raw) {
  const findings = [];
  const records = extractRecords(raw);
  if (!records.length) {
    findings.push({
      severity: "info",
      title: "OrgCheck Hardcoded URLs: None Found",
      description: "OrgCheck scanned all supported metadata types and found no hardcoded Salesforce URLs.",
      action: "No action required.",
      components: [],
    });
    return { findings };
  }

  // Group by metadata type
  const byType = {};
  for (const r of records) {
    const type = pick(r, "type", "metadataType", "componentType") || "Unknown";
    if (!byType[type]) byType[type] = [];
    const label = pick(r, "name", "label", "fullName", "id") || "Unknown";
    const url   = pick(r, "url", "hardcodedUrl", "value");
    byType[type].push(url ? `${label} → ${url}` : label);
  }

  for (const [type, components] of Object.entries(byType)) {
    findings.push({
      severity: "warning",
      title: `OrgCheck Hardcoded URLs: ${components.length} ${type} Component(s)`,
      description: `${components.length} ${type} component(s) contain hardcoded Salesforce URLs (salesforce.com, force.com). These URLs break when moving metadata between environments.`,
      action: "Replace hardcoded URLs with environment-aware references: Custom Metadata for configuration values, Named Credentials for endpoint URLs, $Network.ProtocolAndHost for UI references in LWC.",
      components,
    });
  }

  return { findings };
}

// ── Run All Tests ────────────────────────────────────────────────────────────
// run-all-tests runs the full Apex test suite and returns aggregate pass/fail
// counts. Surface failures as critical, warnings when tests were skipped.
function analyzeRunAllTests(raw) {
  const findings = [];
  if (!raw) return { findings };

  // OrgCheck returns test results with varying shapes — try the common ones
  const summary = raw.summary || raw.result?.summary || raw;
  const passing  = Number(summary?.passing  ?? summary?.passed  ?? summary?.testsRan   ?? 0);
  const failing  = Number(summary?.failing  ?? summary?.failed  ?? summary?.testsFailed ?? 0);
  const skipped  = Number(summary?.skipping ?? summary?.skipped ?? 0);
  const total    = Number(summary?.testsRan ?? summary?.total   ?? (passing + failing + skipped));

  if (failing > 0) {
    // Collect failing test names if available
    const failed = extractRecords(raw.tests ?? raw.result?.tests ?? null)
      .filter(t => (t.outcome || "").toLowerCase() === "fail")
      .map(t => pick(t, "fullName", "name", "methodName") || "Unknown");

    findings.push({
      severity: "critical",
      title: `OrgCheck Tests: ${failing} Test(s) Failing`,
      description: `${failing} of ${total} Apex test method(s) failed in the full org test run. Failing tests block production deployments.`,
      action: "Fix each failing test method. Run `sf apex run test --class-names <ClassName>` locally to reproduce, then correct the underlying code or test assertion.",
      components: failed.length > 0 ? failed : [`${failing} failing test(s) — see org test run for details`],
    });
  }

  if (skipped > 0) {
    findings.push({
      severity: "warning",
      title: `OrgCheck Tests: ${skipped} Test(s) Skipped`,
      description: `${skipped} test method(s) were skipped during the full org test run. Skipped tests may hide regressions.`,
      action: "Investigate why each test is being skipped (SeeAllData, conditional skip, or @isTest(SeeAllData=true) misuse) and re-enable them.",
      components: [],
    });
  }

  if (failing === 0 && total > 0) {
    findings.push({
      severity: "info",
      title: `OrgCheck Tests: All ${total} Test(s) Passing`,
      description: `All ${total} Apex test method(s) passed in the full org test run.`,
      action: "No action required.",
      components: [],
    });
  }

  return { findings, summary: { passing, failing, skipped, total } };
}

// ── Main export ─────────────────────────────────────────────────────────────
// Takes the raw OrgCheck output from orgcheck.js and returns:
//   { findings, score, summary }
//
// OrgCheck results are grouped into a separate "Tech Debt" category so they
// don't conflict with the five existing weighted categories. Score is
// informational only (not rolled into the main weighted score).
module.exports = function analyzeOrgCheck(orgCheckResult) {
  if (!orgCheckResult) return { findings: [], score: null, summary: null };

  const { globalView, apexClasses, hardcodedUrls, runAllTests, errors } = orgCheckResult;

  const gv  = analyzeGlobalView(globalView);
  const ac  = analyzeApexClasses(apexClasses);
  const hu  = analyzeHardcodedUrls(hardcodedUrls);
  const rat = analyzeRunAllTests(runAllTests);

  const findings = [...gv.findings, ...ac.findings, ...hu.findings, ...rat.findings];

  // Simple scoring: start at 100, deduct for criticals and warnings
  let score = 100;
  for (const f of findings) {
    if (f.severity === "critical") score -= 20;
    else if (f.severity === "warning") score -= 10;
  }
  score = Math.max(0, score);

  const errorMessages = Object.entries(errors || {})
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `${k}: ${v}`);

  return {
    findings,
    score,
    summary: {
      globalView: gv.summary || null,
      runAllTests: rat.summary || null,
      errors: errorMessages,
    },
  };
};
