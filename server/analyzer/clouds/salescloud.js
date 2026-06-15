const { toolingQuery } = require("../../sfdx");
const { listRecordTypes } = require("./_helpers");

// Sales Cloud is always present in every Salesforce org. Detection is a
// trivial true.
const ID = "salescloud";

module.exports = {
  id: ID,
  label: "Sales Cloud",
  icon: "💼",
  detect: () => true,

  async run(metaDir, ctx) {
    const findings = [];

    const oppRecordTypes = listRecordTypes(metaDir, "Opportunity").filter(rt => rt.active);
    if (oppRecordTypes.length > 0) {
      findings.push({
        severity: "info",
        title: `${oppRecordTypes.length} Active Opportunity Record Type(s)`,
        description: "Opportunity record types segment your sales process. Multiple record types usually indicate distinct deal pipelines.",
        action: "Confirm each record type still maps to a live sales motion. Retire record types tied to discontinued products or programmes.",
        components: oppRecordTypes.map(rt => `${rt.name}${rt.label ? ` — ${rt.label}` : ""}`),
      });
    }

    // Duplicate Rules — guards against duplicate Lead/Account/Contact creation.
    // DuplicateRule is a regular sobject (data API), not Tooling.
    const dupRules = await toolingQuery(
      ctx.alias,
      "SELECT Id, DeveloperName, IsActive, SobjectType FROM DuplicateRule",
      { tooling: false }
    );
    const activeDup = (dupRules?.records || []).filter(r => r.IsActive);
    if (Array.isArray(dupRules?.records)) {
      if (activeDup.length === 0) {
        findings.push({
          severity: "warning",
          title: "No Active Duplicate Rules",
          description: "Duplicate rules prevent duplicate Lead, Account, and Contact creation. Without them, sales reps end up working the same prospect multiple times.",
          action: "Activate the standard 'Standard Account Duplicate Rule' / 'Standard Contact Duplicate Rule' / 'Standard Lead Duplicate Rule', or build custom rules around your matching criteria.",
          components: [],
        });
      } else {
        findings.push({
          severity: "info",
          title: `${activeDup.length} Active Duplicate Rule(s)`,
          description: "Duplicate rules are active. Periodically check the matching rules they reference still cover the fields your sales team uses to identify prospects.",
          action: "Review each rule's matching criteria. Add fields like Phone or Website if the team relies on them.",
          components: activeDup.map(r => `${r.DeveloperName} (${r.SobjectType})`),
        });
      }
    }

    // Lead Assignment Rules — drives lead routing to reps/queues.
    // Only one rule is active per sobject at a time, so we check existence + activeness.
    // AssignmentRule sits on the data API. Tooling rejects SobjectType.
    const leadAssign = await toolingQuery(
      ctx.alias,
      "SELECT Id, Name, Active FROM AssignmentRule WHERE SobjectType = 'Lead'",
      { tooling: false }
    );
    const activeLeadAssign = (leadAssign?.records || []).filter(r => r.Active);
    if (Array.isArray(leadAssign?.records) && activeLeadAssign.length === 0) {
      findings.push({
        severity: "warning",
        title: "No Active Lead Assignment Rule",
        description: "Lead Assignment Rules route inbound leads to the right sales rep or queue. Without one, leads stay owned by whoever creates them — usually the integration user — and rot in nobody's queue.",
        action: "Create a Lead Assignment Rule and mark exactly one rule active. Order entries so the most specific routing wins first.",
        components: [],
      });
    } else if (activeLeadAssign.length > 0) {
      findings.push({
        severity: "info",
        title: "Active Lead Assignment Rule",
        description: "An active Lead Assignment Rule is routing inbound leads.",
        action: "Periodically audit rule entries to confirm queue/owner targets still exist and that the order matches current sales territory boundaries.",
        components: activeLeadAssign.map(r => r.Name),
      });
    }

    const score = scoreFromFindings(findings);
    return { score, scoredChecks: 3, findings };
  },
};

function scoreFromFindings(findings) {
  return Math.max(0, Math.min(100,
    100
    - findings.filter(f => f.severity === "critical").length * 25
    - findings.filter(f => f.severity === "warning").length * 12
  ));
}
