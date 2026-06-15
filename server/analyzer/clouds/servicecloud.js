const { toolingQuery } = require("../../sfdx");
const { listRecordTypes } = require("./_helpers");

// Service Cloud is bundled into the standard Salesforce licence on every
// org, so we treat it as always-on. The orchestrator will still drop it if
// a future detect needs to be more selective.
module.exports = {
  id: "servicecloud",
  label: "Service Cloud",
  icon: "🛟",
  detect: ({ orgFeatures, orgSignals }) => {
    if (orgFeatures?.clouds?.includes("Service Cloud")) return true;
    const licences = orgSignals?.userLicenses || [];
    if (licences.some(l => /^service cloud/i.test(l.name))) return true;
    // Always-on fallback: every org has the Case object and standard support.
    return true;
  },

  async run(metaDir, ctx) {
    const findings = [];

    // Case Assignment Rules — without one, every new Case is owned by the
    // creator (often a Site guest user or the integration user) and never
    // routed to a queue.
    // AssignmentRule sits on the data API. Tooling rejects SobjectType.
    const caseAssign = await toolingQuery(
      ctx.alias,
      "SELECT Id, Name, Active FROM AssignmentRule WHERE SobjectType = 'Case'",
      { tooling: false }
    );
    const activeCaseAssign = (caseAssign?.records || []).filter(r => r.Active);
    if (Array.isArray(caseAssign?.records)) {
      if (activeCaseAssign.length === 0) {
        findings.push({
          severity: "critical",
          title: "No Active Case Assignment Rule",
          description: "Case Assignment Rules route inbound cases to the right support queue. Without one, cases sit on whoever created them and never make it onto an agent's worklist — SLAs are silently missed.",
          action: "Create a Case Assignment Rule, set rule entries by record type / origin / priority, and mark exactly one rule active.",
          components: [],
        });
      } else {
        findings.push({
          severity: "info",
          title: "Active Case Assignment Rule",
          description: "An active Case Assignment Rule is routing inbound cases.",
          action: "Audit rule entries periodically — queues referenced by entries that no longer exist silently drop cases to the default owner.",
          components: activeCaseAssign.map(r => r.Name),
        });
      }
    }

    // Auto-Response Rules — sends acknowledgement to customer the moment
    // a Case is created. Strong signal of a mature support practice.
    // AutoResponseRule is exposed only on the Tooling API and doesn't
    // surface an Active column; rule existence is the signal we use.
    const autoResp = await toolingQuery(
      ctx.alias,
      "SELECT Id, Name FROM AutoResponseRule"
    );
    const activeAutoResp = autoResp?.records || [];
    if (Array.isArray(autoResp?.records) && activeAutoResp.length === 0) {
      findings.push({
        severity: "warning",
        title: "No Active Case Auto-Response Rule",
        description: "Auto-response rules send the customer an immediate acknowledgement when a case is logged. Without one, the customer has no proof their request was received.",
        action: "Create a Case Auto-Response Rule with email templates per record type / origin. Activate exactly one rule.",
        components: [],
      });
    } else if (activeAutoResp.length > 0) {
      findings.push({
        severity: "info",
        title: "Active Case Auto-Response Rule",
        description: "Customers receive an automatic acknowledgement when a case is logged.",
        action: "Refresh templates regularly — branding, phrasing, and SLA promises drift from the real customer experience.",
        components: activeAutoResp.map(r => r.Name),
      });
    }

    // Active Case record types — usually maps to support channels (Web, Email, Chat)
    // or product lines. An inventory-style finding so admins can sanity-check coverage.
    const caseRecordTypes = listRecordTypes(metaDir, "Case").filter(rt => rt.active);
    if (caseRecordTypes.length > 0) {
      findings.push({
        severity: "info",
        title: `${caseRecordTypes.length} Active Case Record Type(s)`,
        description: "Case record types typically represent support channels or product lines. Multiple record types let you drive different page layouts, assignment rules, and response templates per support segment.",
        action: "Confirm each record type still maps to a live support channel. Retire record types whose channel is no longer used.",
        components: caseRecordTypes.map(rt => `${rt.name}${rt.label ? ` — ${rt.label}` : ""}`),
      });
    }

    const score = scoreFromFindings(findings);
    return { score, scoredChecks: 3, findings };
  },
};

function scoreFromFindings(findings) {
  return Math.max(0, Math.min(100,
    100
    - findings.filter(f => f.severity === "critical").length * 30
    - findings.filter(f => f.severity === "warning").length * 12
  ));
}
