// Health Cloud. Modern Health Cloud is a native (non-packaged) cloud
// detected via UserLicense; older installs use the HealthCloudGA / HC
// managed packages.
module.exports = {
  id: "healthcloud",
  label: "Health Cloud",
  icon: "🩺",
  detect: ({ orgFeatures, orgSignals }) => {
    const pkg = (orgFeatures?.packages || []).some(p => /^(healthcloud|hc)$/i.test(p.namespace || ""));
    if (pkg) return true;
    const lic = (orgSignals?.userLicenses || []).some(l => /^health cloud/i.test(l.name));
    return lic;
  },

  info: ({ orgSignals }) => {
    const lic = (orgSignals?.userLicenses || []).filter(l => /^health cloud/i.test(l.name));
    if (!lic.length) return null;
    return {
      severity: "info",
      title: `Health Cloud Licences: ${lic.reduce((a, l) => a + (l.used || 0), 0)}/${lic.reduce((a, l) => a + (l.total || 0), 0)} in use`,
      description: lic.map(l => `${l.name}: ${l.used}/${l.total}`).join("; "),
      action: "Confirm Health Cloud users still need their seats; clinical-context licences are typically tightly capped.",
      components: lic.map(l => l.name),
    };
  },
};
