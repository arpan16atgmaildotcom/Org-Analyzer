// Salesforce Commerce (B2B / B2C). Detected by the presence of any
// WebStore row — the WebStore sobject only exists on orgs with the
// commerce feature enabled.
module.exports = {
  id: "commerce",
  label: "Commerce Cloud (B2B / B2C)",
  icon: "🛒",
  detect: ({ orgSignals }) => (orgSignals?.webStores || []).length > 0,

  info: ({ orgSignals }) => {
    const stores = orgSignals?.webStores || [];
    if (!stores.length) return null;
    return {
      severity: "info",
      title: `${stores.length} WebStore(s) Configured`,
      description: stores.map(s => `${s.name} (${s.type})`).join("; "),
      action: "Audit unused WebStores — orphan storefronts still consume infrastructure and may expose stale catalog data.",
      components: stores.map(s => `${s.name} — ${s.type}`),
    };
  },
};
