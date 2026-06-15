// Marketing Cloud Account Engagement (formerly Pardot). The connector
// installs as a managed package with the `pi` namespace.
module.exports = {
  id: "pardot",
  label: "Marketing Cloud Account Engagement (Pardot)",
  icon: "📣",
  detect: ({ orgFeatures }) => {
    const pkgs = orgFeatures?.packages || [];
    return pkgs.some(p => /^pi$/i.test(p.namespace || ""));
  },
};
