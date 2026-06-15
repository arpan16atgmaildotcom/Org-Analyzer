import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const SEVERITY_COLOR = {
  critical: [220, 53, 69],
  warning:  [255, 193, 7],
  info:     [13, 110, 253],
  pass:     [40, 167, 69],
};

function fmtMB(mb) {
  if (mb == null) return "—";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

// Filename: {alias}_{YYYY-MM-DD_HH-mm}.pdf — alias is sanitised so the file is
// always safe on macOS / Windows / Linux filesystems.
function buildFilename(alias) {
  const safeAlias = (alias || "org").replace(/[^A-Za-z0-9_-]/g, "_");
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
  return `${safeAlias}_${stamp}.pdf`;
}

function sectionHeader(doc, title, y) {
  doc.setFillColor(33, 37, 41);
  doc.rect(40, y - 18, doc.internal.pageSize.getWidth() - 80, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(title, 50, y);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  return y + 18;
}

function ensureSpace(doc, currentY, needed = 80) {
  if (currentY + needed > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    return 60;
  }
  return currentY;
}

export function exportDashboardPdf({ data, checkCatalog, categoryMeta }) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;

  // ── Cover ───────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Salesforce Org Health Report", margin, 70);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(80, 80, 80);
  doc.text(data.org.name || data.org.alias, margin, 92);
  const orgMeta = [
    `Org ID: ${data.org.id}`,
    `Edition: ${data.org.edition}`,
    `API: ${data.org.apiVersion}`,
    data.org.isSandbox ? "SANDBOX" : "PRODUCTION",
  ].join("   ·   ");
  doc.text(orgMeta, margin, 108);
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, 124);
  doc.setTextColor(0, 0, 0);

  // Score banner
  const scoreY = 160;
  doc.setFillColor(245, 245, 247);
  doc.rect(margin, scoreY, pageW - margin * 2, 70, "F");
  doc.setFontSize(36);
  doc.setFont("helvetica", "bold");
  doc.text(String(data.summary.score), margin + 24, scoreY + 50);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Overall Score (out of 100)", margin + 90, scoreY + 30);
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(
    `Critical: ${data.summary.critical}    Warning: ${data.summary.warning}    Info: ${data.summary.info}`,
    margin + 90, scoreY + 50
  );
  doc.setTextColor(0, 0, 0);

  // ── 1. Overview ─────────────────────────────────────────────────────────
  let y = sectionHeader(doc, "1. Overview", 270);

  // Category breakdown table
  autoTable(doc, {
    startY: y,
    head: [["Category", "Weight", "Score"]],
    body: data.categories.map(c => {
      const meta = categoryMeta[c.id] || {};
      return [c.label, meta.weight || "—", `${c.score} / 100`];
    }),
    theme: "grid",
    headStyles: { fillColor: [33, 37, 41], textColor: 255 },
    styles: { fontSize: 10, cellPadding: 6 },
    margin: { left: margin, right: margin },
  });
  y = doc.lastAutoTable.finalY + 14;

  // Storage
  const storage = data.storage;
  if (storage) {
    y = ensureSpace(doc, y, 90);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Storage", margin, y);
    y += 6;
    const storageRows = [];
    if (storage.dataStorage)      storageRows.push(["Data",      fmtMB(storage.dataStorage.used), fmtMB(storage.dataStorage.max), `${Math.round((storage.dataStorage.used / storage.dataStorage.max) * 100)}%`]);
    if (storage.fileStorage)      storageRows.push(["File",      fmtMB(storage.fileStorage.used), fmtMB(storage.fileStorage.max), `${Math.round((storage.fileStorage.used / storage.fileStorage.max) * 100)}%`]);
    if (storage.bigObjectStorage) storageRows.push(["Big Object", fmtMB(storage.bigObjectStorage.used), fmtMB(storage.bigObjectStorage.max), `${Math.round((storage.bigObjectStorage.used / storage.bigObjectStorage.max) * 100)}%`]);
    if (storageRows.length) {
      autoTable(doc, {
        startY: y,
        head: [["Type", "Used", "Max", "%"]],
        body: storageRows,
        theme: "striped",
        styles: { fontSize: 10, cellPadding: 5 },
        margin: { left: margin, right: margin },
      });
      y = doc.lastAutoTable.finalY + 14;
    }
  }

  // Apex coverage
  if (data.coverage) {
    y = ensureSpace(doc, y, 80);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Apex Test Coverage", margin, y);
    y += 4;
    const lowCount = data.coverage.classes?.filter(c => c.percent < 80).length ?? 0;
    autoTable(doc, {
      startY: y + 4,
      body: [
        ["Org-wide coverage",       data.coverage.orgWidePercent != null ? `${data.coverage.orgWidePercent}%` : "n/a"],
        ["Total classes/triggers",   String(data.coverage.classes?.length ?? 0)],
        ["Below 80% threshold",      String(lowCount)],
      ],
      theme: "plain",
      styles: { fontSize: 10, cellPadding: 4 },
      margin: { left: margin, right: margin },
    });
    y = doc.lastAutoTable.finalY + 14;
  }

  // Cloud Skills (future-proof — only renders when present)
  if (Array.isArray(data.clouds) && data.clouds.length > 0) {
    y = ensureSpace(doc, y, 90);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Cloud Skills", margin, y);
    autoTable(doc, {
      startY: y + 4,
      head: [["Cloud", "Score", "Scored Checks"]],
      body: data.clouds.map(c => [
        c.label,
        c.score != null ? `${c.score}` : "Detection only",
        String(c.scoredChecks ?? 0),
      ]),
      theme: "grid",
      headStyles: { fillColor: [33, 37, 41], textColor: 255 },
      styles: { fontSize: 10, cellPadding: 5 },
      margin: { left: margin, right: margin },
    });
    y = doc.lastAutoTable.finalY + 14;
  }

  // ── 2. Checks Performed ─────────────────────────────────────────────────
  doc.addPage();
  y = sectionHeader(doc, "2. Checks Performed", 60);

  // Map findings by category id (core) and cloud id (cloud-skills) for
  // outcome lookup. Cloud findings live on data.clouds[]; core findings on
  // data.categories[].
  const findingsByCategory = {};
  for (const cat of data.categories) findingsByCategory[cat.id] = cat.findings;
  const findingsByCloud = {};
  for (const c of data.clouds || []) findingsByCloud[c.id] = c.findings;
  const detectedCloudIds = new Set((data.clouds || []).map(c => c.id));

  function lookupOutcome(group, matchTitle) {
    const list = group.scope === "core"
      ? (findingsByCategory[group.category] || [])
      : (findingsByCloud[group.category] || []);
    const found = list.find(f => f.title.includes(matchTitle));
    if (!found) return "Pass";
    return found.severity.charAt(0).toUpperCase() + found.severity.slice(1);
  }

  for (const group of checkCatalog) {
    const { category, checks, scope } = group;
    // Skip cloud-scoped groups for clouds the org doesn't have.
    if (scope && scope !== "core" && !detectedCloudIds.has(category)) continue;
    const meta = categoryMeta[category] || { label: group.label || category };
    y = ensureSpace(doc, y, 80);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(meta.label, margin, y);
    autoTable(doc, {
      startY: y + 4,
      head: [["Check", "Source", "What it Looks For", "Outcome"]],
      body: checks.map(c => [c.name, c.metadata, c.what, lookupOutcome(group, c.matchTitle)]),
      theme: "grid",
      headStyles: { fillColor: [33, 37, 41], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 5, valign: "top" },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 95 },
        2: { cellWidth: 160 },
        3: { cellWidth: 45 },
      },
      margin: { left: margin, right: margin },
    });
    y = doc.lastAutoTable.finalY + 14;
  }

  // ── 3. Findings ─────────────────────────────────────────────────────────
  doc.addPage();
  y = sectionHeader(doc, "3. Findings", 60);

  for (const cat of data.categories) {
    if (!cat.findings.length) continue;
    y = ensureSpace(doc, y, 60);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`${cat.label} — Score ${cat.score}/100`, margin, y);
    y += 4;

    autoTable(doc, {
      startY: y + 4,
      head: [["Severity", "Title", "Description"]],
      body: cat.findings.map(f => [f.severity.toUpperCase(), f.title, f.description]),
      didParseCell: (hookData) => {
        if (hookData.section === "body" && hookData.column.index === 0) {
          const sev = hookData.cell.raw?.toLowerCase?.();
          const color = SEVERITY_COLOR[sev];
          if (color) {
            hookData.cell.styles.fillColor = color;
            hookData.cell.styles.textColor = 255;
            hookData.cell.styles.fontStyle = "bold";
          }
        }
      },
      theme: "grid",
      headStyles: { fillColor: [33, 37, 41], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 5, valign: "top" },
      columnStyles: {
        0: { cellWidth: 55 },
        1: { cellWidth: 145 },
        2: { cellWidth: 200 },
      },
      margin: { left: margin, right: margin },
    });
    y = doc.lastAutoTable.finalY + 14;

    // Per-finding action + components paragraph block
    for (const f of cat.findings) {
      y = ensureSpace(doc, y, 60);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...(SEVERITY_COLOR[f.severity] || [0, 0, 0]));
      doc.text(`[${f.severity.toUpperCase()}] ${f.title}`, margin, y);
      doc.setTextColor(0, 0, 0);
      y += 14;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Recommended action:", margin, y);
      y += 12;
      doc.setFont("helvetica", "normal");
      const actionLines = doc.splitTextToSize(f.action || "—", pageW - margin * 2);
      doc.text(actionLines, margin, y);
      y += actionLines.length * 11 + 4;

      if (f.components?.length) {
        doc.setFont("helvetica", "bold");
        doc.text(`Components (${f.components.length}):`, margin, y);
        y += 12;
        doc.setFont("helvetica", "normal");
        const compText = f.components.join(", ");
        const compLines = doc.splitTextToSize(compText, pageW - margin * 2);
        // Cap component listing per finding to avoid runaway pages
        const shown = compLines.slice(0, 8);
        doc.text(shown, margin, y);
        y += shown.length * 11;
        if (compLines.length > shown.length) {
          doc.setTextColor(120, 120, 120);
          doc.text(`… and ${f.components.length - shown.length * 8} more (full list in dashboard)`, margin, y);
          doc.setTextColor(0, 0, 0);
          y += 12;
        }
      }
      y += 8;
      y = ensureSpace(doc, y, 40);
    }
  }

  // ── 4. Action Plan ──────────────────────────────────────────────────────
  doc.addPage();
  y = sectionHeader(doc, "4. Action Plan", 60);

  if (!data.actionItems?.length) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    doc.text("No critical or warning action items found.", margin, y);
  } else {
    autoTable(doc, {
      startY: y,
      head: [["#", "Title", "Impact", "Effort", "Deadline", "Components"]],
      body: data.actionItems.map(item => [
        item.priority,
        item.title,
        item.impact,
        item.effort,
        item.deadline,
        item.components?.length ? `${item.components.length}` : "—",
      ]),
      theme: "grid",
      headStyles: { fillColor: [33, 37, 41], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 5, valign: "top" },
      columnStyles: {
        0: { cellWidth: 24, halign: "center" },
        1: { cellWidth: 160 },
        2: { cellWidth: 55 },
        3: { cellWidth: 45 },
        4: { cellWidth: 65 },
        5: { cellWidth: 55, halign: "center" },
      },
      margin: { left: margin, right: margin },
    });
    y = doc.lastAutoTable.finalY + 18;

    // Per-item recommended action detail (mirrors the expanded UI row)
    for (const item of data.actionItems) {
      y = ensureSpace(doc, y, 60);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`#${item.priority} — ${item.title}`, margin, y);
      y += 14;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const actionLines = doc.splitTextToSize(item.action || "—", pageW - margin * 2);
      doc.text(actionLines, margin, y);
      y += actionLines.length * 11 + 12;
    }
  }

  // ── Footer page numbers ─────────────────────────────────────────────────
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Page ${i} of ${total}`, pageW - margin, doc.internal.pageSize.getHeight() - 20, { align: "right" });
    doc.text(`${data.org.name || data.org.alias}`, margin, doc.internal.pageSize.getHeight() - 20);
  }

  doc.save(buildFilename(data.org.alias));
}

// PDF export for a history run record. Generates: Overview (scores + storage +
// coverage), Findings (action items grouped by impact), Action Plan (full table).
export function exportHistoryPdf(run) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;

  const CATEGORY_META = {
    security:   { label: "Security & Access",         weight: "30%" },
    automation: { label: "Automation & Flows",        weight: "25%" },
    apex:       { label: "Apex & Governor Limits",    weight: "20%" },
    datamodel:  { label: "Data Model & Architecture", weight: "15%" },
    deployment: { label: "Metadata & Deployment",     weight: "10%" },
  };

  // ── Cover ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Salesforce Org Health Report (Historical)", margin, 70);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(80, 80, 80);
  doc.text(run.org?.name || run.org?.alias || "Unknown Org", margin, 92);
  const orgMeta = [
    `Org ID: ${run.org?.id || "—"}`,
    `Edition: ${run.org?.edition || "—"}`,
    `API: ${run.org?.apiVersion || "—"}`,
    run.org?.isSandbox ? "SANDBOX" : "PRODUCTION",
  ].join("   ·   ");
  doc.text(orgMeta, margin, 108);
  doc.text(`Scan date: ${new Date(run.timestamp).toLocaleString()}`, margin, 124);
  doc.text(`Report generated: ${new Date().toLocaleString()}`, margin, 140);
  doc.setTextColor(0, 0, 0);

  // Score banner
  const scoreY = 168;
  doc.setFillColor(245, 245, 247);
  doc.rect(margin, scoreY, pageW - margin * 2, 70, "F");
  doc.setFontSize(36);
  doc.setFont("helvetica", "bold");
  doc.text(String(run.score ?? "—"), margin + 24, scoreY + 50);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Overall Score (out of 100)", margin + 90, scoreY + 30);
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(
    `Critical: ${run.findingCounts?.critical ?? 0}    Warning: ${run.findingCounts?.warning ?? 0}    Info: ${run.findingCounts?.info ?? 0}`,
    margin + 90, scoreY + 50
  );
  doc.setTextColor(0, 0, 0);

  // ── 1. Overview ──
  let y = sectionHeader(doc, "1. Overview", 270);

  // Category scores
  if (run.categoryScores) {
    autoTable(doc, {
      startY: y,
      head: [["Category", "Weight", "Score"]],
      body: Object.entries(run.categoryScores).map(([id, score]) => {
        const meta = CATEGORY_META[id] || { label: id, weight: "—" };
        return [meta.label, meta.weight, `${score} / 100`];
      }),
      theme: "grid",
      headStyles: { fillColor: [33, 37, 41], textColor: 255 },
      styles: { fontSize: 10, cellPadding: 6 },
      margin: { left: margin, right: margin },
    });
    y = doc.lastAutoTable.finalY + 14;
  }

  // Storage
  if (run.storage) {
    y = ensureSpace(doc, y, 90);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Storage", margin, y);
    y += 6;
    const storageRows = [];
    if (run.storage.dataStorage)      storageRows.push(["Data",      fmtMB(run.storage.dataStorage.used),      fmtMB(run.storage.dataStorage.max),      `${Math.round((run.storage.dataStorage.used / run.storage.dataStorage.max) * 100)}%`]);
    if (run.storage.fileStorage)      storageRows.push(["File",      fmtMB(run.storage.fileStorage.used),      fmtMB(run.storage.fileStorage.max),      `${Math.round((run.storage.fileStorage.used / run.storage.fileStorage.max) * 100)}%`]);
    if (run.storage.bigObjectStorage) storageRows.push(["Big Object", fmtMB(run.storage.bigObjectStorage.used), fmtMB(run.storage.bigObjectStorage.max), `${Math.round((run.storage.bigObjectStorage.used / run.storage.bigObjectStorage.max) * 100)}%`]);
    if (storageRows.length) {
      autoTable(doc, {
        startY: y,
        head: [["Type", "Used", "Max", "%"]],
        body: storageRows,
        theme: "striped",
        styles: { fontSize: 10, cellPadding: 5 },
        margin: { left: margin, right: margin },
      });
      y = doc.lastAutoTable.finalY + 14;
    }
  }

  // Coverage
  if (run.coverage) {
    y = ensureSpace(doc, y, 80);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Apex Test Coverage", margin, y);
    autoTable(doc, {
      startY: y + 4,
      body: [
        ["Org-wide coverage",      run.coverage.orgWidePercent != null ? `${run.coverage.orgWidePercent}%` : "n/a"],
        ["Total classes/triggers", String(run.coverage.classCount ?? 0)],
        ["Below 80% threshold",    String(run.coverage.lowCoverageCount ?? 0)],
      ],
      theme: "plain",
      styles: { fontSize: 10, cellPadding: 4 },
      margin: { left: margin, right: margin },
    });
    y = doc.lastAutoTable.finalY + 14;
  }

  // Cloud scores
  if (run.cloudScores && Object.keys(run.cloudScores).length > 0) {
    y = ensureSpace(doc, y, 80);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Cloud Skills", margin, y);
    autoTable(doc, {
      startY: y + 4,
      head: [["Cloud", "Score"]],
      body: Object.entries(run.cloudScores).map(([id, score]) => [id, score != null ? `${score}` : "Detection only"]),
      theme: "grid",
      headStyles: { fillColor: [33, 37, 41], textColor: 255 },
      styles: { fontSize: 10, cellPadding: 5 },
      margin: { left: margin, right: margin },
    });
    y = doc.lastAutoTable.finalY + 14;
  }

  // ── 2. Findings ──
  doc.addPage();
  y = sectionHeader(doc, "2. Findings", 60);

  const actionItems = run.actionItems || [];
  if (!actionItems.length) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    doc.text("No critical or warning findings recorded for this scan.", margin, y);
  } else {
    for (const item of actionItems) {
      y = ensureSpace(doc, y, 60);
      const sev = item.impact === "Critical" ? "critical" : "warning";
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...(SEVERITY_COLOR[sev] || [0, 0, 0]));
      doc.text(`[${item.impact.toUpperCase()}] ${item.title}`, margin, y);
      doc.setTextColor(0, 0, 0);
      y += 14;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Recommended action:", margin, y);
      y += 12;
      doc.setFont("helvetica", "normal");
      const actionLines = doc.splitTextToSize(item.action || "—", pageW - margin * 2);
      doc.text(actionLines, margin, y);
      y += actionLines.length * 11 + 4;
      if (item.components?.length) {
        const compText = item.components.join(", ");
        const compLines = doc.splitTextToSize(`Components: ${compText}`, pageW - margin * 2);
        const shown = compLines.slice(0, 6);
        doc.setTextColor(80, 80, 80);
        doc.text(shown, margin, y);
        doc.setTextColor(0, 0, 0);
        y += shown.length * 11;
      }
      y += 10;
      y = ensureSpace(doc, y, 40);
    }
  }

  // ── 3. Action Plan ──
  doc.addPage();
  y = sectionHeader(doc, "3. Action Plan", 60);

  if (!actionItems.length) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    doc.text("No action items recorded for this scan.", margin, y);
  } else {
    autoTable(doc, {
      startY: y,
      head: [["#", "Title", "Impact", "Effort", "Deadline", "Components"]],
      body: actionItems.map(item => [
        item.priority,
        item.title,
        item.impact,
        item.effort,
        item.deadline,
        item.components?.length ? `${item.components.length}` : "—",
      ]),
      theme: "grid",
      headStyles: { fillColor: [33, 37, 41], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 5, valign: "top" },
      columnStyles: {
        0: { cellWidth: 24, halign: "center" },
        1: { cellWidth: 160 },
        2: { cellWidth: 55 },
        3: { cellWidth: 45 },
        4: { cellWidth: 65 },
        5: { cellWidth: 55, halign: "center" },
      },
      margin: { left: margin, right: margin },
    });
  }

  // ── Footer page numbers ──
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Page ${i} of ${total}`, pageW - margin, doc.internal.pageSize.getHeight() - 20, { align: "right" });
    doc.text(run.org?.name || run.org?.alias || "", margin, doc.internal.pageSize.getHeight() - 20);
  }

  doc.save(buildFilename(run.org?.alias || "history"));
}
