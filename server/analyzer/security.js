const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");

const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: true });

function readXml(filePath) {
  try { return parser.parse(fs.readFileSync(filePath, "utf8")); }
  catch { return null; }
}

function globFiles(dir, ext) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(ext)) results.push(full);
    }
  }
  walk(dir);
  return results;
}

module.exports = async function checkSecurity(metaDir, ctx = {}) {
  const findings = [];

  // ── Profiles ─────────────────────────────────────────────────────────────
  const profileDir = path.join(metaDir, "force-app", "main", "default", "profiles");
  const profileFiles = globFiles(profileDir, ".profile-meta.xml");

  const broadPermProfiles = [];

  for (const f of profileFiles) {
    const doc = readXml(f);
    if (!doc) continue;
    const profile = doc.Profile || {};
    const name = path.basename(f, ".profile-meta.xml");
    const perms = [].concat(profile.userPermissions || []);
    const broadPerms = ["ModifyAllData", "ViewAllData", "ManageUsers"];
    if (perms.some(p => broadPerms.includes(p.name) && p.enabled === true))
      broadPermProfiles.push(name);
  }

  // ── System Administrator user count ─────────────────────────────────────
  // Every org has the standard System Administrator profile, so checking for
  // its existence is meaningless. The real risk is too many active users
  // assigned to it. >5 is the conventional threshold for a healthy org.
  const sysAdminUsers = ctx.sysAdminUsers;
  if (sysAdminUsers && typeof sysAdminUsers.count === "number" && sysAdminUsers.count > 5) {
    findings.push({
      severity: "critical",
      title: `${sysAdminUsers.count} Active Users Have System Administrator Profile`,
      description: `${sysAdminUsers.count} active users are assigned the System Administrator profile (threshold: 5). Each admin is a high-impact attack surface — credential compromise grants full org access.`,
      action: "Audit each admin assignment. Move users to least-privilege custom profiles + permission sets, and reserve System Administrator for break-glass accounts only.",
      components: [],
    });
  }

  // ── Login-history anomalies + dormant accounts ──────────────────────────
  // Sourced from the User + LoginHistory SOQL (last 30 days). LoginHistory
  // has 180-day platform retention; we keep the window short for signal.
  const userSignals = ctx.userSignals;
  if (userSignals) {
    if (userSignals.multiCountryLogins.length > 0) {
      const labelled = userSignals.multiCountryLogins.map(u => `${u.username} (${u.countries.join(", ")})`);
      findings.push({
        severity: "critical",
        title: `${userSignals.multiCountryLogins.length} User(s) Logged In From 3+ Countries in 30 Days`,
        description: "Multi-country login pattern is a credible indicator of credential sharing or compromise. Two countries can be VPN/travel; three is the suspicion threshold.",
        action: "Investigate each user's recent login history. Enforce MFA, restrict IP ranges via Login IP Ranges on the profile, and rotate credentials if compromise is suspected.",
        components: labelled,
      });
    }

    if (userSignals.apiOnlyBrowserLogins.length > 0) {
      const labelled = userSignals.apiOnlyBrowserLogins.map(u => `${u.username} (${u.profile})`);
      findings.push({
        severity: "critical",
        title: `${userSignals.apiOnlyBrowserLogins.length} API-Only User(s) Recorded an Interactive UI Login`,
        description: "Users on integration / API-only profiles should never log in through the browser. An interactive login (LoginType = Application) suggests the account has been repurposed by a human or its credentials are being misused.",
        action: "Revoke the user's password, reset its security token, and apply Login IP Range restrictions or the 'API Only User' permission to enforce non-interactive access.",
        components: labelled,
      });
    }

    if (userSignals.staleActiveUsers.length > 0) {
      const labelled = userSignals.staleActiveUsers.map(u => `${u.username} (${u.daysSinceLogin}d, ${u.profile})`);
      findings.push({
        severity: "warning",
        title: `${userSignals.staleActiveUsers.length} Active User(s) Not Logged In for 90+ Days`,
        description: `${userSignals.staleActiveUsers.length} of ${userSignals.activeStandardUserCount} active Standard users haven't logged in for at least 90 days. They consume licences and remain a credential-attack surface.`,
        action: "Deactivate users who no longer need access, or freeze them pending review. Reclaim licences for new joiners.",
        components: labelled,
      });
    }

    if (userSignals.neverLoggedInUsers.length > 0) {
      const labelled = userSignals.neverLoggedInUsers.map(u => `${u.username} (${u.profile})`);
      findings.push({
        severity: "warning",
        title: `${userSignals.neverLoggedInUsers.length} Active User(s) Have Never Logged In`,
        description: `${userSignals.neverLoggedInUsers.length} active Standard user(s) were provisioned more than 30 days ago but have no LastLoginDate. The licence is allocated but the seat is unused.`,
        action: "Confirm with the requester whether the account is still needed. Deactivate to reclaim the licence if not.",
        components: labelled,
      });
    }
  }

  if (broadPermProfiles.length > 2) {
    findings.push({
      severity: "warning",
      title: `${broadPermProfiles.length} Profiles Have Broad Data Permissions`,
      description: `Profiles with ModifyAllData, ViewAllData, or ManageUsers found. These bypass record-level sharing.`,
      action: "Restrict broad permissions to only system integration profiles. Use permission sets for exceptions.",
      components: broadPermProfiles,
    });
  }

  // ── Permission Sets ───────────────────────────────────────────────────────
  const psDir = path.join(metaDir, "force-app", "main", "default", "permissionsets");
  const psFiles = globFiles(psDir, ".permissionset-meta.xml");

  const psWithModifyAll = [];
  for (const f of psFiles) {
    const doc = readXml(f);
    if (!doc) continue;
    const ps = doc.PermissionSet || {};
    const name = path.basename(f, ".permissionset-meta.xml");
    const perms = [].concat(ps.userPermissions || []);
    if (perms.some(p => p.name === "ModifyAllData" && p.enabled === true))
      psWithModifyAll.push(name);
  }

  if (psWithModifyAll.length > 0) {
    findings.push({
      severity: "warning",
      title: `${psWithModifyAll.length} Permission Set(s) Grant ModifyAllData`,
      description: "ModifyAllData in a permission set bypasses all record sharing rules.",
      action: "Remove ModifyAllData from permission sets unless strictly required for integration users.",
      components: psWithModifyAll,
    });
  }

  if (profileFiles.length === 0 && psFiles.length === 0) {
    findings.push({
      severity: "info",
      title: "No Profiles or Permission Sets Retrieved",
      description: "Profile/PermissionSet metadata was not included in the retrieve. Security analysis is limited.",
      action: "Re-run with Profile and PermissionSet metadata types explicitly included.",
      components: [],
    });
  }

  // ── Connected Apps ────────────────────────────────────────────────────────
  const caDir = path.join(metaDir, "force-app", "main", "default", "connectedApps");
  const caFiles = globFiles(caDir, ".connectedApp-meta.xml");
  const fullAccessApps = [];
  const allAppNames = [];

  for (const f of caFiles) {
    const doc = readXml(f);
    if (!doc) continue;
    const name = path.basename(f, ".connectedApp-meta.xml");
    allAppNames.push(name);
    const scopes = [].concat(doc.ConnectedApp?.oauthConfig?.scopes || []);
    if (scopes.includes("Full")) fullAccessApps.push(name);
  }

  if (fullAccessApps.length > 0) {
    findings.push({
      severity: "warning",
      title: `${fullAccessApps.length} Connected App(s) Use Full OAuth Scope`,
      description: "Full OAuth scope grants the app the same access as the authorising user.",
      action: "Limit OAuth scopes to only the permissions each Connected App requires.",
      components: fullAccessApps,
    });
  } else if (caFiles.length > 0) {
    findings.push({
      severity: "info",
      title: `${caFiles.length} Connected App(s) Found — Scopes Look Scoped`,
      description: "No Connected Apps with Full scope detected.",
      action: "Periodically audit Connected App usage and revoke unused authorisations.",
      components: allAppNames,
    });
  }

  // ── Permission Sets — extended checks ────────────────────────────────────
  // Re-parse all PS files for ViewAllData (critical), additional sensitive
  // permissions (warning), and overlap analysis (warning).
  // The ModifyAllData pass above already built psFiles; reuse it.

  const psData = []; // { name, fingerprint: Set, perms: string[] }
  const psWithViewAll = [];
  const sensitivePermMap = {
    ManageUsers: [],
    AuthorApex: [],
    ResetPasswords: [],
    ModifyMetadata: [],
    InstallPackaging: [],
    ManageIPAddresses: [],
  };

  for (const f of psFiles) {
    const doc = readXml(f);
    if (!doc) continue;
    const ps = doc.PermissionSet || {};
    const name = path.basename(f, ".permissionset-meta.xml");
    const perms = [].concat(ps.userPermissions || []);

    // Check A — ViewAllData
    if (perms.some(p => p.name === "ViewAllData" && p.enabled === true))
      psWithViewAll.push(name);

    // Check B — other sensitive permissions
    for (const permName of Object.keys(sensitivePermMap)) {
      if (perms.some(p => p.name === permName && p.enabled === true))
        sensitivePermMap[permName].push(name);
    }

    // Check C — build fingerprint for overlap analysis
    const fp = new Set();
    for (const p of perms) {
      if (p.enabled === true) fp.add(`up:${p.name}`);
    }
    for (const o of [].concat(ps.objectPermissions || [])) {
      if (o.allowCreate || o.allowRead || o.allowEdit || o.allowDelete || o.viewAllRecords || o.modifyAllRecords)
        fp.add(`obj:${o.object}`);
    }
    for (const fld of [].concat(ps.fieldPermissions || [])) {
      if (fld.readable || fld.editable) fp.add(`field:${fld.field}`);
    }
    for (const cls of [].concat(ps.classAccesses || [])) {
      if (cls.enabled === true) fp.add(`cls:${cls.apexClass}`);
    }
    psData.push({ name, fingerprint: fp });
  }

  // Check A finding
  if (psWithViewAll.length > 0) {
    findings.push({
      severity: "critical",
      title: `${psWithViewAll.length} Permission Set(s) Grant ViewAllData`,
      description: "ViewAllData grants read access to every record in the org regardless of sharing rules, exposing sensitive data across all objects.",
      action: "Remove ViewAllData from permission sets. Grant targeted object- or record-level access instead.",
      components: psWithViewAll,
    });
  }

  // Check B findings — one warning per sensitive permission that has hits
  for (const [permName, affected] of Object.entries(sensitivePermMap)) {
    if (affected.length === 0) continue;
    findings.push({
      severity: "warning",
      title: `${affected.length} Permission Set(s) Grant ${permName}`,
      description: `${permName} is a high-privilege system permission. Granting it via a permission set widens its blast radius beyond the profiles that originally required it.`,
      action: `Audit each permission set listed. Remove ${permName} unless it is strictly required, and document the business justification.`,
      components: affected,
    });
  }

  // Check C — overlapping permission sets (Jaccard similarity > 60%)
  const overlapPairs = [];
  const eligible = psData.filter(p => p.fingerprint.size >= 5);
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const a = eligible[i].fingerprint;
      const b = eligible[j].fingerprint;
      let intersection = 0;
      for (const token of a) { if (b.has(token)) intersection++; }
      const union = a.size + b.size - intersection;
      const ratio = union > 0 ? intersection / union : 0;
      if (ratio > 0.6) {
        overlapPairs.push(`${eligible[i].name} ↔ ${eligible[j].name} (${Math.round(ratio * 100)}%)`);
      }
    }
  }
  if (overlapPairs.length > 0) {
    findings.push({
      severity: "warning",
      title: `${overlapPairs.length} Permission Set Pair(s) Have >60% Permission Overlap`,
      description: "Highly overlapping permission sets create duplicate maintenance burden and make it harder to reason about what any individual set grants. The overlap is measured across user permissions, object permissions, field permissions, and Apex class accesses.",
      action: "Consolidate overlapping permission sets into a single canonical set, or extract shared permissions into a base set and reference it from a Permission Set Group.",
      components: overlapPairs,
    });
  }

  // ── Permission Set Groups ─────────────────────────────────────────────────
  // Check D — structural quality: single-member PSGs (info) and PSes that
  // appear in 3+ groups (warning).
  const psgDir = path.join(metaDir, "force-app", "main", "default", "permissionsetgroups");
  const psgFiles = globFiles(psgDir, ".permissionsetgroup-meta.xml");

  const thinPsgs = [];            // PSGs with 0 or 1 constituent PS
  const psGroupMembership = {};   // psName → [psgNames]

  for (const f of psgFiles) {
    const doc = readXml(f);
    if (!doc) continue;
    const psg = doc.PermissionSetGroup || {};
    const psgName = path.basename(f, ".permissionsetgroup-meta.xml");
    const members = [].concat(psg.permissionSets || []).map(m =>
      typeof m === "string" ? m : (m.permissionSet || String(m))
    );

    if (members.length <= 1) thinPsgs.push(psgName);

    for (const ps of members) {
      if (!psGroupMembership[ps]) psGroupMembership[ps] = [];
      psGroupMembership[ps].push(psgName);
    }
  }

  if (thinPsgs.length > 0) {
    findings.push({
      severity: "info",
      title: `${thinPsgs.length} Permission Set Group(s) Have 0 or 1 Member`,
      description: "A Permission Set Group with zero or one constituent permission set adds indirection without consolidation benefit.",
      action: "Either add more permission sets to make the group meaningful, or assign the permission set directly and remove the group.",
      components: thinPsgs,
    });
  }

  const overusedPs = Object.entries(psGroupMembership)
    .filter(([, groups]) => groups.length >= 3)
    .map(([ps, groups]) => `${ps} (in ${groups.length} groups: ${groups.join(", ")})`);

  if (overusedPs.length > 0) {
    findings.push({
      severity: "warning",
      title: `${overusedPs.length} Permission Set(s) Are Members of 3+ Permission Set Groups`,
      description: "A permission set referenced by many groups means any change to it propagates unpredictably across all those groups and their assigned users.",
      action: "Refactor so that widely-shared permissions live in a dedicated base permission set with a clear owner, and limit its membership to groups where it is truly required.",
      components: overusedPs,
    });
  }

  const score = Math.max(0,
    100
    - findings.filter(f => f.severity === "critical").length * 20
    - findings.filter(f => f.severity === "warning").length * 10
  );
  return { score: Math.min(100, score), findings };
};
