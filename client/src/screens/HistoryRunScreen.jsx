import { useState } from "react";
import { useTheme } from "../ThemeContext";
import SeverityBadge from "../components/SeverityBadge";
import ProgressBar from "../components/ProgressBar";
import ScoreRing from "../components/ScoreRing";
import { exportHistoryPdf } from "../pdfExport";
import AiInsightsTab from "./AiInsightsTab";

const CATEGORY_META = {
  security:   { label: "Security & Access",         icon: "🔐", weight: "30%" },
  automation: { label: "Automation & Flows",        icon: "🔄", weight: "25%" },
  apex:       { label: "Apex & Governor Limits",    icon: "⚡", weight: "20%" },
  datamodel:  { label: "Data Model & Architecture", icon: "🏗️", weight: "15%" },
  deployment: { label: "Metadata & Deployment",     icon: "📦", weight: "10%" },
};

const CLOUD_META = {
  salescloud:   { label: "Sales Cloud",              icon: "💼" },
  servicecloud: { label: "Service Cloud",            icon: "🛟" },
  cpq:          { label: "CPQ / Revenue Cloud",      icon: "💰" },
};

// Group action items back into pseudo-categories for the Findings view.
// Items with source="core" are split by keyword matching against category names.
// Items with source="cloud:*" get their own cloud group.
function groupActionItems(actionItems) {
  const SOURCE_KEYWORDS = {
    security:   ["administrator", "permission", "profile", "login", "oauth", "user", "connected app", "country", "api-only", "stale", "logged"],
    automation: ["flow", "process builder", "workflow", "automation", "fault"],
    apex:       ["apex", "soql", "coverage", "trigger", "api version"],
    datamodel:  ["object", "field", "lookup", "deprecated", "obsolete"],
    deployment: ["metadata", "lwc", "sfdx", "api version", "deployment"],
  };

  const groups = {};

  for (const item of actionItems) {
    const src = item.source || "core";

    if (src.startsWith("cloud:")) {
      const cloudId = src.replace("cloud:", "");
      if (!groups[src]) {
        const meta = CLOUD_META[cloudId] || { label: cloudId, icon: "☁️" };
        groups[src] = { id: src, label: meta.label, icon: meta.icon, isCloud: true, items: [] };
      }
      groups[src].items.push(item);
      continue;
    }

    // core — match to category by keyword
    let matched = null;
    const titleLower = item.title.toLowerCase();
    for (const [catId, keywords] of Object.entries(SOURCE_KEYWORDS)) {
      if (keywords.some(k => titleLower.includes(k))) { matched = catId; break; }
    }
    const catId = matched || "security";
    if (!groups[catId]) {
      const meta = CATEGORY_META[catId];
      groups[catId] = { id: catId, label: meta.label, icon: meta.icon, isCloud: false, items: [] };
    }
    groups[catId].items.push(item);
  }

  // Sort: core categories first in canonical order, then cloud groups
  const coreOrder = ["security", "automation", "apex", "datamodel", "deployment"];
  return [
    ...coreOrder.filter(id => groups[id]).map(id => groups[id]),
    ...Object.values(groups).filter(g => g.isCloud),
  ];
}

export default function HistoryRunScreen({ run, onBack }) {
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState("findings");
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [expandedAction, setExpandedAction] = useState(null);

  const tabs = [
    { id: "overview", label: "Overview",    icon: "📊" },
    { id: "findings", label: "Findings",    icon: "🔎" },
    { id: "ai",       label: "AI Insights", icon: "🧠" },
    { id: "actions",  label: "Action Plan", icon: "✅" },
  ];

  const effortColor = { Low: colors.success, Medium: colors.warning, High: colors.critical };
  const impactColor = { Critical: colors.critical, High: colors.warning, Medium: colors.info, Low: colors.muted };

  const groups = groupActionItems(run.actionItems || []);
  const criticalCount = run.findingCounts?.critical ?? 0;
  const warningCount  = run.findingCounts?.warning  ?? 0;
  const infoCount     = run.findingCounts?.info     ?? 0;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ background: colors.panel, borderBottom: `1px solid ${colors.panelBorder}`, padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            onClick={onBack}
            style={{ background: "transparent", border: `1px solid ${colors.panelBorder}`, color: colors.muted, padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}
          >
            ← Back
          </button>
          <span style={{ fontSize: 22 }}>📅</span>
          <div>
            <div style={{ fontWeight: 700, color: colors.text, fontSize: 16 }}>
              {run.org?.name || run.org?.alias}
              <span style={{ marginLeft: 10, fontSize: 11, color: colors.muted, fontWeight: 400 }}>
                {new Date(run.timestamp).toLocaleString()}
              </span>
            </div>
            <div style={{ fontSize: 11, color: colors.muted, fontFamily: "monospace" }}>
              {run.org?.id} · {run.org?.edition} · API {run.org?.apiVersion}
              {!run.org?.isSandbox && <span style={{ marginLeft: 8, color: colors.critical, background: colors.critical + "22", padding: "1px 6px", borderRadius: 3 }}>PRODUCTION</span>}
              {run.org?.isSandbox  && <span style={{ marginLeft: 8, color: colors.warning,  background: colors.warning  + "22", padding: "1px 6px", borderRadius: 3 }}>SANDBOX</span>}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {run.metadataRetained === true  && <span style={{ fontSize: 11, color: colors.success }}>📁 Metadata retained</span>}
          {run.metadataRetained === false && <span style={{ fontSize: 11, color: colors.muted }}>🗑 Metadata deleted</span>}
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

        {/* ── OVERVIEW ── */}
        {activeTab === "overview" && (
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>

            {/* Left — org meta */}
            <div style={{ width: 260, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Storage */}
              {run.storage && (
                <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: 20 }}>
                  <h3 style={{ margin: "0 0 14px", color: colors.text, fontSize: 13, fontWeight: 700 }}>🗄️ Storage</h3>
                  {[
                    { label: "Data",       key: "dataStorage" },
                    { label: "File",       key: "fileStorage" },
                    { label: "Big Object", key: "bigObjectStorage" },
                  ].map(({ label, key }) => {
                    const s = run.storage[key];
                    if (!s) return null;
                    const pct = s.max > 0 ? Math.round((s.used / s.max) * 100) : 0;
                    const barColor = pct >= 90 ? colors.critical : pct >= 70 ? colors.warning : colors.accent;
                    return (
                      <div key={key} style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                          <span style={{ color: colors.muted }}>{label}</span>
                          <span style={{ color: barColor, fontWeight: 700, fontFamily: "monospace" }}>{pct}%</span>
                        </div>
                        <ProgressBar value={pct} max={100} color={barColor} />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Coverage */}
              {run.coverage && (
                <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: 20 }}>
                  <h3 style={{ margin: "0 0 10px", color: colors.text, fontSize: 13, fontWeight: 700 }}>🧪 Coverage</h3>
                  <div style={{ fontSize: 32, fontWeight: 800, color: run.coverage.orgWidePercent >= 75 ? colors.success : colors.critical, fontFamily: "monospace" }}>
                    {run.coverage.orgWidePercent ?? "—"}%
                  </div>
                  <div style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>
                    {run.coverage.classCount} classes · {run.coverage.lowCoverageCount} below 80%
                  </div>
                </div>
              )}

              {/* OrgCheck summary */}
              {run.orgCheck && (
                <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: 20 }}>
                  <h3 style={{ margin: "0 0 10px", color: colors.text, fontSize: 13, fontWeight: 700 }}>🔩 Tech Debt</h3>
                  <div style={{ fontSize: 28, fontWeight: 800, color: run.orgCheck.score >= 75 ? colors.success : run.orgCheck.score >= 50 ? colors.warning : colors.critical, fontFamily: "monospace" }}>
                    {run.orgCheck.score ?? "—"}
                  </div>
                  <div style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>
                    {run.orgCheck.findingCounts?.critical ?? 0} critical · {run.orgCheck.findingCounts?.warning ?? 0} warning
                  </div>
                </div>
              )}
            </div>

            {/* Right — scores */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Score cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16 }}>
                <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <ScoreRing score={run.score} size={90} />
                  <div style={{ fontSize: 12, color: colors.muted, fontWeight: 600 }}>OVERALL HEALTH</div>
                </div>
                {[
                  { label: "CRITICAL", count: criticalCount, color: colors.critical, icon: "🚨" },
                  { label: "WARNING",  count: warningCount,  color: colors.warning,  icon: "⚠️" },
                  { label: "INFO",     count: infoCount,     color: colors.info,     icon: "ℹ️" },
                ].map(s => (
                  <div key={s.label} style={{ background: colors.panel, border: `1px solid ${s.color}33`, borderRadius: 12, padding: 24 }}>
                    <div style={{ fontSize: 22, marginBottom: 8 }}>{s.icon}</div>
                    <div style={{ fontSize: 32, fontWeight: 800, color: s.color, fontFamily: "monospace" }}>{s.count}</div>
                    <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 1, fontWeight: 600 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Category scores */}
              {run.categoryScores && (
                <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: 24 }}>
                  <h3 style={{ margin: "0 0 20px", color: colors.text, fontSize: 15, fontWeight: 700 }}>Category Breakdown</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {Object.entries(run.categoryScores).map(([id, score]) => {
                      const meta = CATEGORY_META[id];
                      if (!meta) return null;
                      const color = score >= 75 ? colors.success : score >= 50 ? colors.warning : colors.critical;
                      return (
                        <div key={id} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                          <div style={{ fontSize: 20, width: 30, textAlign: "center" }}>{meta.icon}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                              <span style={{ fontSize: 13, color: colors.text }}>{meta.label}</span>
                              <span style={{ fontSize: 13, color, fontWeight: 700, fontFamily: "monospace" }}>{score}/100</span>
                            </div>
                            <ProgressBar value={score} max={100} color={color} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Cloud scores */}
              {run.cloudScores && Object.values(run.cloudScores).some(v => v != null) && (
                <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: 24 }}>
                  <h3 style={{ margin: "0 0 14px", color: colors.text, fontSize: 15, fontWeight: 700 }}>☁️ Cloud Skills</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {Object.entries(run.cloudScores).map(([id, score]) => {
                      const meta = CLOUD_META[id] || { label: id, icon: "☁️" };
                      if (score == null) return (
                        <div key={id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                          <span style={{ color: colors.text }}>{meta.icon} {meta.label}</span>
                          <span style={{ color: colors.muted }}>Detection only</span>
                        </div>
                      );
                      const color = score >= 75 ? colors.success : score >= 50 ? colors.warning : colors.critical;
                      return (
                        <div key={id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontSize: 16, width: 24 }}>{meta.icon}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                              <span style={{ fontSize: 12, color: colors.text }}>{meta.label}</span>
                              <span style={{ fontSize: 12, color, fontWeight: 700, fontFamily: "monospace" }}>{score}/100</span>
                            </div>
                            <ProgressBar value={score} max={100} color={color} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── FINDINGS ── */}
        {activeTab === "findings" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 10, padding: "12px 18px", fontSize: 12, color: colors.muted }}>
              ℹ️ Findings are reconstructed from the persisted action items. Info-only findings and passing checks are not stored in history.
            </div>
            {groups.length === 0 && (
              <div style={{ background: colors.panel, border: `1px solid ${colors.success}33`, borderRadius: 10, padding: 24, textAlign: "center" }}>
                <div style={{ fontSize: 32 }}>🎉</div>
                <p style={{ color: colors.success, fontWeight: 700, margin: "8px 0 0" }}>No critical or warning findings in this scan.</p>
              </div>
            )}
            {groups.map(group => {
              const isOpen = expandedGroup === group.id;
              return (
                <div key={group.id} style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, overflow: "hidden" }}>
                  <div
                    role="button"
                    onClick={() => setExpandedGroup(isOpen ? null : group.id)}
                    style={{ padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", background: isOpen ? colors.highlight : "transparent" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 20 }}>{group.icon}</span>
                      <span style={{ fontWeight: 700, color: colors.text }}>{group.label}</span>
                      <span style={{ fontSize: 11, color: colors.muted, background: colors.highlight, padding: "2px 8px", borderRadius: 8 }}>
                        {group.items.length} item{group.items.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <span style={{ color: colors.muted }}>{isOpen ? "▲" : "▼"}</span>
                  </div>
                  {isOpen && (
                    <div style={{ borderTop: `1px solid ${colors.panelBorder}` }}>
                      {group.items.map((item, i) => {
                        const sevColor = { Critical: colors.critical, High: colors.warning, Medium: colors.info, Low: colors.muted }[item.impact] || colors.muted;
                        const sev = item.impact === "Critical" ? "critical" : "warning";
                        return (
                          <div key={i} style={{ padding: "14px 20px", borderBottom: i < group.items.length - 1 ? `1px solid ${colors.panelBorder}` : "none", display: "flex", gap: 12, alignItems: "flex-start" }}>
                            <div style={{ width: 4, minHeight: 36, background: sevColor, borderRadius: 2, flexShrink: 0, marginTop: 2 }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                                <SeverityBadge severity={sev} />
                                <span style={{ fontWeight: 600, color: colors.text, fontSize: 13 }}>{item.title}</span>
                              </div>
                              <p style={{ margin: "0 0 8px", fontSize: 12, color: colors.muted, lineHeight: 1.5 }}>{item.action}</p>
                              {item.components?.length > 0 && (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
                                  {item.components.slice(0, 15).map((c, j) => (
                                    <span key={j} style={{ fontSize: 11, fontFamily: "monospace", padding: "2px 7px", background: colors.highlight, color: colors.accent, border: `1px solid ${colors.panelBorder}`, borderRadius: 4 }}>{c}</span>
                                  ))}
                                  {item.components.length > 15 && (
                                    <span style={{ fontSize: 11, color: colors.muted }}>+{item.components.length - 15} more</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── AI INSIGHTS ── */}
        {activeTab === "ai" && (
          <AiInsightsTab
            runId={run.runId}
            orgAlias={run.org?.alias}
            orgContext={{
              orgName: run.org?.name || run.org?.alias,
              orgId: run.org?.id,
              edition: run.org?.edition,
              isSandbox: run.org?.isSandbox,
              actionItems: run.actionItems || [],
            }}
            isHistory={true}
            metadataRetained={run.metadataRetained}
          />
        )}

        {/* ── ACTION PLAN ── */}
        {activeTab === "actions" && (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
              <button
                onClick={() => exportHistoryPdf(run)}
                style={{ padding: "9px 18px", background: colors.accent, border: "none", color: colors.name === "light" ? "#fff" : "#000", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                ⬇ Download Report (PDF)
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
              {[
                { label: "Immediate",      count: (run.actionItems || []).filter(a => a.deadline === "Immediate").length,                color: colors.critical },
                { label: "Within 30 Days", count: (run.actionItems || []).filter(a => a.deadline === "30 days").length,                  color: colors.warning },
                { label: "60–90 Days",     count: (run.actionItems || []).filter(a => ["60 days", "90 days"].includes(a.deadline)).length, color: colors.info },
              ].map(s => (
                <div key={s.label} style={{ background: colors.panel, border: `1px solid ${s.color}33`, borderRadius: 10, padding: "16px 20px" }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: s.color, fontFamily: "monospace" }}>{s.count}</div>
                  <div style={{ fontSize: 12, color: colors.muted }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(run.actionItems || []).map((item, i) => {
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
                          <div style={{ marginLeft: 26 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: colors.muted, letterSpacing: 1, marginBottom: 8 }}>
                              AFFECTED COMPONENTS ({item.components.length})
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {item.components.map((c, j) => (
                                <span key={j} style={{ fontSize: 11, fontFamily: "monospace", padding: "2px 8px", background: colors.highlight, color: colors.accent, border: `1px solid ${colors.panelBorder}`, borderRadius: 4 }}>{c}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {(run.actionItems || []).length === 0 && (
                <div style={{ background: colors.panel, border: `1px solid ${colors.success}33`, borderRadius: 10, padding: 24, textAlign: "center" }}>
                  <div style={{ fontSize: 32 }}>🎉</div>
                  <p style={{ color: colors.success, fontWeight: 700, margin: "8px 0 0" }}>No action items recorded for this scan.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
