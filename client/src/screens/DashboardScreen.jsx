import { useState, useEffect } from "react";
import { api } from "../api";
import { useTheme } from "../ThemeContext";
import ScoreRing from "../components/ScoreRing";
import ProgressBar from "../components/ProgressBar";
import SeverityBadge from "../components/SeverityBadge";
import { exportDashboardPdf } from "../pdfExport";
import AiInsightsTab from "./AiInsightsTab";

function fmtMB(mb) {
  if (mb == null) return "—";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

function StorageBar({ used, max, color }) {
  const { colors } = useTheme();
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const barColor = pct >= 90 ? colors.critical : pct >= 70 ? colors.warning : color;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 12 }}>
        <span style={{ color: colors.muted }}>{fmtMB(used)} used of {fmtMB(max)}</span>
        <span style={{ color: barColor, fontWeight: 700, fontFamily: "monospace" }}>{pct}%</span>
      </div>
      <div style={{ background: colors.highlight, borderRadius: 4, height: 8, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 4, transition: "width 1s ease" }} />
      </div>
      <div style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>{fmtMB(max - used)} remaining</div>
    </div>
  );
}

export default function DashboardScreen({ data, onFinish, onOpenHistoryRun }) {
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState("overview");
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [expandedFinding, setExpandedFinding] = useState(null);
  const [expandedAction, setExpandedAction] = useState(null);

  const tabs = [
    { id: "overview",  label: "Overview",          icon: "📊" },
    { id: "checks",    label: "Checks Performed",  icon: "🔬" },
    { id: "findings",  label: "Findings",          icon: "🔎" },
    { id: "clouds",    label: "Cloud Skills",      icon: "☁️" },
    { id: "techdebt",  label: "Tech Debt",         icon: "🔩" },
    { id: "ai",        label: "AI Insights",       icon: "🧠" },
    { id: "actions",   label: "Action Plan",       icon: "✅" },
    { id: "history",   label: "History",           icon: "📅" },
  ];

  const effortColor = { Low: colors.success, Medium: colors.warning, High: colors.critical };
  const impactColor = { Critical: colors.critical, High: colors.warning, Medium: colors.info, Low: colors.muted };

  function handleCategoryToggle(catId) {
    setExpandedFinding(null);
    setExpandedCategory(prev => prev === catId ? null : catId);
  }

  const storage = data.storage;
  const features = data.orgFeatures;
  const coverage = data.coverage;
  const orgCheck = data.orgCheckResult;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ background: colors.panel, borderBottom: `1px solid ${colors.panelBorder}`, padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 24 }}>☁️</span>
          <div>
            <div style={{ fontWeight: 700, color: colors.text, fontSize: 16 }}>{data.org.name || data.org.alias}</div>
            <div style={{ fontSize: 11, color: colors.muted, fontFamily: "monospace" }}>
              {data.org.id} · {data.org.edition} · API {data.org.apiVersion}
              {!data.org.isSandbox && <span style={{ marginLeft: 8, color: colors.critical, background: colors.critical + "22", padding: "1px 6px", borderRadius: 3 }}>PRODUCTION</span>}
              {data.org.isSandbox  && <span style={{ marginLeft: 8, color: colors.warning,  background: colors.warning  + "22", padding: "1px 6px", borderRadius: 3 }}>SANDBOX</span>}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ fontSize: 12, color: colors.muted }}>Scanned: just now</div>
          <button onClick={onFinish} style={{ padding: "7px 16px", background: colors.accent, border: "none", color: "#000", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
            Finish →
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: colors.panel, borderBottom: `1px solid ${colors.panelBorder}`, display: "flex", padding: "0 24px", gap: 4 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: "13px 18px", background: "transparent",
            borderBottom: activeTab === t.id ? `2px solid ${colors.accent}` : "2px solid transparent",
            borderTop: "none", borderLeft: "none", borderRight: "none",
            color: activeTab === t.id ? colors.accent : colors.muted,
            cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, padding: 24, maxWidth: 1100, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>

        {/* ── OVERVIEW ──────────────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>

            {/* Left pane — org features */}
            <div style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Agentforce */}
              <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: 20 }}>
                <h3 style={{ margin: "0 0 14px", color: colors.text, fontSize: 13, fontWeight: 700 }}>🤖 Agentforce</h3>
                {!features ? (
                  <p style={{ margin: 0, fontSize: 12, color: colors.muted }}>Unavailable</p>
                ) : features.agentforce.enabled ? (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: colors.success }} />
                      <span style={{ fontSize: 13, color: colors.success, fontWeight: 700 }}>Enabled</span>
                    </div>
                    <div style={{ display: "flex", gap: 12 }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 24, fontWeight: 800, color: colors.success, fontFamily: "monospace" }}>{features.agentforce.activeCount}</div>
                        <div style={{ fontSize: 10, color: colors.muted, letterSpacing: 0.5 }}>ACTIVE</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 24, fontWeight: 800, color: colors.muted, fontFamily: "monospace" }}>{features.agentforce.totalCount}</div>
                        <div style={{ fontSize: 10, color: colors.muted, letterSpacing: 0.5 }}>TOTAL</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: colors.muted }} />
                    <span style={{ fontSize: 13, color: colors.muted }}>Not enabled</span>
                  </div>
                )}
              </div>

              {/* Enabled clouds */}
              <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: 20 }}>
                <h3 style={{ margin: "0 0 14px", color: colors.text, fontSize: 13, fontWeight: 700 }}>☁️ Salesforce Clouds</h3>
                {!features ? (
                  <p style={{ margin: 0, fontSize: 12, color: colors.muted }}>Unavailable</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {features.clouds.map((cloud, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: colors.accent, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: colors.text }}>{cloud}</span>
                      </div>
                    ))}
                    {features.clouds.length === 0 && (
                      <p style={{ margin: 0, fontSize: 12, color: colors.muted }}>None detected</p>
                    )}
                  </div>
                )}
              </div>

              {/* Installed packages */}
              <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: 20 }}>
                <h3 style={{ margin: "0 0 14px", color: colors.text, fontSize: 13, fontWeight: 700 }}>📦 Installed Packages</h3>
                {!features ? (
                  <p style={{ margin: 0, fontSize: 12, color: colors.muted }}>Unavailable</p>
                ) : features.packages === null ? (
                  <p style={{ margin: 0, fontSize: 12, color: colors.muted }}>Could not query packages</p>
                ) : features.packages.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 12, color: colors.muted }}>No managed packages installed</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {features.packages.map((pkg, i) => (
                      <div key={i} style={{ borderBottom: i < features.packages.length - 1 ? `1px solid ${colors.panelBorder}` : "none", paddingBottom: i < features.packages.length - 1 ? 10 : 0 }}>
                        <div style={{ fontSize: 12, color: colors.text, fontWeight: 600, marginBottom: 2 }}>{pkg.name}</div>
                        <div style={{ display: "flex", gap: 8 }}>
                          {pkg.namespace && (
                            <span style={{ fontSize: 10, fontFamily: "monospace", color: colors.accent, background: colors.accent + "18", padding: "1px 5px", borderRadius: 3 }}>{pkg.namespace}</span>
                          )}
                          {pkg.version && (
                            <span style={{ fontSize: 10, color: colors.muted }}>{pkg.version}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right pane — health metrics */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Score cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
                <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <ScoreRing score={data.summary.score} size={90} />
                  <div style={{ fontSize: 12, color: colors.muted, fontWeight: 600 }}>OVERALL HEALTH</div>
                </div>
                {[
                  { label: "CRITICAL", count: data.summary.critical, color: colors.critical, icon: "🚨" },
                  { label: "WARNING",  count: data.summary.warning,  color: colors.warning,  icon: "⚠️" },
                  { label: "INFO",     count: data.summary.info,     color: colors.info,     icon: "ℹ️" },
                ].map(s => (
                  <div key={s.label} style={{ background: colors.panel, border: `1px solid ${s.color}33`, borderRadius: 12, padding: 24 }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>{s.icon}</div>
                    <div style={{ fontSize: 36, fontWeight: 800, color: s.color, fontFamily: "monospace" }}>{s.count}</div>
                    <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 1, fontWeight: 600 }}>{s.label} ISSUES</div>
                  </div>
                ))}
              </div>

              {/* Storage metrics */}
              <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: 24 }}>
                <h3 style={{ margin: "0 0 20px", color: colors.text, fontSize: 15, fontWeight: 700 }}>🗄️ Storage Usage</h3>
                {!storage ? (
                  <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>
                    Storage metrics unavailable — access token may not include API access, or the org blocked the /limits call.
                  </p>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24 }}>
                    {[
                      { label: "Data Storage",      key: "dataStorage",      icon: "💾", color: colors.accent },
                      { label: "File Storage",       key: "fileStorage",      icon: "📁", color: colors.accentSoft },
                      { label: "Big Object Storage", key: "bigObjectStorage", icon: "🗜️", color: colors.info },
                    ].map(({ label, key, icon, color }) => {
                      const s = storage[key];
                      return (
                        <div key={key}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                            <span style={{ fontSize: 18 }}>{icon}</span>
                            <span style={{ fontWeight: 600, color: colors.text, fontSize: 13 }}>{label}</span>
                          </div>
                          {s ? (
                            <StorageBar used={s.used} max={s.max} color={color} />
                          ) : (
                            <p style={{ color: colors.muted, fontSize: 12, margin: 0 }}>Not available for this org edition.</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Apex test coverage */}
              <CoveragePanel coverage={coverage} />

              {/* Category breakdown */}
              <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: 24 }}>
                <h3 style={{ margin: "0 0 20px", color: colors.text, fontSize: 15, fontWeight: 700 }}>Category Breakdown</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {data.categories.map(cat => {
                    const color = cat.score >= 75 ? colors.success : cat.score >= 50 ? colors.warning : colors.critical;
                    return (
                      <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ fontSize: 20, width: 30, textAlign: "center" }}>{cat.icon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontSize: 13, color: colors.text, fontWeight: 500 }}>{cat.label}</span>
                            <span style={{ fontSize: 13, color, fontWeight: 700, fontFamily: "monospace" }}>{cat.score}/100</span>
                          </div>
                          <ProgressBar value={cat.score} max={100} color={color} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Legend */}
              <Legend />
            </div>
          </div>
        )}

        {/* ── CHECKS PERFORMED ──────────────────────────────────────────────── */}
        {activeTab === "checks" && (
          <ChecksTab categories={data.categories} clouds={data.clouds || []} />
        )}

        {/* ── FINDINGS ──────────────────────────────────────────────────────── */}
        {activeTab === "findings" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {data.categories.map(cat => (
              <div key={cat.id} style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, overflow: "hidden" }}>
                <div
                  role="button" aria-expanded={expandedCategory === cat.id}
                  onClick={() => handleCategoryToggle(cat.id)}
                  style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 20 }}>{cat.icon}</span>
                    <span style={{ fontWeight: 700, color: colors.text }}>{cat.label}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      {["critical", "warning"].map(sev => {
                        const count = cat.findings.filter(f => f.severity === sev).length;
                        return count > 0 ? <SeverityBadge key={sev} severity={sev} /> : null;
                      })}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <ScoreRing score={cat.score} size={44} />
                    <span style={{ color: colors.muted, fontSize: 18 }}>{expandedCategory === cat.id ? "▲" : "▼"}</span>
                  </div>
                </div>

                {expandedCategory === cat.id && (
                  <div style={{ borderTop: `1px solid ${colors.panelBorder}` }}>
                    {cat.findings.map((f, i) => {
                      const fid = `${cat.id}-${i}`;
                      const isOpen = expandedFinding === fid;
                      const sevColor = { critical: colors.critical, warning: colors.warning, info: colors.info }[f.severity];
                      return (
                        <div key={i} style={{ borderBottom: i < cat.findings.length - 1 ? `1px solid ${colors.panelBorder}` : "none" }}>
                          <div
                            role="button" aria-expanded={isOpen}
                            onClick={() => setExpandedFinding(isOpen ? null : fid)}
                            style={{ padding: "14px 20px", display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", background: isOpen ? colors.highlight : "transparent" }}
                          >
                            <div style={{ width: 4, height: 36, background: sevColor, borderRadius: 2, flexShrink: 0, marginTop: 2 }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 4 }}>
                                <SeverityBadge severity={f.severity} />
                                <span style={{ fontWeight: 600, color: colors.text, fontSize: 14 }}>{f.title}</span>
                              </div>
                              <p style={{ margin: 0, fontSize: 13, color: colors.muted, lineHeight: 1.5 }}>{f.description}</p>
                            </div>
                            <span style={{ color: colors.muted, fontSize: 14, flexShrink: 0 }}>{isOpen ? "▲" : "▼"}</span>
                          </div>
                          {isOpen && (
                            <div style={{ padding: "12px 20px 16px 36px", background: colors.bg, borderTop: `1px solid ${colors.panelBorder}` }}>
                              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: f.components?.length ? 14 : 0 }}>
                                <span style={{ fontSize: 16 }}>🔧</span>
                                <div>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: colors.accent, letterSpacing: 1, marginBottom: 4 }}>RECOMMENDED ACTION</div>
                                  <p style={{ margin: 0, fontSize: 13, color: colors.text, lineHeight: 1.6 }}>{f.action}</p>
                                </div>
                              </div>
                              {f.components?.length > 0 && (
                                <ComponentList components={f.components} />
                              )}
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

        {/* ── CLOUD SKILLS ──────────────────────────────────────────────────── */}
        {activeTab === "clouds" && (
          <CloudsTab clouds={data.clouds || []} />
        )}

        {/* ── TECH DEBT (OrgCheck) ──────────────────────────────────────────── */}
        {activeTab === "techdebt" && (
          <TechDebtTab orgCheck={orgCheck} />
        )}

        {/* ── AI INSIGHTS ───────────────────────────────────────────────────── */}
        {activeTab === "ai" && (
          <AiInsightsTab
            runId={data.runId}
            orgAlias={data.org.alias}
            orgContext={{
              orgName: data.org.name || data.org.alias,
              orgId: data.org.id,
              edition: data.org.edition,
              isSandbox: data.org.isSandbox,
              actionItems: data.actionItems,
            }}
            isHistory={false}
            metadataRetained={data.metadataRetained ?? true}
          />
        )}

        {/* ── ACTION PLAN ───────────────────────────────────────────────────── */}
        {activeTab === "actions" && (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
              <button
                onClick={() => exportDashboardPdf({ data, checkCatalog: CHECK_CATALOG, categoryMeta: CATEGORY_META_CLIENT })}
                style={{
                  padding: "9px 18px", background: colors.accent, border: "none", color: "#000",
                  borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 700,
                  display: "inline-flex", alignItems: "center", gap: 8,
                }}
              >
                ⬇ Download Report (PDF)
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
              {[
                { label: "Immediate",       count: data.actionItems.filter(a => a.deadline === "Immediate").length,                              color: colors.critical },
                { label: "Within 30 Days",  count: data.actionItems.filter(a => a.deadline === "30 days").length,                               color: colors.warning },
                { label: "60-90 Days",      count: data.actionItems.filter(a => ["60 days", "90 days"].includes(a.deadline)).length,             color: colors.info },
                { label: "Before Deadline", count: data.actionItems.filter(a => a.deadline.includes("'")).length,                               color: colors.accent },
              ].map(s => (
                <div key={s.label} style={{ background: colors.panel, border: `1px solid ${s.color}33`, borderRadius: 10, padding: "16px 20px" }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: s.color, fontFamily: "monospace" }}>{s.count}</div>
                  <div style={{ fontSize: 12, color: colors.muted, fontWeight: 500 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {data.actionItems.map((item, i) => {
                const isOpen = expandedAction === i;
                return (
                  <div key={i} style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 10, overflow: "hidden" }}>
                    <div
                      onClick={() => setExpandedAction(isOpen ? null : i)}
                      style={{ padding: "16px 20px", display: "flex", gap: 16, alignItems: "flex-start", cursor: "pointer", background: isOpen ? colors.highlight : "transparent" }}
                    >
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: colors.highlight, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: colors.muted, fontSize: 14, flexShrink: 0 }}>
                        {item.priority}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: colors.text, fontSize: 14, marginBottom: 6 }}>{item.title}</div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, color: impactColor[item.impact], background: impactColor[item.impact] + "22", padding: "2px 8px", borderRadius: 4 }}>Impact: {item.impact}</span>
                          <span style={{ fontSize: 11, color: effortColor[item.effort], background: effortColor[item.effort] + "22", padding: "2px 8px", borderRadius: 4 }}>Effort: {item.effort}</span>
                          <span style={{ fontSize: 11, color: colors.warning, background: colors.warning + "22", padding: "2px 8px", borderRadius: 4 }}>📅 {item.deadline}</span>
                          {item.components?.length > 0 && (
                            <span style={{ fontSize: 11, color: colors.muted, background: colors.highlight, padding: "2px 8px", borderRadius: 4 }}>
                              📦 {item.components.length} component{item.components.length > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                      <span style={{ color: colors.muted, fontSize: 14, flexShrink: 0 }}>{isOpen ? "▲" : "▼"}</span>
                    </div>

                    {isOpen && (
                      <div style={{ padding: "0 20px 16px 68px", borderTop: `1px solid ${colors.panelBorder}`, background: colors.bg }}>
                        <div style={{ paddingTop: 14, display: "flex", gap: 10, alignItems: "flex-start", marginBottom: item.components?.length ? 14 : 0 }}>
                          <span style={{ fontSize: 16 }}>🔧</span>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: colors.accent, letterSpacing: 1, marginBottom: 4 }}>RECOMMENDED ACTION</div>
                            <p style={{ margin: 0, fontSize: 13, color: colors.text, lineHeight: 1.6 }}>{item.action}</p>
                          </div>
                        </div>
                        {item.components?.length > 0 && (
                          <ComponentList components={item.components} />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {data.actionItems.length === 0 && (
                <div style={{ background: colors.panel, border: `1px solid ${colors.success}33`, borderRadius: 10, padding: 24, textAlign: "center" }}>
                  <div style={{ fontSize: 32 }}>🎉</div>
                  <p style={{ color: colors.success, fontWeight: 700, margin: "8px 0 0" }}>No critical or warning action items found!</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── HISTORY ───────────────────────────────────────────────────────── */}
        {activeTab === "history" && (
          <HistoryTab orgId={data.org.id} currentRunId={data.runId} onOpenRun={onOpenHistoryRun} />
        )}
      </div>
    </div>
  );
}

// Static catalog of every rule the analyzer runs — one row per check.
// `matchTitle` is used to find the live finding by prefix-matching finding.title.
// `scope` is "core" for the five weighted categories, or "cloud:<id>" for
// per-cloud checks (looked up against data.clouds[].findings instead of
// data.categories[].findings).
const CHECK_CATALOG = [
  {
    category: "security",
    scope: "core",
    checks: [
      {
        name: "System Administrator User Count",
        metadata: "User SOQL — Profile.Name = 'System Administrator' AND IsActive = true",
        what: "Counts active users assigned to the System Administrator profile; flags critical when more than 5",
        scoreImpact: "−20 per critical finding",
        matchTitle: "Active Users Have System Administrator Profile",
      },
      {
        name: "Broad Data Permissions on Profiles",
        metadata: "Profile (.profile-meta.xml)",
        what: "Counts profiles with ModifyAllData, ViewAllData, or ManageUsers enabled",
        scoreImpact: "−10 per warning finding",
        matchTitle: "Profiles Have Broad Data Permissions",
      },
      {
        name: "ModifyAllData in Permission Sets",
        metadata: "PermissionSet (.permissionset-meta.xml)",
        what: "Flags permission sets where ModifyAllData is explicitly enabled",
        scoreImpact: "−10 per warning finding",
        matchTitle: "Permission Set(s) Grant ModifyAllData",
      },
      {
        name: "Connected App OAuth Scopes",
        metadata: "ConnectedApp (.connectedApp-meta.xml)",
        what: "Identifies connected apps authorised with Full OAuth scope",
        scoreImpact: "−10 per warning finding",
        matchTitle: "Connected App(s) Use Full OAuth Scope",
      },
      {
        name: "Multi-Country Logins",
        metadata: "LoginHistory SOQL — last 30 days, distinct CountryIso per UserId",
        what: "Flags users who logged in from 3 or more distinct countries in the past 30 days (credible credential-sharing / compromise signal)",
        scoreImpact: "−20 per critical finding",
        matchTitle: "Logged In From 3+ Countries",
      },
      {
        name: "API-Only User Browser Login",
        metadata: "User + LoginHistory — profile name matches integration / API-only patterns AND LoginType = 'Application'",
        what: "Flags integration / API-only users who recorded an interactive UI login — a sign the account has been repurposed or its credentials are being misused",
        scoreImpact: "−20 per critical finding",
        matchTitle: "API-Only User(s) Recorded an Interactive UI Login",
      },
      {
        name: "Stale Active Users",
        metadata: "User SOQL — IsActive = true AND UserType = 'Standard', LastLoginDate older than 90 days",
        what: "Active Standard users who haven't logged in for 90+ days — wasted licences and dormant credential surface",
        scoreImpact: "−10 per warning finding",
        matchTitle: "Active User(s) Not Logged In for 90+ Days",
      },
      {
        name: "Never-Logged-In Active Users",
        metadata: "User SOQL — IsActive = true AND UserType = 'Standard', LastLoginDate IS NULL, CreatedDate older than 30 days",
        what: "Active Standard users provisioned more than 30 days ago who have never logged in",
        scoreImpact: "−10 per warning finding",
        matchTitle: "Active User(s) Have Never Logged In",
      },
    ],
  },
  {
    category: "automation",
    scope: "core",
    checks: [
      {
        name: "Active Process Builders",
        metadata: "Flow (.flow-meta.xml) — processType = Workflow",
        what: "Detects active flows of type Workflow (retired Process Builder)",
        scoreImpact: "−20 per critical finding",
        matchTitle: "Active Process Builder(s) Detected",
      },
      {
        name: "Flows Without Fault Handling",
        metadata: "Flow (.flow-meta.xml) — absence of faultConnector / <Fault>",
        what: "Flags active flows that have no fault connector path defined",
        scoreImpact: "−8 per warning finding",
        matchTitle: "Active Flows Lack Fault Handling",
      },
      {
        name: "Automation Conflicts per Object",
        metadata: "Flow (.flow-meta.xml) — flow.start.object grouping",
        what: "Identifies objects with 3 or more active flows, indicating potential execution-order conflicts",
        scoreImpact: "−8 per warning finding",
        matchTitle: "Automation Conflicts on",
      },
      {
        name: "Active Workflow Rules",
        metadata: "Workflow (.workflow-meta.xml) — rules[].active",
        what: "Counts active workflow rules, which are a legacy automation mechanism",
        scoreImpact: "−8 per warning finding",
        matchTitle: "Active Workflow Rule(s) Detected",
      },
    ],
  },
  {
    category: "apex",
    scope: "core",
    checks: [
      {
        name: "SOQL Queries Inside Loops",
        metadata: "ApexClass (.cls) — regex scan of for/while loop bodies",
        what: "Detects [SELECT …] inside for or while loop blocks using a regex state machine",
        scoreImpact: "−25 per critical finding",
        matchTitle: "SOQL in Loops",
      },
      {
        name: "Apex Class API Version Staleness",
        metadata: "ApexClass (.cls-meta.xml) — apiVersion field",
        what: "Flags classes with apiVersion below 55.0",
        scoreImpact: "−10 per warning finding",
        matchTitle: "Apex Class(es) on API Version",
      },
      {
        name: "High Apex Trigger Volume",
        metadata: "ApexTrigger (.trigger) — file count",
        what: "Warns when more than 10 triggers exist, increasing risk of conflicting execution order",
        scoreImpact: "−10 per warning finding",
        matchTitle: "Apex Triggers — High Volume",
      },
      {
        name: "Org-Wide Apex Test Coverage",
        metadata: "Tooling API: ApexOrgWideCoverage.PercentCovered",
        what: "Critical when below 75% (deploy-blocker); warning when 75–79%",
        scoreImpact: "−25 critical / −10 warning",
        matchTitle: "Org-Wide Apex Coverage Below",
      },
      {
        name: "Per-Class Apex Coverage",
        metadata: "Tooling API: ApexCodeCoverageAggregate (covered/uncovered lines)",
        what: "Lists classes and triggers with executable lines whose coverage is below 80%",
        scoreImpact: "−10 per warning finding",
        matchTitle: "Apex Class(es)/Trigger(s) Below 80% Coverage",
      },
    ],
  },
  {
    category: "datamodel",
    scope: "core",
    checks: [
      {
        name: "Custom Object Count",
        metadata: "CustomObject — objects/ directory enumeration",
        what: "Counts __c, __mdt, and __e object directories; warns above 300",
        scoreImpact: "−8 per warning finding",
        matchTitle: "High Custom Object Count",
      },
      {
        name: "Lookup Fields Without Delete Behaviour",
        metadata: "CustomField (.field-meta.xml) — type = Lookup, deleteConstraint absence",
        what: "Flags lookup fields with no deleteConstraint configured (SetNull / Restrict / Cascade)",
        scoreImpact: "−8 per warning finding",
        matchTitle: "Lookup Field(s) Without Delete Behaviour",
      },
      {
        name: "Deprecated Field Detection",
        metadata: "CustomField (.field-meta.xml) — description / label keywords",
        what: "Scans field descriptions and labels for 'deprecated', 'do not use', or 'obsolete' keywords",
        scoreImpact: "−8 per warning finding",
        matchTitle: "Field(s) Marked as Deprecated",
      },
    ],
  },
  {
    category: "deployment",
    scope: "core",
    checks: [
      {
        name: "Metadata API Version Staleness",
        metadata: "All *-meta.xml files — apiVersion field",
        what: "Counts all metadata items with apiVersion below 55.0 across all types",
        scoreImpact: "−10 per warning finding",
        matchTitle: "Metadata Items Below API",
      },
      {
        name: "LWC API Version Staleness",
        metadata: "LightningComponentBundle (.js-meta.xml) — apiVersion field",
        what: "Flags Lightning Web Components with apiVersion below 55.0",
        scoreImpact: "−10 per warning finding",
        matchTitle: "LWC Component(s) on Stale API Version",
      },
    ],
  },

  // ── Cloud-skills checks (informational — not in overall score) ────────────
  {
    category: "salescloud",
    scope: "cloud:salescloud",
    label: "💼 Sales Cloud",
    checks: [
      {
        name: "Active Opportunity Record Types",
        metadata: "RecordType (.recordType-meta.xml) under objects/Opportunity/",
        what: "Lists active Opportunity record types — segments your sales process by deal pipeline",
        scoreImpact: "Info only",
        matchTitle: "Active Opportunity Record Type",
      },
      {
        name: "Active Duplicate Rules",
        metadata: "Tooling SOQL — DuplicateRule (Lead/Account/Contact)",
        what: "Warns when no duplicate rules are active, allowing duplicate prospect/customer records",
        scoreImpact: "−12 per warning finding",
        matchTitle: "Duplicate Rule",
      },
      {
        name: "Active Lead Assignment Rule",
        metadata: "Tooling SOQL — AssignmentRule WHERE SobjectType = 'Lead'",
        what: "Warns when no Lead Assignment Rule is active, leaving inbound leads unrouted",
        scoreImpact: "−12 per warning finding",
        matchTitle: "Lead Assignment Rule",
      },
    ],
  },
  {
    category: "servicecloud",
    scope: "cloud:servicecloud",
    label: "🛟 Service Cloud",
    checks: [
      {
        name: "Active Case Assignment Rule",
        metadata: "Tooling SOQL — AssignmentRule WHERE SobjectType = 'Case'",
        what: "Critical when no Case Assignment Rule is active — cases sit on creators and miss SLAs",
        scoreImpact: "−30 per critical finding",
        matchTitle: "Case Assignment Rule",
      },
      {
        name: "Active Case Auto-Response Rule",
        metadata: "Tooling SOQL — AutoResponseRule WHERE SobjectType = 'Case'",
        what: "Warns when customers receive no automatic case acknowledgement",
        scoreImpact: "−12 per warning finding",
        matchTitle: "Case Auto-Response Rule",
      },
      {
        name: "Active Case Record Types",
        metadata: "RecordType under objects/Case/",
        what: "Lists active Case record types — usually maps to support channels or product lines",
        scoreImpact: "Info only",
        matchTitle: "Active Case Record Type",
      },
    ],
  },
  {
    category: "cpq",
    scope: "cloud:cpq",
    label: "💰 Salesforce CPQ / Revenue Cloud",
    checks: [
      {
        name: "CPQ Package Version",
        metadata: "Tooling SOQL — InstalledSubscriberPackage (SBQQ namespace)",
        what: "Reports the installed CPQ version so you can flag versions more than two minors behind latest",
        scoreImpact: "Info only",
        matchTitle: "CPQ Package Installed",
      },
      {
        name: "Active CPQ Price Rules",
        metadata: "SOQL — SBQQ__PriceRule__c WHERE SBQQ__Active__c = true",
        what: "Reports the count of active SBQQ price rules; informs whether quoting relies on conditional pricing",
        scoreImpact: "Info only",
        matchTitle: "CPQ Price Rule",
      },
      {
        name: "Quote-to-Cash Flows",
        metadata: "Flow (.flow-meta.xml) — start.object = SBQQ__Quote__c, status = Active",
        what: "Lists active Flows running on Quote, indicating quote-lifecycle automation",
        scoreImpact: "Info only",
        matchTitle: "Active Quote Flow",
      },
    ],
  },
];

const CATEGORY_META_CLIENT = {
  security:     { label: "Security & Access",         icon: "🔐", weight: "30%" },
  automation:   { label: "Automation & Flows",        icon: "🔄", weight: "25%" },
  apex:         { label: "Apex & Governor Limits",    icon: "⚡", weight: "20%" },
  datamodel:    { label: "Data Model & Architecture", icon: "🏗️", weight: "15%" },
  deployment:   { label: "Metadata & Deployment",     icon: "📦", weight: "10%" },
  // Cloud rows — weight is intentionally "Informational" since cloud-skill
  // scores don't roll into the overall org score.
  salescloud:   { label: "Sales Cloud",                icon: "💼", weight: "Informational" },
  servicecloud: { label: "Service Cloud",              icon: "🛟", weight: "Informational" },
  cpq:          { label: "CPQ / Revenue Cloud",        icon: "💰", weight: "Informational" },
};

function ChecksTab({ categories, clouds }) {
  const { colors } = useTheme();
  const [filter, setFilter] = useState("all");

  // Build a flat map of finding title fragments → finding, keyed by both
  // core category id and cloud id (clouds use "cloud:<id>" scope).
  const findingsByCategory = {};
  for (const cat of categories) findingsByCategory[cat.id] = cat.findings;
  const findingsByCloud = {};
  for (const c of clouds) findingsByCloud[c.id] = c.findings;

  function matchFinding(group, matchTitle) {
    const findings = group.scope === "core"
      ? (findingsByCategory[group.category] || [])
      : (findingsByCloud[group.category] || []);
    return findings.find(f => f.title.includes(matchTitle)) || null;
  }

  // Skip cloud groups whose cloud isn't detected in this org so the catalog
  // doesn't show outcomes for clouds the user doesn't have.
  const detectedCloudIds = new Set(clouds.map(c => c.id));
  const visibleGroups = CHECK_CATALOG.filter(group => {
    if (group.scope === "core") {
      if (filter === "cloud") return false;
      return true;
    }
    if (filter === "core") return false;
    return detectedCloudIds.has(group.category);
  });

  const outcomeColor = {
    critical: colors.critical,
    warning:  colors.warning,
    info:     colors.info,
    pass:     colors.success,
  };

  const outcomeLabel = {
    critical: "Critical",
    warning:  "Warning",
    info:     "Info",
    pass:     "Pass",
  };

  const outcomeIcon = {
    critical: "🚨",
    warning:  "⚠️",
    info:     "ℹ️",
    pass:     "✅",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Scoring formula note */}
      <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: "14px 20px", display: "flex", gap: 14, alignItems: "flex-start" }}>
        <span style={{ fontSize: 18 }}>🔢</span>
        <div>
          <div style={{ fontWeight: 700, color: colors.text, fontSize: 13, marginBottom: 4 }}>How the Overall Score is Calculated</div>
          <div style={{ fontSize: 12, color: colors.muted, lineHeight: 1.6 }}>
            Each category is scored 0–100 (starting at 100, deducting for findings). The overall score is a weighted average:
            Security 30% · Automation 25% · Apex 20% · Data Model 15% · Deployment 10%.
            Critical findings deduct more than warnings; passing a check with no issues leaves the score unchanged.
            Per-cloud checks are informational and don't affect the overall score.
          </div>
        </div>
      </div>

      {/* Filter chips */}
      <div style={{ display: "flex", gap: 8 }}>
        {[
          { id: "all", label: "All Checks" },
          { id: "core", label: "Core (Scored)" },
          { id: "cloud", label: "Per-Cloud (Informational)" },
        ].map(chip => {
          const active = filter === chip.id;
          return (
            <button
              key={chip.id}
              onClick={() => setFilter(chip.id)}
              style={{
                fontSize: 12, padding: "5px 12px", borderRadius: 6,
                background: active ? colors.accent : "transparent",
                color: active ? "#000" : colors.muted,
                border: `1px solid ${active ? colors.accent : colors.panelBorder}`,
                cursor: "pointer", fontWeight: 600,
              }}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {visibleGroups.map(group => {
        const { category, checks, scope } = group;
        const meta = CATEGORY_META_CLIENT[category] || { label: group.label || category, icon: "☁️", weight: "Informational" };
        const catData = scope === "core"
          ? categories.find(c => c.id === category)
          : clouds.find(c => c.id === category);
        const isCloud = scope !== "core";
        const score = isCloud
          ? (catData?.scoredChecks > 0 ? catData?.score : null)
          : catData?.score;
        const color = score == null
          ? colors.muted
          : score >= 75 ? colors.success : score >= 50 ? colors.warning : colors.critical;

        return (
          <div key={category} style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, overflow: "hidden" }}>
            {/* Category header */}
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${colors.panelBorder}`, display: "flex", alignItems: "center", gap: 12, background: colors.highlight }}>
              <span style={{ fontSize: 20 }}>{meta.icon}</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 700, color: colors.text, fontSize: 14 }}>{meta.label}</span>
                <span style={{ marginLeft: 10, fontSize: 11, color: colors.muted }}>
                  {isCloud ? "Cloud Skill — informational" : `Weight: ${meta.weight}`}
                </span>
              </div>
              {score != null && (
                <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "monospace", color }}>{score}/100</div>
              )}
            </div>

            {/* Column headers */}
            <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 220px 120px 100px", gap: 0, padding: "8px 20px", borderBottom: `1px solid ${colors.panelBorder}` }}>
              {["Check", "What is Evaluated", "Metadata Component", "Score Impact", "Outcome"].map(h => (
                <div key={h} style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.8, textTransform: "uppercase" }}>{h}</div>
              ))}
            </div>

            {/* Check rows */}
            {checks.map((check, i) => {
              const finding = matchFinding(group, check.matchTitle);
              const outcome = finding ? finding.severity : "pass";
              const oc = outcomeColor[outcome];
              return (
                <div
                  key={i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "220px 1fr 220px 120px 100px",
                    gap: 0,
                    padding: "14px 20px",
                    borderBottom: i < checks.length - 1 ? `1px solid ${colors.panelBorder}` : "none",
                    background: outcome === "pass" ? "transparent" : oc + "08",
                    alignItems: "start",
                  }}
                >
                  {/* Check name */}
                  <div style={{ paddingRight: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: colors.text }}>{check.name}</div>
                  </div>

                  {/* What is evaluated */}
                  <div style={{ paddingRight: 12 }}>
                    <div style={{ fontSize: 12, color: colors.muted, lineHeight: 1.5 }}>{check.what}</div>
                    {finding && (
                      <div style={{ marginTop: 6, fontSize: 11, color: oc, lineHeight: 1.4 }}>
                        {finding.title}
                        {finding.components?.length > 0 && (
                          <span style={{ marginLeft: 6, color: colors.muted }}>({finding.components.length} component{finding.components.length !== 1 ? "s" : ""})</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Metadata source */}
                  <div style={{ paddingRight: 12 }}>
                    <div style={{ fontSize: 11, color: colors.muted, fontFamily: "monospace", lineHeight: 1.5 }}>{check.metadata}</div>
                  </div>

                  {/* Score impact */}
                  <div style={{ paddingRight: 12 }}>
                    <div style={{ fontSize: 11, color: colors.muted }}>{check.scoreImpact}</div>
                  </div>

                  {/* Outcome badge */}
                  <div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 5,
                      color: oc, background: oc + "22",
                      display: "inline-flex", alignItems: "center", gap: 4,
                    }}>
                      {outcomeIcon[outcome]} {outcomeLabel[outcome]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function CloudsTab({ clouds }) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(null);

  if (clouds.length === 0) {
    return (
      <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 32 }}>☁️</div>
        <p style={{ color: colors.muted, margin: "8px 0 0" }}>
          No clouds detected. Sales Cloud and Service Cloud are always-on, so this likely means cloud signal queries failed — re-run the scan.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: "14px 20px", display: "flex", gap: 14, alignItems: "flex-start" }}>
        <span style={{ fontSize: 18 }}>☁️</span>
        <div>
          <div style={{ fontWeight: 700, color: colors.text, fontSize: 13, marginBottom: 4 }}>Cloud Skills (Informational)</div>
          <div style={{ fontSize: 12, color: colors.muted, lineHeight: 1.6 }}>
            Per-cloud scores are <strong>not</strong> rolled into the overall org health score — orgs aren't penalised for the clouds they've adopted.
            Cloud findings still flow into the Action Plan tab so you get one unified to-do list.
            Clouds shown as "Detection only" are recognised but don't have shipped checks yet.
          </div>
        </div>
      </div>

      {clouds.map((c, i) => {
        const isOpen = expanded === c.id;
        const isDetectOnly = c.scoredChecks === 0;
        // Detect-only clouds render a 100% gauge with a "Detection only"
        // sub-label so the score isn't misread as a verified pass.
        const score = isDetectOnly ? 100 : c.score;
        const scoreColor = isDetectOnly
          ? colors.muted
          : score >= 75 ? colors.success : score >= 50 ? colors.warning : colors.critical;

        const critCount = c.findings.filter(f => f.severity === "critical").length;
        const warnCount = c.findings.filter(f => f.severity === "warning").length;

        return (
          <div key={c.id || i} style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, overflow: "hidden" }}>
            <div
              role="button" aria-expanded={isOpen}
              onClick={() => setExpanded(isOpen ? null : c.id)}
              style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontSize: 24 }}>{c.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, color: colors.text, fontSize: 14 }}>{c.label}</div>
                  <div style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                    {isDetectOnly
                      ? "No checks shipped yet — detection only"
                      : `${c.scoredChecks} scored check${c.scoredChecks === 1 ? "" : "s"}`}
                    {(critCount + warnCount) > 0 && (
                      <span style={{ marginLeft: 8 }}>
                        {critCount > 0 && <SeverityBadge severity="critical" />}
                        {warnCount > 0 && <span style={{ marginLeft: 4 }}><SeverityBadge severity="warning" /></span>}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: scoreColor, fontFamily: "monospace", lineHeight: 1 }}>
                    {score == null ? "—" : `${score}`}
                  </div>
                  <div style={{ fontSize: 10, color: colors.muted, letterSpacing: 0.5, marginTop: 2 }}>
                    {isDetectOnly ? "DETECTED" : "/100"}
                  </div>
                </div>
                <span style={{ color: colors.muted, fontSize: 18 }}>{isOpen ? "▲" : "▼"}</span>
              </div>
            </div>

            {isOpen && (
              <div style={{ borderTop: `1px solid ${colors.panelBorder}` }}>
                {c.findings.length === 0 ? (
                  <div style={{ padding: "16px 20px", fontSize: 13, color: colors.muted }}>
                    No findings emitted for this cloud.
                  </div>
                ) : (
                  c.findings.map((f, j) => {
                    const sevColor = { critical: colors.critical, warning: colors.warning, info: colors.info }[f.severity];
                    return (
                      <div key={j} style={{ padding: "14px 20px", borderBottom: j < c.findings.length - 1 ? `1px solid ${colors.panelBorder}` : "none", display: "flex", alignItems: "flex-start", gap: 12 }}>
                        <div style={{ width: 4, height: 36, background: sevColor, borderRadius: 2, flexShrink: 0, marginTop: 2 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 4 }}>
                            <SeverityBadge severity={f.severity} />
                            <span style={{ fontWeight: 600, color: colors.text, fontSize: 14 }}>{f.title}</span>
                          </div>
                          <p style={{ margin: "0 0 8px", fontSize: 13, color: colors.muted, lineHeight: 1.5 }}>{f.description}</p>
                          <div style={{ fontSize: 12, color: colors.text, lineHeight: 1.5 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: colors.accent, letterSpacing: 1, marginRight: 8 }}>ACTION</span>
                            {f.action}
                          </div>
                          {f.components?.length > 0 && (
                            <div style={{ marginTop: 10 }}>
                              <ComponentList components={f.components} />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CoveragePanel({ coverage }) {
  const { colors } = useTheme();
  const [showAll, setShowAll] = useState(false);
  const LIMIT = 15;

  if (!coverage) {
    return (
      <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: 24 }}>
        <h3 style={{ margin: "0 0 14px", color: colors.text, fontSize: 15, fontWeight: 700 }}>🧪 Apex Test Coverage</h3>
        <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>
          Coverage data unavailable — the org may not have tooling-API access, or no Apex tests have been run.
        </p>
      </div>
    );
  }

  const orgPct = coverage.orgWidePercent;
  const orgColor = orgPct == null ? colors.muted : orgPct >= 80 ? colors.success : orgPct >= 75 ? colors.warning : colors.critical;
  const lowClasses = (coverage.classes || []).filter(c => c.percent < 80);
  const visible = showAll ? lowClasses : lowClasses.slice(0, LIMIT);

  return (
    <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: 24 }}>
      <h3 style={{ margin: "0 0 16px", color: colors.text, fontSize: 15, fontWeight: 700 }}>🧪 Apex Test Coverage</h3>

      <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: lowClasses.length > 0 ? 20 : 0 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, fontWeight: 800, color: orgColor, fontFamily: "monospace", lineHeight: 1 }}>
            {orgPct == null ? "—" : `${orgPct}%`}
          </div>
          <div style={{ fontSize: 10, color: colors.muted, letterSpacing: 1, fontWeight: 600, marginTop: 4 }}>ORG-WIDE</div>
        </div>

        <div style={{ flex: 1, fontSize: 12, color: colors.muted, lineHeight: 1.6 }}>
          <div>{coverage.classes.length} classes/triggers with coverage data.</div>
          <div>
            <span style={{ color: lowClasses.length > 0 ? colors.warning : colors.success, fontWeight: 700 }}>
              {lowClasses.length}
            </span>{" "}
            below 80% threshold.
          </div>
          {orgPct != null && orgPct < 75 && (
            <div style={{ color: colors.critical, marginTop: 4, fontWeight: 600 }}>
              ⚠ Below 75% — production deploys will be blocked.
            </div>
          )}
        </div>
      </div>

      {lowClasses.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.muted, letterSpacing: 1, marginBottom: 10 }}>
            CLASSES BELOW 80%
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {visible.map((c, i) => {
              const pctColor = c.percent >= 75 ? colors.warning : c.percent >= 50 ? "#ff8b3d" : colors.critical;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 10px", background: colors.highlight, borderRadius: 6 }}>
                  <span style={{ fontSize: 11, fontFamily: "monospace", color: colors.muted, width: 70, flexShrink: 0 }}>
                    {c.type === "ApexTrigger" ? "TRIGGER" : "CLASS"}
                  </span>
                  <span style={{ fontSize: 12, color: colors.text, flex: 1, fontFamily: "monospace", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.name}
                  </span>
                  <span style={{ fontSize: 11, color: colors.muted, fontFamily: "monospace" }}>
                    {c.coveredLines}/{c.totalLines}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: pctColor, fontFamily: "monospace", width: 48, textAlign: "right" }}>
                    {c.percent}%
                  </span>
                </div>
              );
            })}
          </div>
          {lowClasses.length > LIMIT && (
            <button
              onClick={() => setShowAll(s => !s)}
              style={{ marginTop: 10, fontSize: 11, color: colors.muted, background: "transparent", border: `1px solid ${colors.panelBorder}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer" }}
            >
              {showAll ? "Show less" : `+${lowClasses.length - LIMIT} more`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Legend() {
  const { colors } = useTheme();
  const groups = [
    {
      heading: "Severity",
      items: [
        { color: colors.critical, label: "Critical",  note: "Immediate risk — act now" },
        { color: colors.warning,  label: "Warning",   note: "Should be addressed soon" },
        { color: colors.info,     label: "Info",      note: "Informational, no urgent action" },
        { color: colors.success,  label: "Pass",      note: "No issues detected" },
      ],
    },
    {
      heading: "Health Score",
      items: [
        { color: colors.success, label: "75 – 100", note: "Healthy" },
        { color: colors.warning, label: "50 – 74",  note: "Needs attention" },
        { color: colors.critical,label: "0 – 49",   note: "At risk" },
      ],
    },
    {
      heading: "Storage Usage",
      items: [
        { color: colors.accent,   label: "< 70%",  note: "Normal" },
        { color: colors.warning,  label: "70 – 89%", note: "Getting full" },
        { color: colors.critical, label: "≥ 90%",  note: "Critical — near limit" },
      ],
    },
    {
      heading: "Effort (Action Plan)",
      items: [
        { color: colors.success,  label: "Low",    note: "Quick win, minimal work" },
        { color: colors.warning,  label: "Medium", note: "Moderate effort required" },
        { color: colors.critical, label: "High",   note: "Significant rework needed" },
      ],
    },
    {
      heading: "Impact (Action Plan)",
      items: [
        { color: colors.critical, label: "Critical", note: "Direct risk to security / stability" },
        { color: colors.warning,  label: "High",     note: "Notable performance or quality impact" },
        { color: colors.info,     label: "Medium",   note: "Improves maintainability" },
        { color: colors.muted,    label: "Low",      note: "Minor or cosmetic improvement" },
      ],
    },
  ];

  return (
    <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: 24 }}>
      <h3 style={{ margin: "0 0 18px", color: colors.text, fontSize: 15, fontWeight: 700 }}>🎨 Colour Legend</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 24 }}>
        {groups.map(group => (
          <div key={group.heading}>
            <div style={{ fontSize: 11, fontWeight: 700, color: colors.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
              {group.heading}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {group.items.map(item => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: item.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: item.color, fontFamily: "monospace", minWidth: 58 }}>
                    {item.label}
                  </span>
                  <span style={{ fontSize: 12, color: colors.muted }}>{item.note}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComponentList({ components }) {
  const { colors } = useTheme();
  const [showAll, setShowAll] = useState(false);
  const LIMIT = 10;
  const visible = showAll ? components : components.slice(0, LIMIT);

  return (
    <div style={{ marginLeft: 26 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: colors.muted, letterSpacing: 1, marginBottom: 8 }}>
        AFFECTED COMPONENTS ({components.length})
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {visible.map((c, i) => (
          <span key={i} style={{
            fontSize: 11, fontFamily: "monospace", padding: "2px 8px",
            background: colors.highlight, color: colors.accent,
            border: `1px solid ${colors.panelBorder}`, borderRadius: 4,
          }}>
            {c}
          </span>
        ))}
        {!showAll && components.length > LIMIT && (
          <button
            onClick={() => setShowAll(true)}
            style={{ fontSize: 11, color: colors.muted, background: "transparent", border: `1px solid ${colors.panelBorder}`, borderRadius: 4, padding: "2px 8px", cursor: "pointer" }}
          >
            +{components.length - LIMIT} more
          </button>
        )}
        {showAll && components.length > LIMIT && (
          <button
            onClick={() => setShowAll(false)}
            style={{ fontSize: 11, color: colors.muted, background: "transparent", border: `1px solid ${colors.panelBorder}`, borderRadius: 4, padding: "2px 8px", cursor: "pointer" }}
          >
            Show less
          </button>
        )}
      </div>
    </div>
  );
}

function TechDebtTab({ orgCheck }) {
  const { colors } = useTheme();
  const [expandedFinding, setExpandedFinding] = useState(null);

  if (!orgCheck) {
    return (
      <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔩</div>
        <p style={{ color: colors.muted, fontSize: 14, margin: 0 }}>
          OrgCheck data is unavailable for this scan. This can happen if the <code>@orgcheck/sfdx-plugin</code> is not installed or the scan was run before OrgCheck integration was added.
        </p>
        <p style={{ color: colors.muted, fontSize: 12, marginTop: 8 }}>
          Install the plugin: <code style={{ color: colors.accent }}>sf plugins install @orgcheck/sfdx-plugin</code>, then re-scan.
        </p>
      </div>
    );
  }

  const { findings, score, summary } = orgCheck;
  const criticalCount = findings.filter(f => f.severity === "critical").length;
  const warningCount  = findings.filter(f => f.severity === "warning").length;
  const infoCount     = findings.filter(f => f.severity === "info").length;
  const scoreColor = score == null ? colors.muted : score >= 75 ? colors.success : score >= 50 ? colors.warning : colors.critical;

  const SECTION_ICONS = {
    "OrgCheck Global View": "🌐",
    "OrgCheck Apex Classes": "⚡",
    "OrgCheck Apex:": "⚡",
    "OrgCheck Hardcoded URLs": "🔗",
    "OrgCheck Tests": "🧪",
  };

  function findingIcon(title) {
    for (const [prefix, icon] of Object.entries(SECTION_ICONS)) {
      if (title.startsWith(prefix)) return icon;
    }
    return "🔩";
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Info banner */}
      <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: "14px 20px", display: "flex", gap: 14, alignItems: "flex-start" }}>
        <span style={{ fontSize: 18 }}>🔩</span>
        <div>
          <div style={{ fontWeight: 700, color: colors.text, fontSize: 13, marginBottom: 4 }}>Tech Debt Analysis — Powered by OrgCheck</div>
          <div style={{ fontSize: 12, color: colors.muted, lineHeight: 1.6 }}>
            Results from <strong>global-view</strong> (org-wide tech debt), <strong>apex-classes</strong> (per-class issues),{" "}
            <strong>hardcoded-urls</strong> (environment-coupled references), and <strong>run-all-tests</strong> (Apex test suite).
            The Tech Debt score is informational and does not affect the overall org health score.
          </div>
        </div>
      </div>

      {/* Score + counts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
        <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 44, fontWeight: 800, color: scoreColor, fontFamily: "monospace", lineHeight: 1 }}>
            {score == null ? "—" : score}
          </div>
          <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 0.8, fontWeight: 600 }}>TECH DEBT SCORE</div>
        </div>
        {[
          { label: "CRITICAL", count: criticalCount, color: colors.critical, icon: "🚨" },
          { label: "WARNING",  count: warningCount,  color: colors.warning,  icon: "⚠️" },
          { label: "INFO",     count: infoCount,     color: colors.info,     icon: "ℹ️" },
        ].map(s => (
          <div key={s.label} style={{ background: colors.panel, border: `1px solid ${s.color}33`, borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: s.color, fontFamily: "monospace" }}>{s.count}</div>
            <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 1, fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Global view summary stats */}
      {summary?.globalView && (
        <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: "16px 20px", display: "flex", gap: 32, flexWrap: "wrap" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: colors.text, fontFamily: "monospace" }}>{summary.globalView.scannedTypes}</div>
            <div style={{ fontSize: 10, color: colors.muted, letterSpacing: 0.8, fontWeight: 600 }}>TYPES SCANNED</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: colors.text, fontFamily: "monospace" }}>{summary.globalView.totalItems}</div>
            <div style={{ fontSize: 10, color: colors.muted, letterSpacing: 0.8, fontWeight: 600 }}>TOTAL ITEMS</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: summary.globalView.totalBad > 0 ? colors.warning : colors.success, fontFamily: "monospace" }}>{summary.globalView.totalBad}</div>
            <div style={{ fontSize: 10, color: colors.muted, letterSpacing: 0.8, fontWeight: 600 }}>ITEMS WITH DEBT</div>
          </div>
          {summary.runAllTests && (
            <>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: colors.success, fontFamily: "monospace" }}>{summary.runAllTests.passing}</div>
                <div style={{ fontSize: 10, color: colors.muted, letterSpacing: 0.8, fontWeight: 600 }}>TESTS PASSING</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: summary.runAllTests.failing > 0 ? colors.critical : colors.muted, fontFamily: "monospace" }}>{summary.runAllTests.failing}</div>
                <div style={{ fontSize: 10, color: colors.muted, letterSpacing: 0.8, fontWeight: 600 }}>TESTS FAILING</div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Command error notices */}
      {summary?.errors?.length > 0 && (
        <div style={{ background: colors.panel, border: `1px solid ${colors.warning}44`, borderRadius: 10, padding: "12px 16px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: colors.warning, marginBottom: 6 }}>⚠ Some OrgCheck commands returned errors:</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {summary.errors.map((e, i) => (
              <div key={i} style={{ fontSize: 12, color: colors.muted, fontFamily: "monospace" }}>{e}</div>
            ))}
          </div>
        </div>
      )}

      {/* Findings list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {findings.length === 0 && (
          <div style={{ background: colors.panel, border: `1px solid ${colors.success}33`, borderRadius: 10, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 32 }}>🎉</div>
            <p style={{ color: colors.success, fontWeight: 700, margin: "8px 0 0" }}>OrgCheck found no tech debt issues!</p>
          </div>
        )}
        {findings.map((f, i) => {
          const isOpen = expandedFinding === i;
          const sevColor = { critical: colors.critical, warning: colors.warning, info: colors.info }[f.severity] || colors.muted;
          return (
            <div key={i} style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 10, overflow: "hidden" }}>
              <div
                role="button" aria-expanded={isOpen}
                onClick={() => setExpandedFinding(isOpen ? null : i)}
                style={{ padding: "16px 20px", display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", background: isOpen ? colors.highlight : "transparent" }}
              >
                <div style={{ width: 4, minHeight: 36, background: sevColor, borderRadius: 2, flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                    <SeverityBadge severity={f.severity} />
                    <span style={{ fontSize: 14 }}>{findingIcon(f.title)}</span>
                    <span style={{ fontWeight: 600, color: colors.text, fontSize: 14 }}>{f.title}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: colors.muted, lineHeight: 1.5 }}>{f.description}</p>
                </div>
                <span style={{ color: colors.muted, fontSize: 14, flexShrink: 0 }}>{isOpen ? "▲" : "▼"}</span>
              </div>
              {isOpen && (
                <div style={{ padding: "12px 20px 16px 36px", background: colors.bg, borderTop: `1px solid ${colors.panelBorder}` }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: f.components?.length ? 14 : 0 }}>
                    <span style={{ fontSize: 16 }}>🔧</span>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: colors.accent, letterSpacing: 1, marginBottom: 4 }}>RECOMMENDED ACTION</div>
                      <p style={{ margin: 0, fontSize: 13, color: colors.text, lineHeight: 1.6 }}>{f.action}</p>
                    </div>
                  </div>
                  {f.components?.length > 0 && (
                    <ComponentList components={f.components} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HistoryTab({ orgId, currentRunId, onOpenRun }) {
  const { colors } = useTheme();
  const [runs, setRuns] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const safeId = (orgId || "").replace(/[^a-zA-Z0-9_-]/g, "_");
    api.getOrgHistory(safeId)
      .then(r => setRuns(r.runs || []))
      .catch(() => setRuns([]))
      .finally(() => setLoading(false));
  }, [orgId]);

  if (loading) return <p style={{ color: colors.muted }}>Loading history…</p>;

  if (!runs || runs.length === 0) {
    return (
      <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: 32, textAlign: "center" }}>
        <p style={{ color: colors.muted }}>No history yet for this org. Future scans will appear here.</p>
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ margin: "0 0 16px", color: colors.text, fontSize: 15, fontWeight: 700 }}>Scan History</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {runs.map((run, i) => {
          const color = run.score >= 75 ? colors.success : run.score >= 50 ? colors.warning : colors.critical;
          const isCurrent = run.runId === currentRunId;
          return (
            <div key={i} style={{ background: colors.panel, border: `1px solid ${isCurrent ? colors.accent : colors.panelBorder}`, borderRadius: 10, padding: "16px 20px", display: "flex", alignItems: "center", gap: 20 }}>
              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <div style={{ fontSize: 28, fontWeight: 800, color, fontFamily: "monospace" }}>{run.score}</div>
                <div style={{ fontSize: 10, color: colors.muted }}>SCORE</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: colors.text, fontWeight: 600, marginBottom: 4 }}>
                  {new Date(run.timestamp).toLocaleString()}
                  {isCurrent && <span style={{ marginLeft: 8, fontSize: 10, color: colors.accent, background: colors.accent + "22", padding: "1px 6px", borderRadius: 3 }}>CURRENT</span>}
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: 12, color: colors.muted }}>
                  <span>🚨 {run.findingCounts?.critical ?? 0} critical</span>
                  <span>⚠️ {run.findingCounts?.warning ?? 0} warnings</span>
                  <span style={{ color: run.metadataRetained ? colors.success : colors.muted }}>
                    {run.metadataRetained ? "📁 Metadata retained" : "🗑 Metadata deleted"}
                  </span>
                </div>
              </div>
              {!isCurrent && onOpenRun && (
                <button
                  onClick={() => onOpenRun(run)}
                  style={{ padding: "7px 16px", background: colors.accent, border: "none", color: colors.name === "light" ? "#fff" : "#000", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700, flexShrink: 0 }}
                >
                  Open
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
