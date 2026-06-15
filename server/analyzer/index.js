const checkSecurity = require("./security");
const checkAutomation = require("./automation");
const checkApex = require("./apex");
const checkDataModel = require("./datamodel");
const checkDeployment = require("./deployment");
const runCloudChecks = require("./clouds");

const WEIGHTS = {
  security: 0.30,
  automation: 0.25,
  apex: 0.20,
  datamodel: 0.15,
  deployment: 0.10,
};

const CATEGORY_META = {
  security:   { id: "security",   label: "Security & Access",         icon: "🔐" },
  automation: { id: "automation", label: "Automation & Flows",        icon: "🔄" },
  apex:       { id: "apex",       label: "Apex & Governor Limits",    icon: "⚡" },
  datamodel:  { id: "datamodel",  label: "Data Model & Architecture", icon: "🏗️" },
  deployment: { id: "deployment", label: "Metadata & Deployment",     icon: "📦" },
};

module.exports = async function runAnalysis(metaDir, onStep, ctx = {}) {
  const step = (label) => onStep && onStep(label);

  step("Running security checks…");
  const security = await checkSecurity(metaDir, {
    sysAdminUsers: ctx.sysAdminUsers,
    userSignals: ctx.userSignals,
  });

  step("Analysing automation & flows…");
  const automation = await checkAutomation(metaDir);

  step("Scanning Apex classes for governor limit risks…");
  const apex = await checkApex(metaDir, { coverage: ctx.coverage });

  step("Inspecting data model…");
  const datamodel = await checkDataModel(metaDir);

  step("Reviewing deployment metadata…");
  const deployment = await checkDeployment(metaDir);

  const modules = { security, automation, apex, datamodel, deployment };

  const overallScore = Math.round(
    Object.entries(modules).reduce((acc, [key, mod]) => acc + mod.score * WEIGHTS[key], 0)
  );

  step("Running cloud-skills checks…");
  const cloudResult = await runCloudChecks(metaDir, {
    orgFeatures: ctx.orgFeatures,
    orgSignals: ctx.orgSignals,
    alias: ctx.alias,
  });
  // Tag every cloud finding with `source: "cloud:<id>"` so the Action Plan
  // and Findings views can group / filter by origin without ambiguity with
  // the five core categories.
  const cloudFindings = [];
  for (const c of cloudResult.clouds) {
    for (const f of c.findings) {
      cloudFindings.push({ ...f, source: `cloud:${c.id}` });
    }
  }

  const coreFindings = Object.entries(modules).flatMap(([, mod]) => mod.findings);
  const allFindings = [...coreFindings, ...cloudFindings];
  const criticalCount = allFindings.filter(f => f.severity === "critical").length;
  const warningCount  = allFindings.filter(f => f.severity === "warning").length;
  const infoCount     = allFindings.filter(f => f.severity === "info").length;

  const actionItems = allFindings
    .filter(f => f.severity !== "info")
    .map((f, i) => ({
      priority: i + 1,
      effort: deriveEffort(f),
      impact: f.severity === "critical" ? "Critical" : "High",
      title: f.title,
      action: f.action,
      components: f.components || [],
      deadline: f.severity === "critical" ? "Immediate" : "30 days",
      source: f.source || "core",
    }))
    .sort((a, b) => {
      const ord = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      return (ord[a.impact] ?? 9) - (ord[b.impact] ?? 9);
    })
    .map((item, i) => ({ ...item, priority: i + 1 }));

  const categories = Object.entries(modules).map(([key, mod]) => ({
    ...CATEGORY_META[key],
    score: mod.score,
    findings: mod.findings,
  }));

  return {
    summary: { critical: criticalCount, warning: warningCount, info: infoCount, score: overallScore },
    categories,
    actionItems,
    clouds: cloudResult.clouds,
  };
};

function deriveEffort(finding) {
  const title = finding.title.toLowerCase();
  if (title.includes("soql") || title.includes("refactor") || title.includes("migrate")) return "High";
  if (title.includes("policy") || title.includes("scope") || title.includes("restrict")) return "Low";
  return "Medium";
}
