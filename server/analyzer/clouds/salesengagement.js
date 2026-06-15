// Sales Engagement (formerly High Velocity Sales). PSL developer names
// historically include `HighVelocity` or `SalesEngagement`.
module.exports = {
  id: "salesengagement",
  label: "Sales Engagement",
  icon: "📈",
  detect: ({ orgSignals }) => {
    const psls = orgSignals?.permSetLicenses || [];
    return psls.some(p =>
      /high\s*velocity|sales\s*engagement/i.test(p.developerName || "") ||
      /high\s*velocity|sales\s*engagement/i.test(p.label || "")
    );
  },

  info: ({ orgSignals }) => {
    const matches = (orgSignals?.permSetLicenses || []).filter(p =>
      /high\s*velocity|sales\s*engagement/i.test(p.developerName || "") ||
      /high\s*velocity|sales\s*engagement/i.test(p.label || "")
    );
    if (!matches.length) return null;
    return {
      severity: "info",
      title: `Sales Engagement Permission Set Licences: ${matches.length}`,
      description: matches.map(p => p.label || p.developerName).join(", "),
      action: "Audit Sales Engagement seats — cadence licences are often over-allocated relative to active SDR headcount.",
      components: matches.map(p => p.developerName),
    };
  },
};
