// Education Cloud — historically the EDA (Education Data Architecture)
// or HEDA managed package. Modern Education Cloud may also surface via
// licence; included here for forward compatibility.
module.exports = {
  id: "education",
  label: "Education Cloud",
  icon: "🎓",
  detect: ({ orgFeatures, orgSignals }) => {
    const pkg = (orgFeatures?.packages || []).some(p => /^(eda|heda)$/i.test(p.namespace || ""));
    if (pkg) return true;
    const lic = (orgSignals?.userLicenses || []).some(l => /^education cloud/i.test(l.name));
    return lic;
  },
};
