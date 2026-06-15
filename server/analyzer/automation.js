const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");

const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: true });

function readXml(filePath) {
  try { return parser.parse(fs.readFileSync(filePath, "utf8")); }
  catch { return null; }
}

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

module.exports = async function checkAutomation(metaDir) {
  const findings = [];
  const base = path.join(metaDir, "force-app", "main", "default");

  // ── Flows ─────────────────────────────────────────────────────────────────
  const flowFiles = globFiles(path.join(base, "flows"), ".flow-meta.xml");
  let activeFlows = 0;
  const flowsWithoutFault = [];
  const processBuilderNames = [];
  const flowsByObject = {};

  for (const f of flowFiles) {
    const doc = readXml(f);
    if (!doc) continue;
    const flow = doc.Flow || {};
    const name = path.basename(f, ".flow-meta.xml");
    const status = flow.status;
    const processType = flow.processType;

    if (status === "Active") {
      activeFlows++;
      if (processType === "Workflow") processBuilderNames.push(name);

      const xmlRaw = fs.readFileSync(f, "utf8");
      if (!xmlRaw.includes("faultConnector") && !xmlRaw.includes("<Fault>"))
        flowsWithoutFault.push(name);

      const obj = flow.start?.object || flow.triggerType;
      if (obj) {
        if (!flowsByObject[obj]) flowsByObject[obj] = [];
        flowsByObject[obj].push(name);
      }
    }
  }

  if (processBuilderNames.length > 0) {
    findings.push({
      severity: "critical",
      title: `${processBuilderNames.length} Active Process Builder(s) Detected`,
      description: "Process Builder is retired by Salesforce. Active Process Builders should be migrated to Flows before enforcement deadlines.",
      action: "Use the Flow Migration Tool to convert each Process Builder to a Record-Triggered Flow. Prioritise complex ones.",
      components: processBuilderNames,
    });
  }

  if (flowsWithoutFault.length > 5) {
    findings.push({
      severity: "warning",
      title: `${flowsWithoutFault.length} Active Flows Lack Fault Handling`,
      description: "Flows without fault connectors will surface raw error messages to users or silently fail.",
      action: "Add Fault connector paths to all Screen and Autolaunched Flows. Log errors to a custom object for visibility.",
      components: flowsWithoutFault,
    });
  } else if (flowsWithoutFault.length > 0) {
    findings.push({
      severity: "info",
      title: `${flowsWithoutFault.length} Flows Without Fault Paths`,
      description: "A small number of active flows lack fault handling.",
      action: "Add fault connectors to remaining flows.",
      components: flowsWithoutFault,
    });
  }

  const conflictedObjects = Object.entries(flowsByObject).filter(([, names]) => names.length >= 3);
  if (conflictedObjects.length > 0) {
    findings.push({
      severity: "warning",
      title: `Automation Conflicts on ${conflictedObjects.length} Object(s)`,
      description: `Objects with 3+ active flows: ${conflictedObjects.map(([o]) => o).join(", ")}. This risks unpredictable execution order.`,
      action: "Consolidate automation into a single Record-Triggered Flow per object. Retire redundant flows.",
      components: conflictedObjects.flatMap(([, names]) => names),
    });
  }

  findings.push({
    severity: "info",
    title: `${activeFlows} Active Flow(s) Found`,
    description: `${activeFlows} flows are currently active in this org.`,
    action: "Periodically audit active flows for relevance and performance.",
    components: [],
  });

  // ── Workflow Rules ────────────────────────────────────────────────────────
  const wfFiles = globFiles(path.join(base, "workflows"), ".workflow-meta.xml");
  const activeWfRuleComponents = [];

  for (const f of wfFiles) {
    const doc = readXml(f);
    if (!doc) continue;
    const objectName = path.basename(f, ".workflow-meta.xml");
    const rules = [].concat(doc.Workflow?.rules || []);
    rules
      .filter(r => r.active === true || r.active === "true")
      .forEach(r => activeWfRuleComponents.push(`${objectName}.${r.fullName || r.name || "Rule"}`));
  }

  if (activeWfRuleComponents.length > 0) {
    findings.push({
      severity: "warning",
      title: `${activeWfRuleComponents.length} Active Workflow Rule(s) Detected`,
      description: "Workflow Rules are a legacy automation tool. Salesforce recommends migrating to Flows.",
      action: "Migrate workflow rules to Flow using the Migrate to Flow tool in Setup.",
      components: activeWfRuleComponents,
    });
  }

  const critCount = findings.filter(f => f.severity === "critical").length;
  const warnCount = findings.filter(f => f.severity === "warning").length;
  const score = Math.max(0, 100 - critCount * 20 - warnCount * 8);
  return { score: Math.min(100, score), findings };
};
