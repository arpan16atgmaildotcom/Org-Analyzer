// Experience Cloud (formerly Communities). Detected by the presence of any
// Network row — each Experience site is one Network.
module.exports = {
  id: "experiencecloud",
  label: "Experience Cloud",
  icon: "🌐",
  detect: ({ orgSignals }) => (orgSignals?.networks || []).length > 0,

  info: ({ orgSignals }) => {
    const sites = orgSignals?.networks || [];
    if (!sites.length) return null;
    const live = sites.filter(s => s.status === "Live");
    return {
      severity: "info",
      title: `${sites.length} Experience Cloud Site(s) — ${live.length} Live`,
      description: sites.map(s => `${s.name} (${s.status})`).join("; "),
      action: "Confirm sites in Preview / Inactive status are still on the roadmap; otherwise delete to reduce attack surface.",
      components: sites.map(s => `${s.name} — ${s.status}`),
    };
  },
};
