// Prompt template registry for the AI Insights feature.
//
// Each scenario exports:
//   - An entry in SCENARIOS (id, label, icon, description, bestFor)
//   - A builder function in PROMPT_BUILDERS[id](ctx) → { systemPrompt, userPrompt }
//
// ctx shape:
//   orgContext   — { orgName, orgId, edition, isSandbox, actionItems[] }
//   selectedItems — string[]
//   fileContents  — Map<itemName, string>  (empty when metadata was deleted)
//   findings      — actionItems[] filtered to the selected items

const SCENARIOS = [
  {
    id: "quick-health",
    label: "Quick Health Check",
    icon: "🔍",
    description: "A concise quality overview — key issues, risks, and top recommendations.",
    bestFor: "Any metadata type",
  },
  {
    id: "deep-code-review",
    label: "Deep Code Review",
    icon: "🔬",
    description: "Line-level review: governor limits, null safety, SObject coupling, anti-patterns, dead code.",
    bestFor: "Apex Classes, Apex Triggers",
  },
  {
    id: "logic-flow",
    label: "Logic & Flow Analysis",
    icon: "🔄",
    description: "Explains what each flow or trigger does, flags logic gaps, and identifies automation overlap.",
    bestFor: "Flows, Apex Triggers",
  },
  {
    id: "security-audit",
    label: "Security & Access Audit",
    icon: "🔐",
    description: "Reviews for privilege escalation, over-broad permissions, data exposure, and sharing gaps.",
    bestFor: "Profiles, Permission Sets",
  },
  {
    id: "cross-impact",
    label: "Cross-Metadata Impact",
    icon: "🕸️",
    description: "Reasons across all selected items together — finds hidden dependencies and coupling risks.",
    bestFor: "Mixed selection",
  },
  {
    id: "exec-summary",
    label: "Executive Summary",
    icon: "📋",
    description: "Plain-English narrative for a non-technical stakeholder — health status, priorities, and next steps.",
    bestFor: "Any metadata type",
  },
];

// ── Shared helpers ────────────────────────────────────────────────────────────

function orgBlock(orgContext) {
  return [
    `## Org Context`,
    `- **Name:** ${orgContext.orgName || "Unknown"}`,
    `- **Org ID:** ${orgContext.orgId || "Unknown"}`,
    `- **Edition:** ${orgContext.edition || "Unknown"}`,
    `- **Environment:** ${orgContext.isSandbox ? "Sandbox" : "Production"}`,
  ].join("\n");
}

function itemListBlock(selectedItems) {
  return `## Selected Items (${selectedItems.length})\n${selectedItems.map(n => `- ${n}`).join("\n")}`;
}

function sourceBlock(fileContents) {
  if (!fileContents || fileContents.size === 0) return null;
  const parts = [];
  for (const [name, content] of fileContents) {
    parts.push(`### ${name}\n\`\`\`\n${content}\n\`\`\``);
  }
  return `## Source / Metadata Content\n\n${parts.join("\n\n")}`;
}

function findingsBlock(findings) {
  if (!findings || findings.length === 0) return null;
  const lines = findings.map(f =>
    `- **[${f.impact || "Info"}] ${f.title}**\n  Action: ${f.action}` +
    (f.components?.length ? `\n  Affected: ${f.components.slice(0, 10).join(", ")}` : "")
  );
  return `## Existing Scan Findings (from rule-based analysis)\n\n${lines.join("\n\n")}`;
}

function fallbackNote() {
  return `> **Note:** Raw metadata files are not available for this scan (metadata was deleted after the scan completed). Analysis is based on the scan findings recorded at the time of the scan.`;
}

function contentSection(fileContents, findings) {
  const src = sourceBlock(fileContents);
  const fin = findingsBlock(findings);
  if (src) return src + (fin ? "\n\n" + fin : "");
  return (fin ? fallbackNote() + "\n\n" + fin : fallbackNote());
}

// ── Prompt builders ───────────────────────────────────────────────────────────

const PROMPT_BUILDERS = {

  "quick-health": (ctx) => ({
    systemPrompt: `You are a senior Salesforce architect performing a health review of org metadata. \
Provide concise, actionable feedback. Use Markdown with clear headers (##) and bullet points. \
Focus on what matters most — skip trivial style notes.`,
    userPrompt: [
      orgBlock(ctx.orgContext),
      itemListBlock(ctx.selectedItems),
      contentSection(ctx.fileContents, ctx.findings),
      `---\n\nPerform a **Quick Health Check** on the items above. For each item:\n\
1. Summarise what it does (1–2 sentences)\n\
2. List any quality issues, risks, or concerns found\n\
3. Suggest the top remediation action\n\n\
End with a **Priority Actions** section listing the top 3–5 items to address, ordered by risk.`,
    ].filter(Boolean).join("\n\n"),
  }),

  "deep-code-review": (ctx) => ({
    systemPrompt: `You are a senior Salesforce Apex engineer performing a detailed code review. \
Analyse the provided Apex code for: governor limit risks (SOQL/DML inside loops, unbounded queries), \
null pointer risks, hardcoded IDs or URLs, missing error handling (try/catch), SObject coupling, \
over-complex methods, dead code, and test coverage gaps. \
Reference specific class names and line-level patterns where possible. Use Markdown.`,
    userPrompt: [
      orgBlock(ctx.orgContext),
      itemListBlock(ctx.selectedItems),
      contentSection(ctx.fileContents, ctx.findings),
      `---\n\nPerform a **Deep Code Review** of the Apex code above.\n\n\
For each class or trigger:\n\
- List every issue found with severity (Critical / Warning / Info)\n\
- Quote the problematic pattern or describe the line-level location\n\
- Provide a concrete fix or refactoring recommendation\n\n\
End with a **Remediation Priority List** — top issues ranked by risk to production stability.`,
    ].filter(Boolean).join("\n\n"),
  }),

  "logic-flow": (ctx) => ({
    systemPrompt: `You are a senior Salesforce automation architect. \
Your job is to read Flow metadata XML and Apex trigger code, explain the business logic, \
and identify quality issues: missing fault handlers, missing null checks, \
automation overlap (flow doing what a trigger also does), hardcoded values, \
performance risks (queries per record vs bulk), and missing governor limit guards. \
Use Markdown with clear headers.`,
    userPrompt: [
      orgBlock(ctx.orgContext),
      itemListBlock(ctx.selectedItems),
      contentSection(ctx.fileContents, ctx.findings),
      `---\n\nPerform a **Logic & Flow Analysis** on the automation above.\n\n\
For each flow or trigger:\n\
1. **What it does** — explain the business logic in plain English (2–4 sentences)\n\
2. **Logic gaps** — missing error paths, missing null checks, uncovered edge cases\n\
3. **Automation overlap** — does this duplicate logic in another trigger or flow?\n\
4. **Performance risks** — will this cause governor limit issues at scale?\n\
5. **Recommended improvements**\n\n\
End with a **Cross-Automation Conflicts** section if any overlap is found across the selected items.`,
    ].filter(Boolean).join("\n\n"),
  }),

  "security-audit": (ctx) => ({
    systemPrompt: `You are a Salesforce security architect. \
Review the provided profile and permission set metadata for: \
over-broad permissions (ModifyAllData, ViewAllData, ManageUsers), \
dangerous object/field-level access (e.g. full CRUD on sensitive objects), \
missing IP range restrictions, permission creep (permissions that shouldn't be combined), \
and privilege escalation vectors. \
Flag every finding with severity (Critical / Warning / Info). Use Markdown.`,
    userPrompt: [
      orgBlock(ctx.orgContext),
      itemListBlock(ctx.selectedItems),
      contentSection(ctx.fileContents, ctx.findings),
      `---\n\nPerform a **Security & Access Audit** on the profiles/permission sets above.\n\n\
For each item:\n\
- List every permission or access setting that poses a security risk\n\
- Explain why it is risky and what attack vector or data exposure it enables\n\
- Provide a remediation recommendation (what to restrict or split)\n\n\
End with a **Critical Findings Summary** — all Critical items in one list for immediate action.`,
    ].filter(Boolean).join("\n\n"),
  }),

  "cross-impact": (ctx) => ({
    systemPrompt: `You are a Salesforce solution architect specialising in cross-metadata dependency analysis. \
Your job is to reason across multiple metadata items together — finding hidden dependencies, \
coupling risks, and impact chains that single-item analysis would miss. \
Examples: a deprecated field still referenced in an active flow; a permission set granting access \
to an object that no profile exposes; a trigger and a flow both writing to the same field. \
Use Markdown with clear headers.`,
    userPrompt: [
      orgBlock(ctx.orgContext),
      itemListBlock(ctx.selectedItems),
      contentSection(ctx.fileContents, ctx.findings),
      `---\n\nPerform a **Cross-Metadata Impact Analysis** across all items above.\n\n\
1. **Dependency Map** — list every relationship or reference found between the selected items\n\
2. **Hidden Risks** — coupling, circular dependencies, or shared mutable state\n\
3. **Change Impact** — if any one item were modified or deleted, what else would break?\n\
4. **Consolidation Opportunities** — redundant logic that could be unified\n\n\
Be specific — name the items and the fields/methods/permissions involved in each finding.`,
    ].filter(Boolean).join("\n\n"),
  }),

  "exec-summary": (ctx) => ({
    systemPrompt: `You are a Salesforce technical lead writing a briefing for a non-technical business stakeholder. \
Translate technical metadata findings into plain business language. \
No code snippets. No jargon. Focus on business risk, business impact, and business actions. \
Use Markdown with headers but keep the language accessible.`,
    userPrompt: [
      orgBlock(ctx.orgContext),
      itemListBlock(ctx.selectedItems),
      contentSection(ctx.fileContents, ctx.findings),
      `---\n\nWrite an **Executive Summary** of the org health status based on the analysis above.\n\n\
Structure:\n\
1. **Overall Assessment** (2–3 sentences — is the org in good shape, needs attention, or at risk?)\n\
2. **Top Risks** — up to 5 business risks explained in plain English (what could go wrong, what is the impact?)\n\
3. **Recommended Actions** — concrete next steps for the business, with an approximate effort level (Days / Weeks / Months)\n\
4. **What's Working Well** — strengths observed\n\n\
Keep the entire summary under 500 words. Avoid Salesforce-specific acronyms without explanation.`,
    ].filter(Boolean).join("\n\n"),
  }),
};

function buildPrompt(scenarioId, ctx) {
  const builder = PROMPT_BUILDERS[scenarioId];
  if (!builder) throw new Error(`Unknown scenario: "${scenarioId}"`);
  return builder(ctx);
}

module.exports = { SCENARIOS, buildPrompt };
