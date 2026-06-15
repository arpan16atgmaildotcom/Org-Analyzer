// Financial Services Cloud. Native (non-packaged) installs detected by
// UserLicense; older installs use the FSC / FinServ managed packages.
module.exports = {
  id: "fsc",
  label: "Financial Services Cloud",
  icon: "🏦",
  detect: ({ orgFeatures, orgSignals }) => {
    const pkg = (orgFeatures?.packages || []).some(p => /^(fsc|finserv)$/i.test(p.namespace || ""));
    if (pkg) return true;
    const lic = (orgSignals?.userLicenses || []).some(l => /^financial services/i.test(l.name));
    return lic;
  },

  info: ({ orgSignals }) => {
    const lic = (orgSignals?.userLicenses || []).filter(l => /^financial services/i.test(l.name));
    if (!lic.length) return null;
    return {
      severity: "info",
      title: `Financial Services Cloud Licences: ${lic.reduce((a, l) => a + (l.used || 0), 0)}/${lic.reduce((a, l) => a + (l.total || 0), 0)} in use`,
      description: lic.map(l => `${l.name}: ${l.used}/${l.total}`).join("; "),
      action: "Audit FSC seats periodically — licence inventory tracks regulated headcount and should match HR records.",
      components: lic.map(l => l.name),
    };
  },
};
