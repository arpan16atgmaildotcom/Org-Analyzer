// Agentforce. Already surfaced in orgFeatures.agentforce by the existing
// BotDefinition Tooling query — this card is a passthrough.
module.exports = {
  id: "agentforce",
  label: "Agentforce",
  icon: "🤖",
  detect: ({ orgFeatures }) => orgFeatures?.agentforce?.enabled === true,

  info: ({ orgFeatures }) => {
    const af = orgFeatures?.agentforce;
    if (!af) return null;
    return {
      severity: "info",
      title: `Agentforce: ${af.activeCount} active, ${af.totalCount} total bot definition(s)`,
      description: "Agentforce / Einstein Bots are configured in this org.",
      action: "Verify each active bot's intent coverage and escalation path. Retire bot definitions for retired channels.",
      components: [],
    };
  },
};
