// CRM Analytics (formerly Tableau CRM / Einstein Analytics). Detected by
// EinsteinAnalytics-style PSLs OR a CRM-Analytics-named UserLicense.
module.exports = {
  id: "crmanalytics",
  label: "CRM Analytics (Tableau CRM)",
  icon: "📊",
  detect: ({ orgSignals }) => {
    const psls = orgSignals?.permSetLicenses || [];
    if (psls.some(p =>
      /einstein\s*analytics|tableau\s*crm/i.test(p.developerName || "") ||
      /einstein\s*analytics|tableau\s*crm/i.test(p.label || "")
    )) return true;
    const lic = orgSignals?.userLicenses || [];
    return lic.some(l => /^crm analytics|^einstein analytics|tableau crm/i.test(l.name));
  },

  info: ({ orgSignals }) => {
    const lic = (orgSignals?.userLicenses || []).filter(l =>
      /^crm analytics|^einstein analytics|tableau crm/i.test(l.name)
    );
    if (!lic.length) return null;
    return {
      severity: "info",
      title: `CRM Analytics Licences: ${lic.reduce((a, l) => a + (l.used || 0), 0)}/${lic.reduce((a, l) => a + (l.total || 0), 0)} in use`,
      description: lic.map(l => `${l.name}: ${l.used}/${l.total}`).join("; "),
      action: "Reclaim unused CRM Analytics seats — these are typically expensive add-on licences.",
      components: lic.map(l => l.name),
    };
  },
};
