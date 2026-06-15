// OmniStudio — DataRaptors, Integration Procedures, OmniScripts. Modern
// installs use the OmniStudio namespace; legacy installs ship the
// vlocity_cmt-bundled OmniStudio.
module.exports = {
  id: "omnistudio",
  label: "OmniStudio",
  icon: "🧩",
  detect: ({ orgFeatures }) => {
    const pkgs = orgFeatures?.packages || [];
    return pkgs.some(p => /^omnistudio$/i.test(p.namespace || ""));
  },
};
