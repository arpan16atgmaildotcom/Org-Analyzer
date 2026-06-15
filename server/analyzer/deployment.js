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

module.exports = async function checkDeployment(metaDir) {
  const findings = [];
  const base = path.join(metaDir, "force-app", "main", "default");
  const MIN_VERSION = 55;

  // ── API version staleness across all metadata ─────────────────────────────
  const allMetaFiles = globFiles(base, "-meta.xml");
  const staleByType = {};
  let checkedItems = 0;

  for (const f of allMetaFiles) {
    try {
      const doc = parser.parse(fs.readFileSync(f, "utf8"));
      const rootKey = Object.keys(doc).find(k => k !== "?xml");
      const version = parseFloat(doc?.[rootKey]?.apiVersion ?? 0);
      if (version > 0) {
        checkedItems++;
        if (version < MIN_VERSION) {
          const type = rootKey || "Unknown";
          if (!staleByType[type]) staleByType[type] = [];
          // Derive a readable component name from the file path
          const name = path.basename(f).replace(/-meta\.xml$/, "").replace(/\.\w+$/, "");
          staleByType[type].push(name);
        }
      }
    } catch { /* skip */ }
  }

  const staleItems = Object.values(staleByType).reduce((s, arr) => s + arr.length, 0);

  if (staleItems > 0) {
    const topTypes = Object.entries(staleByType)
      .sort(([, a], [, b]) => b.length - a.length)
      .slice(0, 4)
      .map(([t, arr]) => `${t} (${arr.length})`)
      .join(", ");
    // Flatten up to 20 component names for the action plan
    const componentNames = Object.entries(staleByType)
      .sort(([, a], [, b]) => b.length - a.length)
      .flatMap(([type, names]) => names.map(n => `${type}:${n}`))
      .slice(0, 20);
    findings.push({
      severity: "warning",
      title: `${staleItems} Metadata Items Below API v${MIN_VERSION}`,
      description: `${staleItems} of ${checkedItems} checked items reference old API versions. Top types: ${topTypes}.`,
      action: "Update apiVersion in affected metadata files to the current API version. Test and redeploy.",
      components: componentNames,
    });
  } else if (checkedItems > 0) {
    findings.push({
      severity: "info",
      title: "API Versions Up to Date",
      description: `All ${checkedItems} checked metadata items are on API v${MIN_VERSION}+.`,
      action: "Continue keeping metadata on current API versions as Salesforce releases new versions.",
      components: [],
    });
  }

  // ── sfdx-project.json (source control indicator) ──────────────────────────
  const projectJson = path.join(metaDir, "sfdx-project.json");
  if (!fs.existsSync(projectJson)) {
    findings.push({
      severity: "warning",
      title: "No sfdx-project.json — Source Control Not Configured",
      description: "No SFDX project file found. Metadata may not be tracked in source control, risking untracked production changes.",
      action: "Initialise a Salesforce DX project and connect to a Git repository. Set up CI/CD via GitHub Actions or Bitbucket Pipelines.",
      components: [],
    });
  }

  // ── LWC API version check ─────────────────────────────────────────────────
  const lwcDir = path.join(base, "lwc");
  if (fs.existsSync(lwcDir)) {
    const staleLwc = [];
    for (const f of globFiles(lwcDir, ".js-meta.xml")) {
      try {
        const doc = parser.parse(fs.readFileSync(f, "utf8"));
        const version = parseFloat(doc?.LightningComponentBundle?.apiVersion ?? 0);
        if (version > 0 && version < MIN_VERSION)
          staleLwc.push(path.basename(path.dirname(f)));
      } catch { /* skip */ }
    }
    if (staleLwc.length > 0) {
      findings.push({
        severity: "warning",
        title: `${staleLwc.length} LWC Component(s) on Stale API Version`,
        description: `${staleLwc.length} Lightning Web Components reference API versions below v${MIN_VERSION}.`,
        action: "Update apiVersion in each LWC .js-meta.xml file and redeploy.",
        components: staleLwc,
      });
    }
  }

  const critCount = findings.filter(f => f.severity === "critical").length;
  const warnCount = findings.filter(f => f.severity === "warning").length;
  const score = Math.max(0, 100 - critCount * 20 - warnCount * 10);
  return { score: Math.min(100, score), findings };
};
