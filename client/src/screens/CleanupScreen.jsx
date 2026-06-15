import { useState } from "react";
import { api } from "../api";
import { useTheme } from "../ThemeContext";

function formatBytes(bytes) {
  if (!bytes) return "unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CleanupScreen({ runId, metaPath, folderSizeBytes, orgName, onDone, onBack }) {
  const { colors } = useTheme();
  const [choice, setChoice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleChoice(keep) {
    setLoading(true);
    setError("");
    try {
      await api.cleanupScan(runId, keep);
      setChoice(keep ? "kept" : "deleted");
    } catch (e) {
      setError("Action failed: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  if (choice) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 32 }}>
        <div style={{ textAlign: "center", maxWidth: 480 }}>
          <div style={{ fontSize: 56, marginBottom: 20 }}>{choice === "kept" ? "📁" : "🗑️"}</div>
          <h2 style={{ color: colors.text, fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
            {choice === "kept" ? "Metadata Retained" : "Metadata Deleted"}
          </h2>
          <p style={{ color: colors.muted, fontSize: 14, marginBottom: 8, lineHeight: 1.7 }}>
            {choice === "kept"
              ? `The retrieved metadata has been kept at:\n${metaPath}`
              : "The retrieved metadata folder has been removed. Health metrics and action plan have been saved to history."}
          </p>
          <p style={{ color: colors.muted, fontSize: 13, marginBottom: 32 }}>
            This run's health report is always available in the History tab.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button
              onClick={onBack}
              style={{ padding: "12px 24px", background: "transparent", color: colors.muted, border: `1px solid ${colors.panelBorder}`, borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer" }}
            >
              ← Back to Dashboard
            </button>
            <button
              onClick={onDone}
              style={{ padding: "12px 24px", background: colors.accent, color: colors.name === "light" ? "#fff" : "#000", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: "pointer" }}
            >
              Analyse Another Org →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 32 }}>
      <div style={{ width: "100%", maxWidth: 520 }}>
        <button
          onClick={onBack}
          style={{ background: "transparent", border: "none", color: colors.muted, fontSize: 13, cursor: "pointer", padding: "0 0 24px", display: "flex", alignItems: "center", gap: 6 }}
        >
          ← Back to Dashboard
        </button>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
          <h2 style={{ color: colors.text, fontSize: 24, fontWeight: 700, margin: 0 }}>Keep Retrieved Metadata?</h2>
          <p style={{ color: colors.muted, marginTop: 8, fontSize: 14 }}>
            The health report and action plan have been saved to <strong style={{ color: colors.accent }}>history/</strong> regardless of your choice.
          </p>
        </div>

        <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: "14px 20px", marginBottom: 24 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ fontSize: 18 }}>📂</span>
            <div>
              <div style={{ fontSize: 13, color: colors.text, fontWeight: 600, marginBottom: 4 }}>{orgName}</div>
              <div style={{ fontSize: 12, color: colors.muted, fontFamily: "monospace", wordBreak: "break-all" }}>{metaPath}</div>
              <div style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>Size: {formatBytes(folderSizeBytes)}</div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <button
            onClick={() => handleChoice(true)}
            disabled={loading}
            style={{
              padding: "18px 16px", background: colors.highlight, border: `1px solid ${colors.success}55`,
              borderRadius: 12, cursor: loading ? "not-allowed" : "pointer", textAlign: "center",
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>📁</div>
            <div style={{ fontWeight: 700, color: colors.success, fontSize: 14, marginBottom: 4 }}>Keep</div>
            <div style={{ fontSize: 12, color: colors.muted, lineHeight: 1.5 }}>Retain for local development or further inspection</div>
          </button>

          <button
            onClick={() => handleChoice(false)}
            disabled={loading}
            style={{
              padding: "18px 16px", background: colors.highlight, border: `1px solid ${colors.critical}55`,
              borderRadius: 12, cursor: loading ? "not-allowed" : "pointer", textAlign: "center",
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>🗑️</div>
            <div style={{ fontWeight: 700, color: colors.critical, fontSize: 14, marginBottom: 4 }}>Delete</div>
            <div style={{ fontSize: 12, color: colors.muted, lineHeight: 1.5 }}>Remove metadata — metrics and actions are already saved</div>
          </button>
        </div>

        {error && <p style={{ color: colors.critical, fontSize: 13, marginTop: 14, textAlign: "center" }}>⚠ {error}</p>}
        {loading && <p style={{ color: colors.muted, fontSize: 13, marginTop: 14, textAlign: "center" }}>Processing…</p>}
      </div>
    </div>
  );
}
