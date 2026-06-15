import { useState, useEffect, useRef } from "react";
import { api } from "../api";
import { useTheme } from "../ThemeContext";

export default function ScanScreen({ runId, orgAlias, onDone, onError }) {
  const { colors } = useTheme();
  const [steps, setSteps] = useState([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("running");
  const esRef = useRef(null);

  useEffect(() => {
    const es = api.scanStatus(runId);
    esRef.current = es;

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "step") {
        setSteps(prev => [...prev, data.label]);
        setProgress(data.progress || 0);
      } else if (data.type === "done") {
        setStatus("done");
        setProgress(100);
        es.close();
        setTimeout(() => onDone(runId), 800);
      } else if (data.type === "error") {
        setStatus("error");
        es.close();
        onError(data.error || "Scan failed.");
      }
    };

    es.onerror = () => {
      setStatus("error");
      es.close();
      onError("Connection to scan server lost.");
    };

    return () => es.close();
  }, [runId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 32 }}>
      <div style={{ width: "100%", maxWidth: 520, textAlign: "center" }}>
        <div style={{ fontSize: 52, marginBottom: 20, animation: status === "running" ? "pulse 1.5s infinite" : "none" }}>
          {status === "error" ? "❌" : status === "done" ? "✅" : "🔍"}
        </div>
        <h2 style={{ color: colors.text, fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
          {status === "error" ? "Scan Failed" : status === "done" ? "Analysis Complete" : `Analysing ${orgAlias}…`}
        </h2>
        <p style={{ color: colors.muted, fontSize: 13, marginBottom: 28 }}>
          {status === "running" ? "Retrieving metadata and running health checks" : ""}
        </p>

        <div style={{ background: colors.panelBorder, borderRadius: 100, height: 6, overflow: "hidden", marginBottom: 28 }}>
          <div style={{ width: `${progress}%`, height: "100%", background: status === "error" ? colors.critical : colors.accent, borderRadius: 100, transition: "width 0.4s ease" }} />
        </div>

        <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: 20, textAlign: "left", maxHeight: 320, overflowY: "auto" }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "5px 0", borderBottom: i < steps.length - 1 ? `1px solid ${colors.panelBorder}` : "none" }}>
              <span style={{ fontSize: 12, color: i < steps.length - 1 ? colors.success : colors.accent, flexShrink: 0, marginTop: 1 }}>
                {i < steps.length - 1 ? "✓" : "›"}
              </span>
              <span style={{ fontSize: 12, color: i < steps.length - 1 ? colors.muted : colors.text, fontFamily: "monospace", lineHeight: 1.5 }}>{s}</span>
            </div>
          ))}
          {steps.length === 0 && (
            <p style={{ color: colors.muted, fontSize: 12, margin: 0 }}>Connecting to Salesforce CLI…</p>
          )}
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
    </div>
  );
}
