import { useState, useEffect, useRef } from "react";
import { api } from "../api";
import { useTheme } from "../ThemeContext";

export default function ConnectScreen({ onScanStart, onOpenHistoryRun }) {
  const { colors, themeName, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState("orgs");

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 32 }}>
      <div style={{ width: "100%", maxWidth: 620 }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32, position: "relative" }}>
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={themeName === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            style={{
              position: "absolute", top: 0, right: 0,
              display: "flex", alignItems: "center", gap: 7,
              background: colors.highlight,
              border: `1px solid ${colors.panelBorder}`,
              borderRadius: 20,
              padding: "5px 12px",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              color: colors.muted,
            }}
          >
            <span style={{ fontSize: 15 }}>{themeName === "dark" ? "☀️" : "🌙"}</span>
            {themeName === "dark" ? "Light" : "Dark"}
          </button>

          <div style={{ fontSize: 48, marginBottom: 12 }}>☁️</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: colors.text, margin: 0, letterSpacing: -0.5 }}>
            Salesforce Org Health Analyzer
          </h1>
          <p style={{ color: colors.muted, marginTop: 8, fontSize: 14 }}>
            Uses Salesforce CLI to authenticate — no credentials are stored or transmitted by this tool.
          </p>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", borderBottom: `1px solid ${colors.panelBorder}`, marginBottom: 24, gap: 4 }}>
          {[
            { id: "orgs",    label: "Orgs",    icon: "🔌" },
            { id: "history", label: "History", icon: "📅" },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: "10px 20px",
                background: "transparent",
                borderBottom: activeTab === t.id ? `2px solid ${colors.accent}` : "2px solid transparent",
                borderTop: "none", borderLeft: "none", borderRight: "none",
                color: activeTab === t.id ? colors.accent : colors.muted,
                cursor: "pointer", fontSize: 13, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {activeTab === "orgs"    && <OrgsTab onScanStart={onScanStart} />}
        {activeTab === "history" && <HistoryTab onOpenRun={onOpenHistoryRun} />}

        <div style={{ marginTop: 20, display: "flex", gap: 16, justifyContent: "center" }}>
          {["No credentials stored", "Read-only metadata", "SFDX-managed auth"].map(t => (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: colors.muted }}>
              <span style={{ color: colors.success }}>✓</span> {t}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Orgs tab ────────────────────────────────────────────────────────────────

function OrgsTab({ onScanStart }) {
  const { colors } = useTheme();
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loginAlias, setLoginAlias] = useState("");
  const [loginIsSandbox, setLoginIsSandbox] = useState(false);
  const [loginState, setLoginState] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  useEffect(() => { loadOrgs(); }, []);
  useEffect(() => () => clearInterval(pollRef.current), []);

  async function loadOrgs() {
    setLoading(true);
    try {
      const { orgs } = await api.listOrgs();
      setOrgs(orgs);
    } catch (e) {
      setError("Could not load orgs: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    const alias = loginAlias.trim();
    if (!alias) { setError("Please enter an alias for the new org."); return; }
    setError("");

    let loginId;
    try {
      const res = await api.loginWeb(alias, loginIsSandbox);
      loginId = res.loginId;
    } catch (e) {
      setError("Could not start login: " + e.message);
      return;
    }

    setLoginAlias("");
    setLoginIsSandbox(false);
    setLoginState({ loginId, alias, status: "pending" });

    pollRef.current = setInterval(async () => {
      try {
        const { status, error: loginErr } = await api.loginStatus(loginId);
        if (status === "success") {
          clearInterval(pollRef.current);
          setLoginState(prev => ({ ...prev, status: "success" }));
          await loadOrgs();
          setTimeout(() => setLoginState(null), 3000);
        } else if (status === "error") {
          clearInterval(pollRef.current);
          setLoginState(null);
          setError(`Login failed: ${loginErr}`);
        }
      } catch { /* server hiccup — keep polling */ }
    }, 2000);
  }

  function cancelLogin() {
    clearInterval(pollRef.current);
    const id = loginState?.loginId;
    setLoginState(null);
    if (id) api.cancelLogin(id).catch(() => {});
  }

  async function handleScan(alias) {
    setError("");
    setScanning(alias);
    try {
      const { runId } = await api.startScan(alias);
      onScanStart(runId, alias);
    } catch (e) {
      setError("Could not start scan: " + e.message);
      setScanning(false);
    }
  }

  return (
    <>
      {/* Login-in-progress banner */}
      {loginState && (
        <div style={{
          background: loginState.status === "success" ? colors.success + "22" : colors.accent + "18",
          border: `1px solid ${loginState.status === "success" ? colors.success : colors.accent}44`,
          borderRadius: 10, padding: "14px 18px", marginBottom: 16,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>{loginState.status === "success" ? "✅" : "🌐"}</span>
            <div>
              <div style={{ fontWeight: 600, color: colors.text, fontSize: 13 }}>
                {loginState.status === "success"
                  ? `"${loginState.alias}" connected!`
                  : `Waiting for login — "${loginState.alias}"`}
              </div>
              <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                {loginState.status === "success"
                  ? "Org list updated."
                  : "Your browser should be open to the Salesforce login page. Complete login there."}
              </div>
            </div>
          </div>
          {loginState.status === "pending" && (
            <button
              onClick={cancelLogin}
              style={{ background: "transparent", border: `1px solid ${colors.panelBorder}`, color: colors.muted, padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}
            >
              Cancel
            </button>
          )}
        </div>
      )}

      {/* Authenticated orgs list */}
      <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 16, padding: 28, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: colors.text, fontSize: 14, fontWeight: 700 }}>
            Authenticated Orgs {loading ? "…" : `(${orgs.length})`}
          </h3>
          <button
            onClick={loadOrgs}
            disabled={loading}
            style={{ background: "transparent", border: `1px solid ${colors.panelBorder}`, color: colors.muted, padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11 }}
          >
            ↻ Refresh
          </button>
        </div>

        {loading && <p style={{ color: colors.muted, fontSize: 13 }}>Loading orgs from Salesforce CLI…</p>}
        {!loading && orgs.length === 0 && (
          <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>No authenticated orgs found. Add one below.</p>
        )}

        {orgs.map(org => (
          <div key={org.username} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 14px", background: colors.highlight, borderRadius: 8, marginBottom: 8,
          }}>
            <div>
              <div style={{ fontWeight: 600, color: colors.text, fontSize: 14 }}>
                {org.alias || org.username}
                {org.isSandbox && (
                  <span style={{ marginLeft: 8, fontSize: 10, color: colors.warning, background: colors.warning + "22", padding: "1px 6px", borderRadius: 3 }}>SANDBOX</span>
                )}
                {!org.isSandbox && org.connectedStatus === "Connected" && (
                  <span style={{ marginLeft: 8, fontSize: 10, color: colors.critical, background: colors.critical + "22", padding: "1px 6px", borderRadius: 3 }}>PRODUCTION</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: colors.muted, fontFamily: "monospace", marginTop: 2 }}>{org.username}</div>
            </div>
            <button
              onClick={() => handleScan(org.alias || org.username)}
              disabled={!!scanning || !!loginState}
              style={{
                padding: "8px 18px",
                background: scanning === (org.alias || org.username) ? colors.muted : colors.accent,
                color: colors.name === "light" ? "#fff" : "#000",
                border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700,
                cursor: (scanning || loginState) ? "not-allowed" : "pointer",
              }}
            >
              {scanning === (org.alias || org.username) ? "Starting…" : "Analyse"}
            </button>
          </div>
        ))}
      </div>

      {/* Add new org */}
      <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 16, padding: 28 }}>
        <h3 style={{ margin: "0 0 10px", color: colors.text, fontSize: 14, fontWeight: 700 }}>Add Salesforce Org</h3>
        <p style={{ color: colors.muted, fontSize: 12, marginBottom: 16, marginTop: 0, lineHeight: 1.6 }}>
          Opens your browser to the Salesforce login page. The CLI stores the token in your system keychain — this tool never sees your credentials.
        </p>
        <div style={{ display: "flex", gap: 6, marginBottom: 12, padding: 4, background: colors.bg, border: `1px solid ${colors.panelBorder}`, borderRadius: 8 }}>
          {[
            { label: "Production", value: false, hint: "login.salesforce.com" },
            { label: "Sandbox",    value: true,  hint: "test.salesforce.com"  },
          ].map(opt => {
            const selected = loginIsSandbox === opt.value;
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => setLoginIsSandbox(opt.value)}
                disabled={!!loginState}
                style={{
                  flex: 1, padding: "8px 10px",
                  background: selected ? colors.accentSoft : "transparent",
                  color: selected ? "#fff" : colors.muted,
                  border: "none", borderRadius: 6,
                  cursor: loginState ? "not-allowed" : "pointer",
                  fontSize: 12, fontWeight: 600,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                }}
              >
                <span>{opt.label}</span>
                <span style={{ fontSize: 10, fontFamily: "monospace", opacity: 0.8 }}>{opt.hint}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            value={loginAlias}
            onChange={e => setLoginAlias(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !loginState && handleLogin()}
            placeholder="Org alias (e.g. my-prod)"
            disabled={!!loginState}
            style={{
              flex: 1, padding: "10px 12px", background: colors.bg,
              border: `1px solid ${colors.panelBorder}`, borderRadius: 8,
              color: colors.text, fontSize: 13, outline: "none", fontFamily: "monospace",
              opacity: loginState ? 0.5 : 1,
            }}
          />
          <button
            onClick={handleLogin}
            disabled={!!loginState}
            style={{
              padding: "10px 20px",
              background: loginState ? colors.muted : colors.accentSoft,
              color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700,
              cursor: loginState ? "not-allowed" : "pointer", whiteSpace: "nowrap",
            }}
          >
            {loginState?.status === "pending" ? "Waiting…" : "Login with Salesforce"}
          </button>
        </div>
      </div>

      {error && (
        <p style={{ color: colors.critical, fontSize: 13, marginTop: 16, textAlign: "center" }}>⚠ {error}</p>
      )}
    </>
  );
}

// ── History tab ─────────────────────────────────────────────────────────────

function HistoryTab({ onOpenRun }) {
  const { colors } = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedOrg, setExpandedOrg] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await api.getHistory();
      setData(res.orgs || []);
      if ((res.orgs || []).length === 1) setExpandedOrg(res.orgs[0].orgDir);
    } catch (e) {
      setError("Could not load history: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <p style={{ color: colors.muted, fontSize: 13, textAlign: "center", padding: 32 }}>Loading history…</p>;
  }
  if (error) {
    return <p style={{ color: colors.critical, fontSize: 13, textAlign: "center", padding: 32 }}>⚠ {error}</p>;
  }
  if (!data || data.length === 0) {
    return (
      <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 16, padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
        <p style={{ color: colors.muted, fontSize: 14, margin: 0 }}>No scan history yet.</p>
        <p style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>Run your first analysis from the Orgs tab.</p>
      </div>
    );
  }

  const totalRuns = data.reduce((s, o) => s + o.runs.length, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: colors.muted }}>
          {data.length} org{data.length !== 1 ? "s" : ""} · {totalRuns} scan{totalRuns !== 1 ? "s" : ""}
        </span>
        <button
          onClick={load}
          style={{ background: "transparent", border: `1px solid ${colors.panelBorder}`, color: colors.muted, padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11 }}
        >
          ↻ Refresh
        </button>
      </div>

      {data.map(orgEntry => {
        const { orgDir, runs } = orgEntry;
        const latest = runs[0];
        const isOpen = expandedOrg === orgDir;
        const latestScore = latest?.score ?? null;
        const scoreColor = latestScore == null ? colors.muted
          : latestScore >= 75 ? colors.success
          : latestScore >= 50 ? colors.warning
          : colors.critical;
        const orgLabel = latest?.org?.alias || latest?.org?.name || orgDir;
        const isSandbox = latest?.org?.isSandbox;

        return (
          <div key={orgDir} style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, overflow: "hidden" }}>
            <div
              role="button"
              aria-expanded={isOpen}
              onClick={() => setExpandedOrg(isOpen ? null : orgDir)}
              style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, cursor: "pointer", background: isOpen ? colors.highlight : "transparent" }}
            >
              <div style={{ textAlign: "center", flexShrink: 0, width: 48 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: scoreColor, fontFamily: "monospace", lineHeight: 1 }}>
                  {latestScore ?? "—"}
                </div>
                <div style={{ fontSize: 9, color: colors.muted, letterSpacing: 0.5, marginTop: 2 }}>LATEST</div>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: colors.text, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                  {orgLabel}
                  {isSandbox === true  && <span style={{ fontSize: 10, color: colors.warning,  background: colors.warning  + "22", padding: "1px 6px", borderRadius: 3 }}>SANDBOX</span>}
                  {isSandbox === false && <span style={{ fontSize: 10, color: colors.critical, background: colors.critical + "22", padding: "1px 6px", borderRadius: 3 }}>PRODUCTION</span>}
                </div>
                <div style={{ fontSize: 11, color: colors.muted, fontFamily: "monospace", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {latest?.org?.id || orgDir}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: colors.muted, background: colors.highlight, padding: "3px 10px", borderRadius: 10, fontWeight: 600 }}>
                  {runs.length} run{runs.length !== 1 ? "s" : ""}
                </span>
                <span style={{ color: colors.muted, fontSize: 14 }}>{isOpen ? "▲" : "▼"}</span>
              </div>
            </div>

            {isOpen && (
              <div style={{ borderTop: `1px solid ${colors.panelBorder}` }}>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 64px 80px 80px 80px 96px",
                  padding: "8px 20px",
                  borderBottom: `1px solid ${colors.panelBorder}`,
                }}>
                  {["Timestamp", "Score", "Critical", "Warning", "Info", "Metadata"].map(h => (
                    <div key={h} style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.8, textTransform: "uppercase" }}>{h}</div>
                  ))}
                </div>

                {runs.map((run, i) => {
                  const sc = run.score ?? null;
                  const sc_color = sc == null ? colors.muted : sc >= 75 ? colors.success : sc >= 50 ? colors.warning : colors.critical;
                  const crit = run.findingCounts?.critical ?? 0;
                  const warn = run.findingCounts?.warning  ?? 0;
                  const info = run.findingCounts?.info     ?? 0;
                  const retained = run.metadataRetained;

                  return (
                    <div
                      key={run.runId || i}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 64px 80px 80px 80px 96px",
                        padding: "12px 20px",
                        borderBottom: i < runs.length - 1 ? `1px solid ${colors.panelBorder}` : "none",
                        alignItems: "center",
                        background: i === 0 ? colors.accent + "08" : "transparent",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, color: colors.text, fontWeight: i === 0 ? 600 : 400 }}>
                            {new Date(run.timestamp).toLocaleString()}
                          </span>
                          {i === 0 && (
                            <span style={{ fontSize: 10, color: colors.accent, background: colors.accent + "22", padding: "1px 6px", borderRadius: 3 }}>LATEST</span>
                          )}
                          <button
                            onClick={() => onOpenRun && onOpenRun(run)}
                            style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", background: colors.accent, color: colors.name === "light" ? "#fff" : "#000", border: "none", borderRadius: 4, cursor: "pointer" }}
                          >
                            Open
                          </button>
                        </div>
                        <div style={{ fontSize: 10, color: colors.muted, fontFamily: "monospace", marginTop: 2 }}>
                          {run.org?.apiVersion ? `API ${run.org.apiVersion}` : ""}
                          {run.org?.edition && run.org.edition !== "Unknown" ? ` · ${run.org.edition}` : ""}
                        </div>
                      </div>

                      <div style={{ fontSize: 18, fontWeight: 800, color: sc_color, fontFamily: "monospace" }}>
                        {sc ?? "—"}
                      </div>

                      <div style={{ fontSize: 13, fontWeight: crit > 0 ? 700 : 400, color: crit > 0 ? colors.critical : colors.muted }}>
                        {crit > 0 ? `🚨 ${crit}` : <span style={{ color: colors.muted }}>—</span>}
                      </div>

                      <div style={{ fontSize: 13, fontWeight: warn > 0 ? 700 : 400, color: warn > 0 ? colors.warning : colors.muted }}>
                        {warn > 0 ? `⚠️ ${warn}` : <span style={{ color: colors.muted }}>—</span>}
                      </div>

                      <div style={{ fontSize: 13, color: info > 0 ? colors.info : colors.muted }}>
                        {info > 0 ? `ℹ️ ${info}` : <span style={{ color: colors.muted }}>—</span>}
                      </div>

                      <div style={{ fontSize: 11, color: retained === true ? colors.success : colors.muted }}>
                        {retained === true  ? "📁 Kept"    : ""}
                        {retained === false ? "🗑 Deleted" : ""}
                        {retained === null  ? <span style={{ color: colors.muted }}>—</span> : ""}
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
  );
}
