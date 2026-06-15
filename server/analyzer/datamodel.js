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

module.exports = async function checkDataModel(metaDir) {
  const findings = [];
  const objDir = path.join(metaDir, "force-app", "main", "default", "objects");

  if (!fs.existsSync(objDir)) {
    return {
      score: 100,
      findings: [{
        severity: "info",
        title: "No Object Metadata Retrieved",
        description: "No custom object metadata found.",
        action: "Include CustomObject in retrieve types for data model analysis.",
        components: [],
      }],
    };
  }

  const objectDirs = fs.readdirSync(objDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  const customObjects = objectDirs.filter(n => n.endsWith("__c") || n.endsWith("__mdt") || n.endsWith("__e"));

  if (customObjects.length > 300) {
    findings.push({
      severity: "warning",
      title: `High Custom Object Count: ${customObjects.length}`,
      description: `${customObjects.length} custom objects detected. High object counts add metadata complexity and maintenance overhead.`,
      action: "Audit objects for active usage. Archive or deprecate objects with no records and no active dependencies.",
      components: customObjects,
    });
  } else if (customObjects.length > 0) {
    findings.push({
      severity: "info",
      title: `${customObjects.length} Custom Object(s) Found`,
      description: `Schema includes ${customObjects.length} custom objects across ${objectDirs.length} total objects.`,
      action: "Periodically review object usage to identify candidates for deprecation.",
      components: customObjects,
    });
  }

  // ── Lookup fields without delete behaviour ────────────────────────────────
  const fieldFiles = globFiles(objDir, ".field-meta.xml");
  const lookupsWithoutBehavior = [];
  let totalLookups = 0;

  for (const f of fieldFiles) {
    const doc = readXml(f);
    if (!doc) continue;
    const field = doc.CustomField || {};
    if (field.type === "Lookup" || field.type === "MasterDetail") {
      totalLookups++;
      if (field.type === "Lookup" && !field.deleteConstraint) {
        // Derive Object.FieldName from path: objects/ObjectName__c/fields/FieldName__c.field-meta.xml
        const parts = f.split(path.sep);
        const objName = parts[parts.length - 3] || "Unknown";
        const fieldName = path.basename(f, ".field-meta.xml");
        lookupsWithoutBehavior.push(`${objName}.${fieldName}`);
      }
    }
  }

  if (lookupsWithoutBehavior.length > 0) {
    findings.push({
      severity: "warning",
      title: `${lookupsWithoutBehavior.length} Lookup Field(s) Without Delete Behaviour`,
      description: `${lookupsWithoutBehavior.length} of ${totalLookups} lookup fields have no cascade delete or restriction rule configured.`,
      action: "Review and set appropriate deleteConstraint on all lookup fields (SetNull, Restrict, or Cascade).",
      components: lookupsWithoutBehavior,
    });
  }

  // ── Deprecated / obsolete fields ─────────────────────────────────────────
  const deprecatedFieldComponents = [];
  for (const f of fieldFiles) {
    const doc = readXml(f);
    if (!doc) continue;
    const field = doc.CustomField || {};
    const desc = (field.description || "").toLowerCase();
    const label = (field.label || "").toLowerCase();
    if (desc.includes("deprecated") || desc.includes("do not use") || label.includes("deprecated") || label.includes("obsolete")) {
      const parts = f.split(path.sep);
      const objName = parts[parts.length - 3] || "Unknown";
      const fieldName = path.basename(f, ".field-meta.xml");
      deprecatedFieldComponents.push(`${objName}.${fieldName}`);
    }
  }

  if (deprecatedFieldComponents.length > 0) {
    findings.push({
      severity: "warning",
      title: `${deprecatedFieldComponents.length} Field(s) Marked as Deprecated`,
      description: `${deprecatedFieldComponents.length} custom fields have descriptions or labels indicating deprecation but haven't been removed.`,
      action: "Run Field Usage Report. Coordinate cleanup with admins before removal to avoid data loss.",
      components: deprecatedFieldComponents,
    });
  }

  const critCount = findings.filter(f => f.severity === "critical").length;
  const warnCount = findings.filter(f => f.severity === "warning").length;
  const score = Math.max(0, 100 - critCount * 20 - warnCount * 8);
  return { score: Math.min(100, score), findings };
};
