import { useState, useEffect, useRef } from "react";
import { api } from "../api";
import { useTheme } from "../ThemeContext";

const SCENARIOS = [
  { id: "quick-health",    label: "Quick Health Check",      icon: "🔍", description: "A concise quality overview — key issues, risks, and top recommendations.",                                           bestFor: "Any metadata type" },
  { id: "deep-code-review",label: "Deep Code Review",        icon: "🔬", description: "Line-level review: governor limits, null safety, SObject coupling, anti-patterns, dead code.",                       bestFor: "Apex Classes, Triggers" },
  { id: "logic-flow",      label: "Logic & Flow Analysis",   icon: "🔄", description: "Explains what each flow or trigger does, flags logic gaps, and identifies automation overlap.",                        bestFor: "Flows, Apex Triggers" },
  { id: "security-audit",  label: "Security & Access Audit", icon: "🔐", description: "Reviews for privilege escalation, over-broad permissions, data exposure, and sharing gaps.",                           bestFor: "Profiles, Permission Sets" },
  { id: "cross-impact",    label: "Cross-Metadata Impact",   icon: "🕸️", description: "Reasons across all selected items together — finds hidden dependencies and coupling risks.",                           bestFor: "Mixed selection" },
  { id: "exec-summary",    label: "Executive Summary",       icon: "📋", description: "Plain-English narrative for a non-technical stakeholder — health status, priorities, and next steps.",                 bestFor: "Any metadata type" },
];

const METADATA_TYPES = [
  { id: "classes",        label: "Apex Classes",   icon: "⚡", description: "Analyse Apex class source code for quality, performance, and security issues." },
  { id: "triggers",       label: "Apex Triggers",  icon: "🔁", description: "Review trigger logic, bulkification, and automation overlap." },
  { id: "flows",          label: "Flows",           icon: "🔄", description: "Understand flow logic, fault handling, and automation conflicts." },
  { id: "objects",        label: "Custom Objects",  icon: "🏗️", description: "Review object definitions, field structure, and data model health." },
  { id: "permissionsets", label: "Permission Sets", icon: "🔑", description: "Audit permission sets for over-broad access and privilege escalation." },
  { id: "profiles",       label: "Profiles",        icon: "👤", description: "Review profile permissions, object access, and field-level security." },
];

const MAX_ITEMS = 20;

const KEY_PLACEHOLDER = { anthropic: "sk-...", gemini: "AIza..." };

// ── AI Config panel ────────────────────────────────────────────────────────────
// Original 3-column layout (provider / model / api key) + Save to .env button.
// The API key field reactively reflects the stored key for the selected provider.
// Editing the key and clicking Save persists it to .env.
function AiConfigPanel({ config, onChange, colors }) {
  const [showKey, setShowKey]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // null | "saved" | "error"
  const [saveMsg, setSaveMsg]     = useState("");

  const providerModels  = config.providerModels || {};
  const providerOptions = Object.keys(providerModels).length > 0
    ? Object.keys(providerModels)
    : ["anthropic", "gemini"];
  const modelOptions = providerModels[config.provider] || [];
  const envKeys = config.envKeys || { anthropic: "", gemini: "" };

  // When provider changes, switch the displayed key to that provider's stored key
  function handleProviderChange(provider) {
    onChange({ ...config, provider, model: "", apiKey: envKeys[provider] || "" });
  }

  // When the user edits the key field, update both the session apiKey and envKeys
  function handleKeyChange(val) {
    onChange({
      ...config,
      apiKey: val,
      envKeys: { ...envKeys, [config.provider]: val },
    });
  }

  async function handleSave() {
    setSaving(true);
    setSaveStatus(null);
    try {
      const result = await api.saveEnvConfig(config.provider, { ...envKeys, [config.provider]: config.apiKey });
      setSaveStatus("saved");
      setSaveMsg(result.message || ".env saved.");
    } catch (e) {
      setSaveStatus("error");
      setSaveMsg(e.message || "Failed to save .env.");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveStatus(null), 4000);
    }
  }

  return (
    <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
      <div style={{ fontWeight: 700, color: colors.text, fontSize: 13, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
        ⚙️ AI Configuration
        {config.envLoaded && (
          <span style={{ fontSize: 10, color: colors.success, background: colors.success + "18", padding: "1px 7px", borderRadius: 4, fontWeight: 600 }}>.env loaded</span>
        )}
        <span style={{ fontSize: 11, color: colors.muted, fontWeight: 400, marginLeft: 2 }}>— overrides server .env settings</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>

        {/* Provider */}
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: colors.muted, marginBottom: 6, letterSpacing: 0.5, textTransform: "uppercase" }}>Provider</label>
          <select
            value={config.provider}
            onChange={e => handleProviderChange(e.target.value)}
            style={{ width: "100%", padding: "8px 10px", background: colors.bg, border: `1px solid ${colors.panelBorder}`, borderRadius: 6, color: colors.text, fontSize: 13, outline: "none" }}
          >
            {providerOptions.map(p => (
              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>
        </div>

        {/* Model */}
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: colors.muted, marginBottom: 6, letterSpacing: 0.5, textTransform: "uppercase" }}>Model</label>
          <select
            value={config.model}
            onChange={e => onChange({ ...config, model: e.target.value })}
            style={{ width: "100%", padding: "8px 10px", background: colors.bg, border: `1px solid ${colors.panelBorder}`, borderRadius: 6, color: colors.text, fontSize: 13, outline: "none" }}
          >
            <option value="">— Default —</option>
            {modelOptions.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* API Key — reactive to provider selection */}
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: colors.muted, marginBottom: 6, letterSpacing: 0.5, textTransform: "uppercase" }}>
            API Key
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type={showKey ? "text" : "password"}
              value={config.apiKey}
              onChange={e => handleKeyChange(e.target.value)}
              placeholder={KEY_PLACEHOLDER[config.provider] || "Paste API key…"}
              style={{ flex: 1, padding: "8px 10px", background: colors.bg, border: `1px solid ${config.apiKey ? colors.success + "66" : colors.panelBorder}`, borderRadius: 6, color: colors.text, fontSize: 12, outline: "none", fontFamily: "monospace" }}
            />
            <button
              type="button"
              onClick={() => setShowKey(s => !s)}
              style={{ padding: "0 10px", background: colors.highlight, border: `1px solid ${colors.panelBorder}`, borderRadius: 6, color: colors.muted, cursor: "pointer", fontSize: 13 }}
            >
              {showKey ? "🙈" : "👁"}
            </button>
          </div>
        </div>
      </div>

      {/* Save row */}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 14 }}>
        {saveStatus && (
          <span style={{ fontSize: 12, color: saveStatus === "saved" ? colors.success : colors.critical }}>
            {saveStatus === "saved" ? "✓ " : "⚠ "}{saveMsg}
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={saving || !config.apiKey}
          style={{ padding: "7px 18px", background: saving || !config.apiKey ? colors.muted : colors.accentSoft, border: "none", color: "#fff", borderRadius: 6, cursor: saving || !config.apiKey ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700 }}
        >
          {saving ? "Saving…" : "💾 Save to .env"}
        </button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function AiInsightsTab({ runId, orgAlias, orgContext, isHistory, metadataRetained }) {
  const { colors } = useTheme();

  // Phases: type-select → item-select → scenario-select → review-prompt → streaming → done
  const [phase, setPhase]                   = useState("type-select");
  const [selectedType, setSelectedType]     = useState(null);
  const [itemsData, setItemsData]           = useState(null);
  const [loadingItems, setLoadingItems]     = useState(false);
  const [selectedItems, setSelectedItems]   = useState([]);
  const [filter, setFilter]                 = useState("");
  const [selectedScenario, setSelectedScenario] = useState(null);

  // Review Prompt state
  const [promptData, setPromptData]         = useState(null); // { systemPrompt, userPrompt }
  const [loadingPrompt, setLoadingPrompt]   = useState(false);
  const [editedSystem, setEditedSystem]     = useState("");
  const [editedUser, setEditedUser]         = useState("");

  // Streaming
  const [output, setOutput]                 = useState("");
  const [streaming, setStreaming]           = useState(false);
  const [streamError, setStreamError]       = useState("");
  const [copied, setCopied]                 = useState(false);
  const abortRef = useRef(null);

  // AI config panel
  const [aiConfig, setAiConfig]             = useState({ provider: "anthropic", model: "", apiKey: "", providerModels: {} });
  const [showConfig, setShowConfig]         = useState(false);

  // Load provider/model list and persisted .env keys on mount
  useEffect(() => {
    Promise.all([
      api.getAiConfig().catch(() => ({ providers: {} })),
      api.getEnvConfig().catch(() => ({ exists: false, provider: "", keys: { anthropic: "", gemini: "" } })),
    ]).then(([configData, envData]) => {
      setAiConfig(prev => ({
        ...prev,
        providerModels: configData.providers || {},
        // Use the provider from .env if set, otherwise keep default
        provider: envData.provider || prev.provider,
        // Pre-fill the session apiKey from the active provider's stored key
        apiKey: envData.keys?.[envData.provider || prev.provider] || prev.apiKey,
        // Store all per-provider keys for the config panel
        envKeys: envData.keys || { anthropic: "", gemini: "" },
        envLoaded: envData.exists,
      }));
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);

  // ── Phase 1 → 2 ───────────────────────────────────────────────────────────
  async function handleTypeSelect(typeId) {
    setSelectedType(typeId);
    setSelectedItems([]);
    setFilter("");

    if (metadataRetained === false) {
      const fallbackItems = deriveItemsFromFindings(orgContext?.actionItems || [], typeId);
      setItemsData({ available: false, items: fallbackItems });
      setPhase("item-select");
      return;
    }

    setLoadingItems(true);
    try {
      const data = await api.listAiItems(runId, orgAlias, typeId);
      setItemsData(data);
    } catch {
      setItemsData({ available: false, items: [] });
    } finally {
      setLoadingItems(false);
      setPhase("item-select");
    }
  }

  function deriveItemsFromFindings(actionItems, typeId) {
    const typeHints = {
      classes:        ["apex", "class", "soql", "coverage"],
      triggers:       ["trigger"],
      flows:          ["flow", "automation", "fault", "process builder", "workflow"],
      objects:        ["object", "field", "lookup", "deprecated"],
      permissionsets: ["permission set", "permissionset"],
      profiles:       ["profile", "broad"],
    };
    const hints = typeHints[typeId] || [];
    const names = new Set();
    for (const item of actionItems) {
      if (hints.some(h => item.title?.toLowerCase().includes(h))) {
        (item.components || []).forEach(c => names.add(c));
      }
    }
    return [...names].sort();
  }

  // ── Phase 2: item selection ────────────────────────────────────────────────
  function toggleItem(name) {
    setSelectedItems(prev =>
      prev.includes(name) ? prev.filter(n => n !== name)
        : prev.length >= MAX_ITEMS ? prev
        : [...prev, name]
    );
  }

  function toggleAll() {
    const visible = (itemsData?.items || []).filter(n => n.toLowerCase().includes(filter.toLowerCase()));
    const toAdd = visible.filter(n => !selectedItems.includes(n));
    if (toAdd.length > 0) {
      setSelectedItems([...new Set([...selectedItems, ...toAdd])].slice(0, MAX_ITEMS));
    } else {
      setSelectedItems(prev => prev.filter(n => !visible.includes(n)));
    }
  }

  // ── Phase 3 → 4: scenario → review prompt ─────────────────────────────────
  async function handleScenarioSelect(scenarioId) {
    setSelectedScenario(scenarioId);
    setLoadingPrompt(true);
    setPhase("review-prompt");

    try {
      const aiCfg = {};
      if (aiConfig.provider) aiCfg.provider = aiConfig.provider;
      if (aiConfig.model)    aiCfg.model    = aiConfig.model;
      if (aiConfig.apiKey)   aiCfg.apiKey   = aiConfig.apiKey;

      const data = await api.getAiPrompt(runId, orgAlias, selectedType, scenarioId, selectedItems, orgContext, aiCfg);
      setPromptData(data);
      setEditedSystem(data.systemPrompt || "");
      setEditedUser(data.userPrompt || "");
    } catch (e) {
      setStreamError(e.message || "Failed to build prompt.");
      setPhase("scenario-select");
    } finally {
      setLoadingPrompt(false);
    }
  }

  // ── Phase 5: start analysis from reviewed prompt ───────────────────────────
  function startAnalysis() {
    setOutput("");
    setStreamError("");
    setStreaming(true);
    setPhase("streaming");

    const aiCfg = { scenario: selectedScenario };
    if (aiConfig.provider) aiCfg.provider = aiConfig.provider;
    if (aiConfig.model)    aiCfg.model    = aiConfig.model;
    if (aiConfig.apiKey)   aiCfg.apiKey   = aiConfig.apiKey;

    const promptOverride = {
      customSystemPrompt: editedSystem,
      customUserPrompt:   editedUser,
    };

    const ctrl = api.analyseWithAI(
      runId, orgAlias, selectedType, selectedItems, orgContext,
      aiCfg, promptOverride,
      {
        onToken: (text) => setOutput(prev => prev + text),
        onDone:  ()     => { setStreaming(false); setPhase("done"); },
        onError: (msg)  => { setStreamError(msg); setStreaming(false); setPhase("done"); },
      }
    );
    abortRef.current = ctrl;
  }

  function reset() {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    setPhase("type-select");
    setSelectedType(null);
    setItemsData(null);
    setSelectedItems([]);
    setFilter("");
    setSelectedScenario(null);
    setPromptData(null);
    setEditedSystem("");
    setEditedUser("");
    setOutput("");
    setStreamError("");
    setStreaming(false);
    setCopied(false);
  }

  async function copyOutput() {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  // ── Shared elements ────────────────────────────────────────────────────────
  const metadataDeletedBanner = (metadataRetained === false || (itemsData && !itemsData.available)) && (
    <div style={{ background: colors.warning + "18", border: `1px solid ${colors.warning}44`, borderRadius: 8, padding: "10px 16px", marginBottom: 20, fontSize: 12, color: colors.warning }}>
      ⚠ Metadata files were deleted after this scan. AI analysis will use stored scan findings instead of raw source files.
    </div>
  );

  const backBtn = (target, label = "← Back") => (
    <button onClick={() => setPhase(target)} style={{ background: "transparent", border: `1px solid ${colors.panelBorder}`, color: colors.muted, padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
      {label}
    </button>
  );

  const selectionRecap = (
    <div style={{ background: colors.highlight, borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 12, color: colors.muted }}>
      <strong style={{ color: colors.text }}>{METADATA_TYPES.find(t => t.id === selectedType)?.label}</strong>
      {" · "}<strong style={{ color: colors.text }}>{selectedItems.length}</strong> item{selectedItems.length !== 1 ? "s" : ""}: {" "}
      {selectedItems.slice(0, 5).join(", ")}{selectedItems.length > 5 ? ` … +${selectedItems.length - 5} more` : ""}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>

      {/* Info + config toggle */}
      <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: "14px 20px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <span style={{ fontSize: 18 }}>🧠</span>
          <div>
            <div style={{ fontWeight: 700, color: colors.text, fontSize: 13, marginBottom: 4 }}>AI Insights</div>
            <div style={{ fontSize: 12, color: colors.muted, lineHeight: 1.6 }}>
              Select metadata items, choose an analysis scenario, review and edit the generated prompt, then run the analysis.
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowConfig(s => !s)}
          style={{ flexShrink: 0, padding: "6px 14px", background: showConfig ? colors.accent + "22" : colors.highlight, border: `1px solid ${showConfig ? colors.accent : colors.panelBorder}`, borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: showConfig ? colors.accent : colors.muted, whiteSpace: "nowrap" }}
        >
          ⚙️ {showConfig ? "Hide Config" : "AI Config"}
        </button>
      </div>

      {/* Collapsible AI config panel */}
      {showConfig && (
        <AiConfigPanel config={aiConfig} onChange={setAiConfig} colors={colors} />
      )}

      {/* Step breadcrumb */}
      <StepIndicator phase={phase} colors={colors} />

      {/* ── Phase 1: Type selection ── */}
      {phase === "type-select" && (
        <div>
          {metadataDeletedBanner}
          <h3 style={{ margin: "0 0 16px", color: colors.text, fontSize: 15, fontWeight: 700 }}>Step 1 — Select a Metadata Type</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
            {METADATA_TYPES.map(type => (
              <button key={type.id} onClick={() => handleTypeSelect(type.id)} disabled={loadingItems}
                style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: "18px 20px", cursor: "pointer", textAlign: "left" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = colors.accent}
                onMouseLeave={e => e.currentTarget.style.borderColor = colors.panelBorder}
              >
                <div style={{ fontSize: 28, marginBottom: 10 }}>{type.icon}</div>
                <div style={{ fontWeight: 700, color: colors.text, fontSize: 13, marginBottom: 6 }}>{type.label}</div>
                <div style={{ fontSize: 11, color: colors.muted, lineHeight: 1.5 }}>{type.description}</div>
              </button>
            ))}
          </div>
          {loadingItems && <p style={{ color: colors.muted, fontSize: 13, marginTop: 16 }}>Loading items…</p>}
        </div>
      )}

      {/* ── Phase 2: Item selection ── */}
      {phase === "item-select" && itemsData && (
        <div>
          {metadataDeletedBanner}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            {backBtn("type-select")}
            <h3 style={{ margin: 0, color: colors.text, fontSize: 15, fontWeight: 700 }}>
              Step 2 — Select Items
              <span style={{ marginLeft: 10, fontSize: 12, color: colors.muted, fontWeight: 400 }}>{METADATA_TYPES.find(t => t.id === selectedType)?.label}</span>
            </h3>
          </div>

          {itemsData.items.length === 0 ? (
            <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 10, padding: 24, textAlign: "center" }}>
              <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>No items found for this metadata type in this scan.</p>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center" }}>
                <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter items…"
                  style={{ flex: 1, padding: "8px 12px", background: colors.bg, border: `1px solid ${colors.panelBorder}`, borderRadius: 8, color: colors.text, fontSize: 13, outline: "none", fontFamily: "monospace" }} />
                <button onClick={toggleAll} style={{ background: "transparent", border: `1px solid ${colors.panelBorder}`, color: colors.muted, padding: "7px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
                  {selectedItems.length > 0 ? "Deselect All" : "Select All"}
                </button>
                <button
                  onClick={() => { setSelectedItems([]); setFilter(""); }}
                  disabled={selectedItems.length === 0}
                  title="Clear all selections and reset filter"
                  style={{ background: "transparent", border: `1px solid ${selectedItems.length > 0 ? colors.critical + "88" : colors.panelBorder}`, color: selectedItems.length > 0 ? colors.critical : colors.muted, padding: "7px 14px", borderRadius: 6, cursor: selectedItems.length > 0 ? "pointer" : "not-allowed", fontSize: 12, opacity: selectedItems.length > 0 ? 1 : 0.45 }}
                >
                  ✕ Clear
                </button>
              </div>
              <div style={{ fontSize: 12, color: selectedItems.length >= MAX_ITEMS ? colors.warning : colors.muted, marginBottom: 10 }}>
                {selectedItems.length} of {MAX_ITEMS} max selected{selectedItems.length >= MAX_ITEMS ? " — limit reached" : ""}
              </div>
              <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, overflow: "hidden", maxHeight: 400, overflowY: "auto" }}>
                {itemsData.items.filter(n => n.toLowerCase().includes(filter.toLowerCase())).map((name, i, arr) => {
                  const checked  = selectedItems.includes(name);
                  const disabled = !checked && selectedItems.length >= MAX_ITEMS;
                  return (
                    <label key={name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: i < arr.length - 1 ? `1px solid ${colors.panelBorder}` : "none", cursor: disabled ? "not-allowed" : "pointer", background: checked ? colors.accent + "10" : "transparent", opacity: disabled ? 0.45 : 1 }}>
                      <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleItem(name)} style={{ accentColor: colors.accent, width: 15, height: 15, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontFamily: "monospace", color: colors.text }}>{name}</span>
                    </label>
                  );
                })}
              </div>
              <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
                <button onClick={() => setPhase("scenario-select")} disabled={selectedItems.length === 0}
                  style={{ padding: "10px 24px", background: selectedItems.length > 0 ? colors.accent : colors.muted, color: colors.name === "light" ? "#fff" : "#000", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: selectedItems.length > 0 ? "pointer" : "not-allowed" }}>
                  Continue with {selectedItems.length} item{selectedItems.length !== 1 ? "s" : ""} →
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Phase 3: Scenario selection ── */}
      {phase === "scenario-select" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            {backBtn("item-select")}
            <h3 style={{ margin: 0, color: colors.text, fontSize: 15, fontWeight: 700 }}>Step 3 — Choose Analysis Scenario</h3>
          </div>
          {selectionRecap}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 14 }}>
            {SCENARIOS.map(scenario => (
              <button key={scenario.id} onClick={() => handleScenarioSelect(scenario.id)}
                style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: "18px 20px", cursor: "pointer", textAlign: "left" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = colors.accent}
                onMouseLeave={e => e.currentTarget.style.borderColor = colors.panelBorder}
              >
                <div style={{ fontSize: 26, marginBottom: 8 }}>{scenario.icon}</div>
                <div style={{ fontWeight: 700, color: colors.text, fontSize: 13, marginBottom: 6 }}>{scenario.label}</div>
                <div style={{ fontSize: 11, color: colors.muted, lineHeight: 1.5, marginBottom: 8 }}>{scenario.description}</div>
                <div style={{ fontSize: 10, color: colors.accent, background: colors.accent + "15", padding: "2px 8px", borderRadius: 4, display: "inline-block" }}>Best for: {scenario.bestFor}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Phase 4: Review Prompt ── */}
      {phase === "review-prompt" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            {backBtn("scenario-select")}
            <h3 style={{ margin: 0, color: colors.text, fontSize: 15, fontWeight: 700 }}>Step 4 — Review & Edit Prompt</h3>
          </div>
          {selectionRecap}

          {loadingPrompt ? (
            <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: 32, textAlign: "center" }}>
              <div style={{ fontSize: 24, marginBottom: 10, animation: "pulse 1s infinite" }}>⏳</div>
              <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>Building prompt from metadata…</p>
            </div>
          ) : (
            <>
              <div style={{ background: colors.highlight, border: `1px solid ${colors.panelBorder}`, borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 12, color: colors.muted, lineHeight: 1.6 }}>
                💡 The prompts below were auto-generated from your selections. You can edit them to fine-tune the analysis — changes are sent directly to the AI. The system prompt sets the AI's role; the user prompt contains your instructions and the metadata context.
              </div>

              {/* System prompt */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: colors.muted, letterSpacing: 0.8, textTransform: "uppercase" }}>System Prompt</span>
                  <span style={{ fontSize: 10, color: colors.muted }}>{editedSystem.length} chars</span>
                </label>
                <textarea
                  value={editedSystem}
                  onChange={e => setEditedSystem(e.target.value)}
                  rows={4}
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", background: colors.bg, border: `1px solid ${colors.panelBorder}`, borderRadius: 8, color: colors.text, fontSize: 12, fontFamily: "monospace", lineHeight: 1.6, outline: "none", resize: "vertical" }}
                />
              </div>

              {/* User prompt */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: colors.muted, letterSpacing: 0.8, textTransform: "uppercase" }}>User Prompt</span>
                  <span style={{ fontSize: 10, color: colors.muted }}>{editedUser.length} chars</span>
                </label>
                <textarea
                  value={editedUser}
                  onChange={e => setEditedUser(e.target.value)}
                  rows={14}
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", background: colors.bg, border: `1px solid ${colors.panelBorder}`, borderRadius: 8, color: colors.text, fontSize: 12, fontFamily: "monospace", lineHeight: 1.6, outline: "none", resize: "vertical" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button
                  onClick={() => handleScenarioSelect(selectedScenario)}
                  style={{ background: "transparent", border: `1px solid ${colors.panelBorder}`, color: colors.muted, padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}
                >
                  ↺ Regenerate from Scenario
                </button>
                <button
                  onClick={startAnalysis}
                  disabled={!editedSystem.trim() || !editedUser.trim()}
                  style={{ padding: "10px 28px", background: colors.accent, color: colors.name === "light" ? "#fff" : "#000", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                >
                  Run Analysis →
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Phase 5 / done: Streaming output ── */}
      {(phase === "streaming" || phase === "done") && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 18 }}>{SCENARIOS.find(s => s.id === selectedScenario)?.icon}</span>
              <div>
                <div style={{ fontWeight: 700, color: colors.text, fontSize: 14 }}>{SCENARIOS.find(s => s.id === selectedScenario)?.label}</div>
                <div style={{ fontSize: 11, color: colors.muted }}>
                  {selectedItems.length} {METADATA_TYPES.find(t => t.id === selectedType)?.label}
                  {aiConfig.model ? ` · ${aiConfig.model}` : ""}
                  {" · "}{isHistory ? "historical run" : "live scan"}
                </div>
              </div>
            </div>
            {phase === "done" && !streamError && (
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setPhase("review-prompt")} style={{ padding: "7px 14px", background: colors.highlight, border: `1px solid ${colors.panelBorder}`, color: colors.muted, borderRadius: 6, cursor: "pointer", fontSize: 12 }}>← Edit Prompt</button>
                <button onClick={copyOutput} style={{ padding: "7px 14px", background: colors.highlight, border: `1px solid ${colors.panelBorder}`, color: colors.text, borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                  {copied ? "✓ Copied" : "📋 Copy"}
                </button>
                <button onClick={reset} style={{ padding: "7px 14px", background: colors.accent, border: "none", color: colors.name === "light" ? "#fff" : "#000", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>New Analysis</button>
              </div>
            )}
            {phase === "streaming" && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  onClick={() => {
                    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
                    setStreaming(false);
                    setPhase("review-prompt");
                  }}
                  style={{ padding: "7px 14px", background: colors.highlight, border: `1px solid ${colors.panelBorder}`, color: colors.muted, borderRadius: 6, cursor: "pointer", fontSize: 12 }}
                >
                  ← Back
                </button>
                <div style={{ fontSize: 12, color: colors.muted, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: colors.accent, animation: "pulse 1s infinite" }} />
                  Generating…
                </div>
              </div>
            )}
          </div>

          {streamError && (
            <div style={{ background: colors.critical + "18", border: `1px solid ${colors.critical}44`, borderRadius: 8, padding: "12px 16px", marginBottom: 16, color: colors.critical, fontSize: 13 }}>
              ⚠ {streamError}
              <button onClick={reset} style={{ marginLeft: 16, background: "transparent", border: `1px solid ${colors.critical}44`, color: colors.critical, padding: "3px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>Try Again</button>
            </div>
          )}

          <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 12, padding: 24, minHeight: 200 }}>
            {output ? (
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "'Segoe UI', system-ui, sans-serif", fontSize: 13, color: colors.text, lineHeight: 1.7 }}>
                {output}
              </pre>
            ) : (
              !streamError && <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>Waiting for response…</p>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}

// ── Step breadcrumb ────────────────────────────────────────────────────────────
function StepIndicator({ phase, colors }) {
  const steps = [
    { id: "type-select",     label: "Metadata Type" },
    { id: "item-select",     label: "Select Items" },
    { id: "scenario-select", label: "Scenario" },
    { id: "review-prompt",   label: "Review Prompt" },
    { id: "streaming",       label: "Analysis" },
  ];
  const currentIdx    = steps.findIndex(s => s.id === phase);
  const effectiveIdx  = phase === "done" ? steps.length - 1 : currentIdx < 0 ? 0 : currentIdx;

  return (
    <div style={{ display: "flex", marginBottom: 24, alignItems: "center" }}>
      {steps.map((step, i) => {
        const done   = i < effectiveIdx;
        const active = i === effectiveIdx;
        const color  = done ? colors.success : active ? colors.accent : colors.muted;
        return (
          <div key={step.id} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "none" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: done ? colors.success : active ? colors.accent : colors.highlight, border: `2px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: (done || active) ? (colors.name === "light" ? "#fff" : "#000") : colors.muted }}>
                {done ? "✓" : i + 1}
              </div>
              <span style={{ fontSize: 9, color, fontWeight: active ? 700 : 400, whiteSpace: "nowrap" }}>{step.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? colors.success : colors.panelBorder, margin: "0 4px", marginBottom: 14 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
