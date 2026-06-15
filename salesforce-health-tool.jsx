import { useState, useEffect, useRef } from "react";

const COLORS = {
  bg: "#0a0e1a",
  panel: "#0f1628",
  panelBorder: "#1e2d4a",
  accent: "#00d4ff",
  accentSoft: "#0099cc",
  critical: "#ff3b5c",
  warning: "#ffb800",
  info: "#00d4ff",
  success: "#00e5a0",
  text: "#e0eaff",
  muted: "#6b84a8",
  highlight: "#1a2540",
};

const MOCK_HEALTH_DATA = {
  org: { name: "Acme Corp Production", id: "00D3x000001234", edition: "Enterprise", apiVersion: "59.0", sandbox: false },
  summary: { critical: 4, warning: 9, info: 6, score: 62 },
  categories: [
    {
      id: "security",
      label: "Security & Access",
      icon: "🔐",
      score: 48,
      findings: [
        { severity: "critical", title: "MFA Not Enforced", description: "Multi-Factor Authentication is not enforced for all users. 38 active users can log in without MFA.", action: "Enable MFA enforcement in Session Settings. Go to Setup > Identity > Identity Verification." },
        { severity: "critical", title: "Excessive System Admin Profiles", description: "47 users have System Administrator profile — significantly above recommended threshold of <5% of user base.", action: "Audit admin users. Reassign to custom profiles with least-privilege access. Review quarterly." },
        { severity: "warning", title: "Password Policy Below Minimum", description: "Password expiry is set to 180 days. Best practice recommends ≤90 days.", action: "Update password policy in Setup > Security Controls > Password Policies." },
        { severity: "warning", title: "Guest User Access Enabled on 3 Sites", description: "Salesforce Sites with guest access may expose object data without authentication.", action: "Review guest user profiles and restrict object/field-level permissions on all Experience Cloud sites." },
        { severity: "info", title: "Connected Apps with Broad Scopes", description: "12 Connected Apps have 'Full Access' OAuth scope. Recommend scoping down.", action: "Audit Connected Apps and limit OAuth scopes to only required permissions." },
      ],
    },
    {
      id: "governor",
      label: "Governor Limits & Performance",
      icon: "⚡",
      score: 71,
      findings: [
        { severity: "critical", title: "SOQL in Loops Detected", description: "Static analysis found 14 Apex classes with SOQL queries inside for-loops — a governor limit risk.", action: "Refactor affected classes to bulkify SOQL. Move queries outside loops and use collections." },
        { severity: "warning", title: "Apex CPU Time Spikes", description: "Avg Apex CPU usage at 72% of limit in peak hours. 3 jobs regularly exceed 80%.", action: "Profile Apex via Developer Console. Optimize list operations and eliminate redundant loops." },
        { severity: "warning", title: "Heap Size Warnings in Batch Jobs", description: "BatchApex jobs processing >10K records log heap size warnings.", action: "Reduce scope size in batch classes. Use Database.Stateful only when necessary." },
        { severity: "info", title: "API Usage at 61% of Daily Limit", description: "Current 24h API call volume: 610K / 1M limit. Trending upward 8% MoM.", action: "Identify top API consumers via API Usage reports. Consider Bulk API for batch integrations." },
      ],
    },
    {
      id: "datamodel",
      label: "Data Model & Architecture",
      icon: "🏗️",
      score: 65,
      findings: [
        { severity: "warning", title: "Data Skew on Account", description: "14 Account records each own >10,000 child records. Causes lock contention and query slowdowns.", action: "Implement account hierarchies or reparenting strategy. Avoid single mega-parent accounts." },
        { severity: "warning", title: "Deprecated Fields Still in Use", description: "23 custom fields marked for deletion still appear in active page layouts, flows, or reports.", action: "Run Field Usage Report. Coordinate cleanup with admins before removal to avoid data loss." },
        { severity: "warning", title: "Lookup Without Delete Behavior Set", description: "18 Lookup relationships have no cascade delete or restriction rules configured.", action: "Review and set appropriate delete behavior on all lookup fields in Setup." },
        { severity: "info", title: "Schema Complexity: 420 Custom Objects", description: "Object count is high. Review if all objects are actively used — unused objects add maintenance overhead.", action: "Run Object Usage analytics. Archive or deprecate objects with zero records and no active dependencies." },
      ],
    },
    {
      id: "automation",
      label: "Automation & Flows",
      icon: "🔄",
      score: 55,
      findings: [
        { severity: "critical", title: "Conflicting Automation on Lead Object", description: "Lead object has 3 active Flows + 2 active Workflow Rules + 1 Process Builder targeting the same field — creates unpredictable execution order.", action: "Consolidate automation into a single Record-Triggered Flow per object. Retire legacy Workflow Rules and Process Builders." },
        { severity: "critical", title: "17 Active Process Builders Detected", description: "Process Builder is a retired product. All active PBs should be migrated to Flows before Spring '26 enforcement.", action: "Use the Flow Migration Tool to convert each Process Builder to a Flow. Prioritize complex ones." },
        { severity: "warning", title: "Flows Without Error Handling", description: "31 active Flows have no Fault paths configured. Errors will silently fail or surface raw messages to users.", action: "Add Fault connector paths to all Screen and Autolaunched Flows. Log errors to a custom object." },
        { severity: "info", title: "Scheduled Flows Overlap Window", description: "4 scheduled Flows run at the same 2AM window and share object access — risk of contention.", action: "Stagger scheduled Flow execution times by at least 30 minutes to avoid overlapping transactions." },
      ],
    },
    {
      id: "metadata",
      label: "Metadata & Deployment",
      icon: "📦",
      score: 74,
      findings: [
        { severity: "warning", title: "No Change Sets in 45+ Days", description: "Last deployment was 47 days ago. Suggests manual changes may be occurring directly in production.", action: "Enforce a deployment policy via CI/CD pipeline (Salesforce DX / GitHub Actions). All changes must go through source control." },
        { severity: "warning", title: "Unpackaged Metadata Drift", description: "Production org has 340 metadata items not tracked in any package or source repository.", action: "Run Salesforce CLI 'sf project retrieve start' to capture current org state into version control." },
        { severity: "info", title: "API Version Staleness", description: "68 Apex classes and 22 LWCs reference API versions below v55.0.", action: "Update API versions in metadata. Test and redeploy. Older API versions may lose support." },
      ],
    },
  ],
  dataVolume: [
    { object: "Account", records: 1420000, growth: "+12%", storage: "2.1 GB", skew: true },
    { object: "Contact", records: 3870000, growth: "+8%", storage: "5.4 GB", skew: false },
    { object: "Opportunity", records: 940000, growth: "+21%", storage: "1.8 GB", skew: false },
    { object: "Case", records: 2100000, growth: "+34%", storage: "3.2 GB", skew: false },
    { object: "Lead", records: 680000, growth: "+6%", storage: "0.9 GB", skew: false },
    { object: "Task", records: 7200000, growth: "+41%", storage: "9.1 GB", skew: false },
    { object: "EmailMessage", records: 4300000, growth: "+55%", storage: "14.2 GB", skew: true },
    { object: "ContentDocument", records: 890000, growth: "+18%", storage: "22.6 GB", skew: false },
  ],
  actionItems: [
    { priority: 1, effort: "Low", impact: "Critical", title: "Enforce MFA for all users", category: "Security", deadline: "Immediate" },
    { priority: 2, effort: "Medium", impact: "Critical", title: "Migrate all Process Builders to Flows", category: "Automation", deadline: "Before Spring '26" },
    { priority: 3, effort: "Medium", impact: "Critical", title: "Audit & reduce System Admin profile assignments", category: "Security", deadline: "30 days" },
    { priority: 4, effort: "High", impact: "Critical", title: "Refactor SOQL-in-loops across 14 Apex classes", category: "Performance", deadline: "60 days" },
    { priority: 5, effort: "Low", impact: "High", title: "Consolidate Lead automation into single Flow", category: "Automation", deadline: "30 days" },
    { priority: 6, effort: "Medium", impact: "High", title: "Add error handling (Fault paths) to all Flows", category: "Automation", deadline: "45 days" },
    { priority: 7, effort: "Low", impact: "High", title: "Update password expiry policy to 90 days", category: "Security", deadline: "Immediate" },
    { priority: 8, effort: "High", impact: "Medium", title: "Implement source control & CI/CD pipeline", category: "Deployment", deadline: "90 days" },
    { priority: 9, effort: "Medium", impact: "Medium", title: "Resolve data skew on Account & EmailMessage", category: "Data Model", deadline: "60 days" },
    { priority: 10, effort: "Low", impact: "Medium", title: "Restrict Connected Apps OAuth scopes", category: "Security", deadline: "30 days" },
  ],
};

const SCAN_STEPS = [
  "Authenticating via session token…",
  "Reading org metadata structure…",
  "Scanning security policies…",
  "Analyzing governor limit exposure…",
  "Inspecting automation inventory…",
  "Checking data model integrity…",
  "Quantifying data volumes…",
  "Reviewing deployment history…",
  "Cross-referencing Salesforce best practices…",
  "Generating health report…",
];

const SeverityBadge = ({ severity }) => {
  const config = {
    critical: { color: COLORS.critical, label: "CRITICAL" },
    warning: { color: COLORS.warning, label: "WARNING" },
    info: { color: COLORS.info, label: "INFO" },
    success: { color: COLORS.success, label: "PASS" },
  };
  const c = config[severity] || config.info;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: 1.2, padding: "2px 8px",
      borderRadius: 3, background: c.color + "22", color: c.color,
      border: `1px solid ${c.color}55`, fontFamily: "monospace",
    }}>
      {c.label}
    </span>
  );
};

const ScoreRing = ({ score, size = 80 }) => {
  const r = (size / 2) - 8;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 75 ? COLORS.success : score >= 50 ? COLORS.warning : COLORS.critical;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={COLORS.panelBorder} strokeWidth={6} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 1s ease" }} />
      <text x={size/2} y={size/2 + 1} textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize={size < 60 ? 13 : 18} fontWeight={700} fontFamily="monospace"
        style={{ transform: "rotate(90deg)", transformOrigin: `${size/2}px ${size/2}px` }}>
        {score}
      </text>
    </svg>
  );
};

const ProgressBar = ({ value, max, color = COLORS.accent }) => (
  <div style={{ background: COLORS.highlight, borderRadius: 4, height: 6, overflow: "hidden", flex: 1 }}>
    <div style={{
      width: `${(value / max) * 100}%`, height: "100%",
      background: color, borderRadius: 4, transition: "width 1s ease",
    }} />
  </div>
);

// ─────────────────────────────── SCREENS ───────────────────────────────

function ConnectScreen({ onConnect }) {
  const [token, setToken] = useState("");
  const [instanceUrl, setInstanceUrl] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  const handleConnect = () => {
    if (!token.trim() || !instanceUrl.trim()) {
      setError("Both Session Token and Instance URL are required.");
      return;
    }
    if (!instanceUrl.startsWith("https://")) {
      setError("Instance URL must start with https://");
      return;
    }
    setError("");
    setConnecting(true);
    setTimeout(() => { setConnecting(false); onConnect(); }, 1800);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 32 }}>
      <div style={{ width: "100%", maxWidth: 520 }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>☁️</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: COLORS.text, margin: 0, letterSpacing: -0.5 }}>
            Salesforce Org Health
          </h1>
          <p style={{ color: COLORS.muted, marginTop: 8, fontSize: 14 }}>
            Connect using a session token — no passwords stored or transmitted.
          </p>
        </div>

        <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.panelBorder}`, borderRadius: 16, padding: 32 }}>
          <div style={{ background: COLORS.highlight, border: `1px solid ${COLORS.accent}33`, borderRadius: 8, padding: "10px 14px", marginBottom: 28, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ fontSize: 14 }}>🔒</span>
            <p style={{ margin: 0, fontSize: 12, color: COLORS.muted, lineHeight: 1.6 }}>
              This tool uses <strong style={{ color: COLORS.accent }}>Salesforce Session Tokens</strong> only. No username or password is ever requested, stored, or sent outside your browser session. Tokens expire automatically per your org's session settings.
            </p>
          </div>

          <label style={{ display: "block", marginBottom: 18 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.muted, letterSpacing: 1, textTransform: "uppercase" }}>Instance URL</span>
            <input
              value={instanceUrl}
              onChange={e => setInstanceUrl(e.target.value)}
              placeholder="https://yourorg.my.salesforce.com"
              style={{
                display: "block", width: "100%", marginTop: 8, padding: "12px 14px",
                background: COLORS.bg, border: `1px solid ${COLORS.panelBorder}`,
                borderRadius: 8, color: COLORS.text, fontSize: 14, outline: "none",
                fontFamily: "monospace", boxSizing: "border-box",
              }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 24 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.muted, letterSpacing: 1, textTransform: "uppercase" }}>Session Token</span>
            <input
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="00D3x000…"
              style={{
                display: "block", width: "100%", marginTop: 8, padding: "12px 14px",
                background: COLORS.bg, border: `1px solid ${COLORS.panelBorder}`,
                borderRadius: 8, color: COLORS.text, fontSize: 14, outline: "none",
                fontFamily: "monospace", boxSizing: "border-box",
              }}
            />
            <span style={{ fontSize: 11, color: COLORS.muted, marginTop: 6, display: "block" }}>
              Obtain from: Developer Console → Debug → Get Session ID, or via SFDX CLI.
            </span>
          </label>

          {error && <p style={{ color: COLORS.critical, fontSize: 13, marginBottom: 16, marginTop: -8 }}>⚠ {error}</p>}

          <button
            onClick={handleConnect}
            disabled={connecting}
            style={{
              width: "100%", padding: "14px", background: connecting ? COLORS.muted : COLORS.accent,
              color: "#000", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 700,
              cursor: connecting ? "not-allowed" : "pointer", letterSpacing: 0.3,
              transition: "all 0.2s",
            }}
          >
            {connecting ? "Validating Session…" : "Connect & Run Health Check"}
          </button>

          <div style={{ marginTop: 20, display: "flex", gap: 16, justifyContent: "center" }}>
            {["No passwords stored", "Read-only access", "No PII exported"].map(t => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: COLORS.muted }}>
                <span style={{ color: COLORS.success }}>✓</span> {t}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScanScreen({ onDone }) {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStep(s => {
        const next = s + 1;
        setProgress(Math.round((next / SCAN_STEPS.length) * 100));
        if (next >= SCAN_STEPS.length) { clearInterval(interval); setTimeout(onDone, 600); }
        return next;
      });
    }, 520);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 32 }}>
      <div style={{ width: "100%", maxWidth: 480, textAlign: "center" }}>
        <div style={{ fontSize: 52, marginBottom: 20, animation: "pulse 1.5s infinite" }}>🔍</div>
        <h2 style={{ color: COLORS.text, fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Scanning Org…</h2>
        <p style={{ color: COLORS.muted, fontSize: 14, marginBottom: 32 }}>Running health checks against Salesforce best practices</p>

        <div style={{ background: COLORS.panelBorder, borderRadius: 100, height: 6, overflow: "hidden", marginBottom: 32 }}>
          <div style={{ width: `${progress}%`, height: "100%", background: COLORS.accent, borderRadius: 100, transition: "width 0.5s ease" }} />
        </div>

        <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.panelBorder}`, borderRadius: 12, padding: 20, textAlign: "left" }}>
          {SCAN_STEPS.slice(0, step + 1).map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: i < step ? `1px solid ${COLORS.panelBorder}` : "none" }}>
              <span style={{ fontSize: 13, color: i < step ? COLORS.success : COLORS.accent }}>
                {i < step ? "✓" : "›"}
              </span>
              <span style={{ fontSize: 13, color: i < step ? COLORS.muted : COLORS.text, fontFamily: "monospace" }}>{s}</span>
            </div>
          ))}
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
    </div>
  );
}

function DashboardScreen({ onReset }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [expandedFinding, setExpandedFinding] = useState(null);
  const data = MOCK_HEALTH_DATA;

  const tabs = [
    { id: "overview", label: "Overview", icon: "📊" },
    { id: "findings", label: "Findings", icon: "🔎" },
    { id: "data", label: "Data Volume", icon: "🗄️" },
    { id: "actions", label: "Action Plan", icon: "✅" },
  ];

  const effortColor = { Low: COLORS.success, Medium: COLORS.warning, High: COLORS.critical };
  const impactColor = { Critical: COLORS.critical, High: COLORS.warning, Medium: COLORS.info, Low: COLORS.muted };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ background: COLORS.panel, borderBottom: `1px solid ${COLORS.panelBorder}`, padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 24 }}>☁️</span>
          <div>
            <div style={{ fontWeight: 700, color: COLORS.text, fontSize: 16 }}>{data.org.name}</div>
            <div style={{ fontSize: 11, color: COLORS.muted, fontFamily: "monospace" }}>
              {data.org.id} · {data.org.edition} · API {data.org.apiVersion}
              <span style={{ marginLeft: 8, color: COLORS.critical, background: COLORS.critical + "22", padding: "1px 6px", borderRadius: 3 }}>PRODUCTION</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ fontSize: 12, color: COLORS.muted }}>Last scanned: just now</div>
          <button onClick={onReset} style={{ padding: "7px 16px", background: "transparent", border: `1px solid ${COLORS.panelBorder}`, color: COLORS.muted, borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
            ↩ Disconnect
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: COLORS.panel, borderBottom: `1px solid ${COLORS.panelBorder}`, display: "flex", padding: "0 24px", gap: 4 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: "13px 18px", background: "transparent",
            borderBottom: activeTab === t.id ? `2px solid ${COLORS.accent}` : "2px solid transparent",
            color: activeTab === t.id ? COLORS.accent : COLORS.muted,
            border: "none", borderBottom: activeTab === t.id ? `2px solid ${COLORS.accent}` : "2px solid transparent",
            cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, padding: 24, maxWidth: 1100, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>

        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <div>
            {/* Score cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 28 }}>
              <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.panelBorder}`, borderRadius: 12, padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <ScoreRing score={data.summary.score} size={90} />
                <div style={{ fontSize: 12, color: COLORS.muted, fontWeight: 600 }}>OVERALL HEALTH</div>
              </div>
              {[
                { label: "CRITICAL", count: data.summary.critical, color: COLORS.critical, icon: "🚨" },
                { label: "WARNING", count: data.summary.warning, color: COLORS.warning, icon: "⚠️" },
                { label: "INFO", count: data.summary.info, color: COLORS.info, icon: "ℹ️" },
              ].map(s => (
                <div key={s.label} style={{ background: COLORS.panel, border: `1px solid ${s.color}33`, borderRadius: 12, padding: 24 }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>{s.icon}</div>
                  <div style={{ fontSize: 36, fontWeight: 800, color: s.color, fontFamily: "monospace" }}>{s.count}</div>
                  <div style={{ fontSize: 11, color: COLORS.muted, letterSpacing: 1, fontWeight: 600 }}>{s.label} ISSUES</div>
                </div>
              ))}
            </div>

            {/* Category scores */}
            <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.panelBorder}`, borderRadius: 12, padding: 24 }}>
              <h3 style={{ margin: "0 0 20px", color: COLORS.text, fontSize: 15, fontWeight: 700 }}>Category Breakdown</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {data.categories.map(cat => {
                  const color = cat.score >= 75 ? COLORS.success : cat.score >= 50 ? COLORS.warning : COLORS.critical;
                  return (
                    <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ fontSize: 20, width: 30, textAlign: "center" }}>{cat.icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontSize: 13, color: COLORS.text, fontWeight: 500 }}>{cat.label}</span>
                          <span style={{ fontSize: 13, color, fontWeight: 700, fontFamily: "monospace" }}>{cat.score}/100</span>
                        </div>
                        <ProgressBar value={cat.score} max={100} color={color} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* FINDINGS TAB */}
        {activeTab === "findings" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {data.categories.map(cat => (
              <div key={cat.id} style={{ background: COLORS.panel, border: `1px solid ${COLORS.panelBorder}`, borderRadius: 12, overflow: "hidden" }}>
                <div
                  onClick={() => setExpandedCategory(expandedCategory === cat.id ? null : cat.id)}
                  style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 20 }}>{cat.icon}</span>
                    <span style={{ fontWeight: 700, color: COLORS.text }}>{cat.label}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      {["critical", "warning"].map(sev => {
                        const count = cat.findings.filter(f => f.severity === sev).length;
                        return count > 0 ? <SeverityBadge key={sev} severity={sev} /> : null;
                      })}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <ScoreRing score={cat.score} size={44} />
                    <span style={{ color: COLORS.muted, fontSize: 18 }}>{expandedCategory === cat.id ? "▲" : "▼"}</span>
                  </div>
                </div>

                {expandedCategory === cat.id && (
                  <div style={{ borderTop: `1px solid ${COLORS.panelBorder}` }}>
                    {cat.findings.map((f, i) => {
                      const fid = `${cat.id}-${i}`;
                      const isOpen = expandedFinding === fid;
                      const sevColor = { critical: COLORS.critical, warning: COLORS.warning, info: COLORS.info }[f.severity];
                      return (
                        <div key={i} style={{ borderBottom: i < cat.findings.length - 1 ? `1px solid ${COLORS.panelBorder}` : "none" }}>
                          <div
                            onClick={() => setExpandedFinding(isOpen ? null : fid)}
                            style={{ padding: "14px 20px", display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", background: isOpen ? COLORS.highlight : "transparent" }}
                          >
                            <div style={{ width: 4, height: 36, background: sevColor, borderRadius: 2, flexShrink: 0, marginTop: 2 }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 4 }}>
                                <SeverityBadge severity={f.severity} />
                                <span style={{ fontWeight: 600, color: COLORS.text, fontSize: 14 }}>{f.title}</span>
                              </div>
                              <p style={{ margin: 0, fontSize: 13, color: COLORS.muted, lineHeight: 1.5 }}>{f.description}</p>
                            </div>
                            <span style={{ color: COLORS.muted, fontSize: 14, flexShrink: 0 }}>{isOpen ? "▲" : "▼"}</span>
                          </div>
                          {isOpen && (
                            <div style={{ padding: "12px 20px 16px 36px", background: COLORS.bg, borderTop: `1px solid ${COLORS.panelBorder}` }}>
                              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                <span style={{ fontSize: 16 }}>🔧</span>
                                <div>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.accent, letterSpacing: 1, marginBottom: 4 }}>RECOMMENDED ACTION</div>
                                  <p style={{ margin: 0, fontSize: 13, color: COLORS.text, lineHeight: 1.6 }}>{f.action}</p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* DATA VOLUME TAB */}
        {activeTab === "data" && (
          <div>
            <div style={{ background: COLORS.highlight, border: `1px solid ${COLORS.accent}33`, borderRadius: 8, padding: "10px 16px", marginBottom: 20, display: "flex", gap: 10 }}>
              <span>🛡️</span>
              <p style={{ margin: 0, fontSize: 13, color: COLORS.muted }}>
                <strong style={{ color: COLORS.text }}>Privacy-safe mode active.</strong> Only record counts, storage sizes, and growth rates are displayed. No individual records, field values, or PII are accessed or shown.
              </p>
            </div>
            <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.panelBorder}`, borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: COLORS.highlight }}>
                    {["Object", "Record Count", "MoM Growth", "Storage", "Skew Risk", "Volume Bar"].map(h => (
                      <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: 0.8, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.dataVolume.map((row, i) => {
                    const maxRecs = Math.max(...data.dataVolume.map(r => r.records));
                    const growthColor = parseInt(row.growth) > 30 ? COLORS.critical : parseInt(row.growth) > 15 ? COLORS.warning : COLORS.success;
                    return (
                      <tr key={i} style={{ borderTop: `1px solid ${COLORS.panelBorder}` }}>
                        <td style={{ padding: "14px 16px", fontWeight: 600, color: COLORS.text, fontSize: 13 }}>{row.object}</td>
                        <td style={{ padding: "14px 16px", fontFamily: "monospace", color: COLORS.text, fontSize: 13 }}>{row.records.toLocaleString()}</td>
                        <td style={{ padding: "14px 16px", fontFamily: "monospace", color: growthColor, fontSize: 13, fontWeight: 600 }}>{row.growth}</td>
                        <td style={{ padding: "14px 16px", fontFamily: "monospace", color: COLORS.muted, fontSize: 13 }}>{row.storage}</td>
                        <td style={{ padding: "14px 16px" }}>
                          {row.skew ? <span style={{ fontSize: 11, color: COLORS.critical, background: COLORS.critical + "22", padding: "2px 8px", borderRadius: 3, fontWeight: 700 }}>⚠ SKEW</span>
                            : <span style={{ fontSize: 11, color: COLORS.success }}>✓ OK</span>}
                        </td>
                        <td style={{ padding: "14px 16px", width: 160 }}>
                          <ProgressBar value={row.records} max={maxRecs} color={row.skew ? COLORS.warning : COLORS.accent} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ACTION PLAN TAB */}
        {activeTab === "actions" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
              {[
                { label: "Immediate", count: data.actionItems.filter(a => a.deadline === "Immediate").length, color: COLORS.critical },
                { label: "Within 30 Days", count: data.actionItems.filter(a => a.deadline === "30 days").length, color: COLORS.warning },
                { label: "60-90 Days", count: data.actionItems.filter(a => ["60 days", "90 days"].includes(a.deadline)).length, color: COLORS.info },
                { label: "Before Deadline", count: data.actionItems.filter(a => a.deadline.includes("'")).length, color: COLORS.accent },
              ].map(s => (
                <div key={s.label} style={{ background: COLORS.panel, border: `1px solid ${s.color}33`, borderRadius: 10, padding: "16px 20px" }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: s.color, fontFamily: "monospace" }}>{s.count}</div>
                  <div style={{ fontSize: 12, color: COLORS.muted, fontWeight: 500 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {data.actionItems.map((item, i) => (
                <div key={i} style={{ background: COLORS.panel, border: `1px solid ${COLORS.panelBorder}`, borderRadius: 10, padding: "16px 20px", display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: COLORS.highlight, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: COLORS.muted, fontSize: 14, flexShrink: 0 }}>
                    {item.priority}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, color: COLORS.text, fontSize: 14 }}>{item.title}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, color: COLORS.muted, background: COLORS.highlight, padding: "2px 8px", borderRadius: 4 }}>{item.category}</span>
                      <span style={{ fontSize: 11, color: impactColor[item.impact], background: impactColor[item.impact] + "22", padding: "2px 8px", borderRadius: 4 }}>Impact: {item.impact}</span>
                      <span style={{ fontSize: 11, color: effortColor[item.effort], background: effortColor[item.effort] + "22", padding: "2px 8px", borderRadius: 4 }}>Effort: {item.effort}</span>
                      <span style={{ fontSize: 11, color: COLORS.warning, background: COLORS.warning + "22", padding: "2px 8px", borderRadius: 4 }}>📅 {item.deadline}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────── APP ROOT ───────────────────────────────

export default function App() {
  const [screen, setScreen] = useState("connect"); // connect | scan | dashboard

  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", color: COLORS.text, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      {screen === "connect" && <ConnectScreen onConnect={() => setScreen("scan")} />}
      {screen === "scan" && <ScanScreen onDone={() => setScreen("dashboard")} />}
      {screen === "dashboard" && <DashboardScreen onReset={() => setScreen("connect")} />}
    </div>
  );
}
