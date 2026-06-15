// Field Service. Modern installs are licence-based; older orgs ship the FSL
// managed package. We accept either signal.
module.exports = {
  id: "fieldservice",
  label: "Field Service",
  icon: "🔧",
  detect: ({ orgFeatures, orgSignals }) => {
    const pkg = (orgFeatures?.packages || []).some(p => /^fsl$/i.test(p.namespace || ""));
    if (pkg) return true;
    const lic = (orgSignals?.userLicenses || []).some(l => /^field service/i.test(l.name));
    return lic;
  },

  info: ({ orgSignals }) => {
    const lic = (orgSignals?.userLicenses || []).filter(l => /^field service/i.test(l.name));
    if (!lic.length) return null;
    const used = lic.reduce((acc, l) => acc + (l.used || 0), 0);
    const total = lic.reduce((acc, l) => acc + (l.total || 0), 0);
    return {
      severity: "info",
      title: `Field Service Licences: ${used}/${total} in use`,
      description: lic.map(l => `${l.name}: ${l.used}/${l.total}`).join("; "),
      action: "Reclaim unused Field Service licences if they're not actively assigned to dispatchers / mobile workers.",
      components: lic.map(l => l.name),
    };
  },
};
