// Nonprofit Success Pack / Nonprofit Cloud. Detected via the npsp / npe / npo
// namespaces (NPSP and historic NPSP-precursor packages).
module.exports = {
  id: "npsp",
  label: "Nonprofit Cloud",
  icon: "🤝",
  detect: ({ orgFeatures, orgSignals }) => {
    const pkg = (orgFeatures?.packages || []).some(p => /^(npsp|npe.*|npo.*)$/i.test(p.namespace || ""));
    if (pkg) return true;
    const lic = (orgSignals?.userLicenses || []).some(l => /^nonprofit/i.test(l.name));
    return lic;
  },
};
