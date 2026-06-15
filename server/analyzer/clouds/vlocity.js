// Industries Clouds (Communications, Insurance, Public Sector) historically
// shipped via the vlocity_cmt / vlocity_ins / vlocity_ps managed packages.
// Modern Salesforce Industries is becoming native, but the vlocity packages
// are still the dominant detection signal.
module.exports = {
  id: "vlocity",
  label: "Salesforce Industries (Communications / Insurance / Public Sector)",
  icon: "🏛️",
  detect: ({ orgFeatures }) => {
    const pkgs = orgFeatures?.packages || [];
    return pkgs.some(p => /^vlocity_/i.test(p.namespace || ""));
  },
};
