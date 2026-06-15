// Flat list of cloud modules. Order here controls render order in the
// Cloud Skills tab. Scored clouds first, then detect-only clouds grouped
// by detection method (managed-package, licence, sobject).
module.exports = [
  // ── Scored clouds ───────────────────────────────────────────────────────
  require("./salescloud"),
  require("./servicecloud"),
  require("./cpq"),

  // ── Detect-only: managed-package signals ────────────────────────────────
  require("./fieldservice"),
  require("./healthcloud"),
  require("./fsc"),
  require("./education"),
  require("./npsp"),
  require("./omnistudio"),
  require("./vlocity"),
  require("./pardot"),

  // ── Detect-only: permission-set-licence / user-licence signals ──────────
  require("./servicecloudvoice"),
  require("./salesengagement"),
  require("./crmanalytics"),

  // ── Detect-only: sobject-presence signals ───────────────────────────────
  require("./experiencecloud"),
  require("./commerce"),

  // ── Detect-only: feature-flag signals (already in orgFeatures) ──────────
  require("./agentforce"),
];
