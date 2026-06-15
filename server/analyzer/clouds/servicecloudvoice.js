// Service Cloud Voice — pure permission-set-licence detection. The PSL
// developer name pattern matches `*Voice*` (typically SalesforceVoiceUserPsl).
module.exports = {
  id: "servicecloudvoice",
  label: "Service Cloud Voice",
  icon: "📞",
  detect: ({ orgSignals }) => {
    const psls = orgSignals?.permSetLicenses || [];
    return psls.some(p => /voice/i.test(p.developerName || "") || /voice/i.test(p.label || ""));
  },

  info: ({ orgSignals }) => {
    const matches = (orgSignals?.permSetLicenses || []).filter(
      p => /voice/i.test(p.developerName || "") || /voice/i.test(p.label || "")
    );
    if (!matches.length) return null;
    return {
      severity: "info",
      title: `Service Cloud Voice Permission Set Licences: ${matches.length}`,
      description: matches.map(p => p.label || p.developerName).join(", "),
      action: "Confirm Voice users still need their seats; PSL inventory tends to drift after team reorganisations.",
      components: matches.map(p => p.developerName),
    };
  },
};
