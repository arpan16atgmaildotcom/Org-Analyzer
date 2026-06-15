async function request(path, options = {}) {
  const res = await fetch(path, { credentials: "include", ...options });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  listOrgs: () => request("/api/orgs"),
  loginWeb: (alias, isSandbox) => request("/api/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alias, isSandbox }),
  }),
  loginStatus: (loginId) => request(`/api/connect/status/${loginId}`),
  cancelLogin: (loginId) => request(`/api/connect/${loginId}`, { method: "DELETE" }),
  startScan: (orgAlias) => request("/api/scan/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgAlias }),
  }),
  getScanResult: (runId) => request(`/api/scan/result/${runId}`),
  cleanupScan: (runId, keep) => request(`/api/scan/${runId}?keep=${keep}`, { method: "DELETE" }),
  getHistory: () => request("/api/history"),
  getOrgHistory: (orgId) => request(`/api/history/${orgId}`),

  // Returns an EventSource for SSE scan progress
  scanStatus: (runId) => new EventSource(`/api/scan/status/${runId}`),

  // AI Insights — config (providers + model lists)
  getAiConfig: () => request("/api/ai/config"),

  // AI Insights — read stored .env keys
  getEnvConfig: () => request("/api/ai/env-config"),

  // AI Insights — save keys to .env (create or update)
  saveEnvConfig: (provider, keys) => request("/api/ai/env-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, keys }),
  }),

  // AI Insights — list items for a metadata type
  listAiItems: (runId, orgAlias, type) =>
    request(`/api/ai/items?runId=${encodeURIComponent(runId)}&orgAlias=${encodeURIComponent(orgAlias)}&type=${encodeURIComponent(type)}`),

  // AI Insights — fetch the generated prompt before streaming (Review Prompt phase).
  // aiConfig: { provider?, model?, apiKey? }
  getAiPrompt: (runId, orgAlias, type, scenario, items, orgContext, aiConfig = {}) => {
    const { actionItems, ...safeOrgContext } = orgContext;
    const selectedSet = new Set(items.map(n => n.toLowerCase()));
    const findings = (actionItems || [])
      .filter(item => (item.components || []).some(c => selectedSet.has(c.toLowerCase())))
      .map(({ title, action, impact, components }) => ({ title, action, impact, components: (components || []).slice(0, 20) }));
    return request("/api/ai/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, orgAlias, type, scenario, items, orgContext: safeOrgContext, findings, ...aiConfig }),
    });
  },

  // AI Insights — stream analysis via POST fetch + ReadableStream.
  // Calls onToken(text) for each streamed chunk, then onDone() or onError(msg).
  // Returns an AbortController so the caller can cancel mid-stream.
  analyseWithAI: (runId, orgAlias, type, items, orgContext, aiConfig = {}, promptOverride = {}, { onToken, onDone, onError } = {}) => {
    const { actionItems, ...safeOrgContext } = orgContext;
    const selectedSet = new Set(items.map(n => n.toLowerCase()));
    const findings = (actionItems || [])
      .filter(item => (item.components || []).some(c => selectedSet.has(c.toLowerCase())))
      .map(({ title, action, impact, components }) => ({ title, action, impact, components: (components || []).slice(0, 20) }));

    const ctrl = new AbortController();

    const body = { runId, orgAlias, type, items, orgContext: safeOrgContext, findings, ...aiConfig };
    if (promptOverride.customSystemPrompt) body.customSystemPrompt = promptOverride.customSystemPrompt;
    if (promptOverride.customUserPrompt)   body.customUserPrompt   = promptOverride.customUserPrompt;
    if (aiConfig.scenario)                 body.scenario           = aiConfig.scenario;

    fetch("/api/ai/analyse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      credentials: "include",
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        onError && onError(err.error || res.statusText);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop(); // keep incomplete last line
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "token")  { onToken && onToken(data.text); }
            if (data.type === "done")   { onDone  && onDone(); }
            if (data.type === "error")  { onError && onError(data.message || "Analysis failed."); }
          } catch { /* malformed SSE line — skip */ }
        }
      }
    }).catch((err) => {
      if (err.name !== "AbortError") onError && onError("Connection to server lost. Please try again.");
    });

    return ctrl;
  },
};
