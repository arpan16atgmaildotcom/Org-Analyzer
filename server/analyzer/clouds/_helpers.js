const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");

const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: true });

function readXml(filePath) {
  try { return parser.parse(fs.readFileSync(filePath, "utf8")); }
  catch { return null; }
}

// Record types for a given sobject. Salesforce's source format places each
// record type under `objects/<SObject>/recordTypes/<Name>.recordType-meta.xml`.
// Returns [{ name, label, active }].
function listRecordTypes(metaDir, sobject) {
  const dir = path.join(metaDir, "force-app", "main", "default", "objects", sobject, "recordTypes");
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith(".recordType-meta.xml")) continue;
    const doc = readXml(path.join(dir, entry));
    const rt = doc?.RecordType || {};
    out.push({
      name: path.basename(entry, ".recordType-meta.xml"),
      label: rt.label || null,
      active: rt.active !== false,
    });
  }
  return out;
}

// Flow definitions that target a given sobject. Reads the Flow's
// `start.object` (record-triggered flows) or `processMetadataValues` and
// returns the active flows whose primary object matches.
function listFlowsForObject(metaDir, sobject) {
  const dir = path.join(metaDir, "force-app", "main", "default", "flows");
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith(".flow-meta.xml")) continue;
    const doc = readXml(path.join(dir, entry));
    const flow = doc?.Flow;
    if (!flow) continue;
    const startObject = flow.start?.object;
    const status = flow.status;
    if (startObject === sobject && status === "Active") {
      out.push({ name: path.basename(entry, ".flow-meta.xml"), label: flow.label || null });
    }
  }
  return out;
}

module.exports = { readXml, listRecordTypes, listFlowsForObject };
