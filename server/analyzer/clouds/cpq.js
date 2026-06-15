const { toolingQuery } = require("../../sfdx");
const { listFlowsForObject } = require("./_helpers");

// Salesforce CPQ / Revenue Cloud is delivered through the SBQQ managed
// package. Detection: any installed package with the SBQQ namespace.
module.exports = {
  id: "cpq",
  label: "Salesforce CPQ / Revenue Cloud",
  icon: "💰",
  detect: ({ orgFeatures }) => {
    const packages = orgFeatures?.packages || [];
    return packages.some(p => /^sbqq$/i.test(p.namespace || ""));
  },

  async run(metaDir, ctx) {
    const findings = [];
    const cpqPkg = (ctx.orgFeatures?.packages || []).find(p => /^sbqq$/i.test(p.namespace || ""));

    if (cpqPkg) {
      findings.push({
        severity: "info",
        title: `CPQ Package Installed${cpqPkg.version ? ` (v${cpqPkg.version})` : ""}`,
        description: cpqPkg.version
          ? `Salesforce CPQ ${cpqPkg.version} is installed. Stay within two minor versions of the latest release for security and feature support.`
          : "Salesforce CPQ is installed.",
        action: "Check the latest CPQ release notes and plan an upgrade if you're more than two minor versions behind.",
        components: [],
      });
    }

    // Active price rules — the most common reason CPQ quoting feels broken
    // is that the rules driving discounts/bundles got disabled or never built.
    const priceRules = await toolingQuery(
      ctx.alias,
      "SELECT COUNT() FROM SBQQ__PriceRule__c WHERE SBQQ__Active__c = true",
      { tooling: false }
    );
    if (priceRules && typeof priceRules.totalSize === "number") {
      if (priceRules.totalSize === 0) {
        findings.push({
          severity: "info",
          title: "No Active CPQ Price Rules",
          description: "No active SBQQ Price Rules detected. The org is relying entirely on standard list pricing.",
          action: "If sales reps need conditional discounts, bundles, or pricing tiers, model them as Price Rules. Otherwise, no action — list-only pricing is a valid setup.",
          components: [],
        });
      } else {
        findings.push({
          severity: "info",
          title: `${priceRules.totalSize} Active CPQ Price Rule(s)`,
          description: "CPQ Price Rules are driving conditional pricing.",
          action: "Audit rules quarterly — disabled products and discontinued promotions accumulate as orphan rules.",
          components: [],
        });
      }
    }

    // Quote-to-Cash flow presence — any Active flow whose start.object is SBQQ__Quote__c.
    // Indicates the org has automation around quote lifecycle (approval, generation, etc.).
    const quoteFlows = listFlowsForObject(metaDir, "SBQQ__Quote__c");
    if (quoteFlows.length > 0) {
      findings.push({
        severity: "info",
        title: `${quoteFlows.length} Active Quote Flow(s)`,
        description: "Active Flows are running on SBQQ__Quote__c — likely covering approval routing, document generation, or quote-to-order handoff.",
        action: "Confirm each flow has clear ownership and is exercised by current quoting workflows.",
        components: quoteFlows.map(f => f.name),
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
