import { useState } from "react";
import { useTheme } from "./ThemeContext";
import { api } from "./api";
import ConnectScreen from "./screens/ConnectScreen";
import ScanScreen from "./screens/ScanScreen";
import DashboardScreen from "./screens/DashboardScreen";
import CleanupScreen from "./screens/CleanupScreen";
import HistoryRunScreen from "./screens/HistoryRunScreen";

export default function App() {
  const { colors } = useTheme();
  const [screen, setScreen] = useState("connect");
  const [runId, setRunId] = useState(null);
  const [orgAlias, setOrgAlias] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [historyRun, setHistoryRun] = useState(null);       // run record being viewed
  const [historyBackTo, setHistoryBackTo] = useState(null); // "connect" | "dashboard"

  async function handleScanStart(id, alias) {
    setRunId(id);
    setOrgAlias(alias);
    setScanError(null);
    setScreen("scan");
  }

  async function handleScanDone(id) {
    try {
      const result = await api.getScanResult(id);
      setScanResult(result);
      setScreen("dashboard");
    } catch (e) {
      setScanError("Could not load scan result: " + e.message);
      setScreen("connect");
    }
  }

  function handleScanError(msg) {
    setScanError(msg);
    setScreen("connect");
  }

  function handleFinish() {
    setScreen("cleanup");
  }

  function handleCleanupDone() {
    setRunId(null);
    setOrgAlias(null);
    setScanResult(null);
    setScanError(null);
    setScreen("connect");
  }

  function openHistoryRun(run, backTo = "connect") {
    setHistoryRun(run);
    setHistoryBackTo(backTo);
    setScreen("historyrun");
  }

  function closeHistoryRun() {
    setHistoryRun(null);
    setScreen(historyBackTo || "connect");
  }

  return (
    <div style={{ background: colors.bg, minHeight: "100vh", color: colors.text, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      {screen === "connect" && (
        <>
          {scanError && (
            <div style={{ background: colors.critical + "22", border: `1px solid ${colors.critical}44`, color: colors.critical, padding: "10px 24px", fontSize: 13, textAlign: "center" }}>
              ⚠ {scanError}
            </div>
          )}
          <ConnectScreen onScanStart={handleScanStart} onOpenHistoryRun={run => openHistoryRun(run, "connect")} />
        </>
      )}

      {screen === "scan" && (
        <ScanScreen
          runId={runId}
          orgAlias={orgAlias}
          onDone={handleScanDone}
          onError={handleScanError}
        />
      )}

      {screen === "dashboard" && scanResult && (
        <DashboardScreen
          data={scanResult}
          onFinish={handleFinish}
          onOpenHistoryRun={run => openHistoryRun(run, "dashboard")}
        />
      )}

      {screen === "cleanup" && scanResult && (
        <CleanupScreen
          runId={runId}
          metaPath={scanResult.metaPath}
          folderSizeBytes={scanResult.folderSizeBytes}
          orgName={scanResult.org.name || scanResult.org.alias}
          onDone={handleCleanupDone}
          onBack={() => setScreen("dashboard")}
        />
      )}

      {screen === "historyrun" && historyRun && (
        <HistoryRunScreen run={historyRun} onBack={closeHistoryRun} />
      )}
    </div>
  );
}
