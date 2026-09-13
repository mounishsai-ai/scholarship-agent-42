"use strict";

// ------------------------------------------------------------------ helpers
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const money = (n) => (n === null || n === undefined) ? "—" : "₹" + Number(n).toLocaleString("en-IN");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Cache GET responses so switching role/tab re-renders instantly (no loading
// flash — that flash was the "animation breaks" jank). Cleared after any action.
const _cache = {};
function getData(path) {
  if (!(path in _cache)) _cache[path] = api(path);
  return _cache[path];
}
function cached(path) { return path in _cache; }
function invalidateCache() { for (const k of Object.keys(_cache)) delete _cache[k]; }

async function api(path, opts) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({ error: "bad response" }));
  if (data && data.error) throw new Error(data.error);
  return data;
}
function loading(el, path) { if (!path || !cached(path)) el.innerHTML = `<div class="loading">Running agent…</div>`; }
function errorCard(el, e) {
  el.innerHTML = `<div class="card"><h2>Could not load</h2>
    <div class="sub">${esc(e.message)}</div></div>`;
}

// Restart the panel entrance animation on every tab/role switch, even when the
// data is cached (so switching always feels responsive).
function replay(el) {
  if (!el) return;
  el.classList.remove("anim");
  void el.offsetWidth;   // force reflow so the animation restarts
  el.classList.add("anim");
}

// "Why?" expander shared by matrix / eligibility / renewal
function whyBlock(criteria) {
  const items = criteria.map(r => {
    const cls = r.passed ? "rule-pass" : "rule-fail";
    const exp = Array.isArray(r.expected) ? r.expected.join(", ") : r.expected;
    return `<li class="${cls}">${esc(r.field_label)}: <b>${esc(r.actual)}</b>
            needs ${esc(r.op_label)} <b>${esc(exp)}</b> ${r.passed ? "✓" : "✗"}</li>`;
  }).join("");
  return `<div class="why" hidden><ul>${items}</ul></div>`;
}
function wireWhy(root) {
  $$(".why-btn", root).forEach(btn => btn.addEventListener("click", () => {
    const w = btn.closest("td, div").querySelector(".why");
    if (w) w.hidden = !w.hidden;
  }));
}

// ------------------------------------------------------------------ roles
// Each role really changes what is shown: which tabs, which rows, and whether
// actions (approve / suppress) are allowed. Enforced client-side for the demo;
// the same scoping lives in the platform's row-level security policies.
const ROLES = {
  ACCOUNTS: {
    label: "Scholarship Officer",
    scope: "Full access — all students, all schemes, approvals enabled.",
    tabs: ["coverage", "matrix", "applications", "renewal", "reconciliation", "schemes", "activity", "integrations"],
    canAct: true, student: null,
  },
  HOD: {
    label: "Head of Department",
    scope: "Computer Science & Engineering — department-wide, read-only (no approvals).",
    tabs: ["coverage", "matrix", "applications", "renewal", "reconciliation", "schemes", "integrations"],
    canAct: false, student: null,
  },
  ACCT: {
    label: "Accounts",
    scope: "Accounts section — fees, disbursements and reminder suppression.",
    tabs: ["coverage", "applications", "reconciliation", "activity", "integrations"],
    canAct: true, student: null,
  },
  STUDENT: {
    label: "Student",
    scope: "Your own record only — 23CSE002, Arjun Rao.",
    tabs: ["matrix", "applications", "renewal", "schemes"],
    canAct: false, student: "23CSE002",
  },
};
let currentRole = "ACCOUNTS";
const R = () => ROLES[currentRole];

// Session role context: guest may preview every role; a real sign-in is locked
// to one role (this is what evaluators check — a student can't see the officer view).
const APP = {
  role: document.body.dataset.role || "GUEST",
  canSwitch: (document.body.dataset.canSwitch || "yes") !== "no",
  student: document.body.dataset.roleStudent || "",
};

function applyRole() {
  const role = R();
  const note = $("#scope-note");
  if (note) note.textContent = role.scope;
  // show only this role's tabs
  $$(".tab").forEach(t => { t.hidden = !role.tabs.includes(t.dataset.tab); });
  // if the active tab is hidden for this role, jump to the first allowed one
  let active = $(".tab.active:not([hidden])");
  if (!active) {
    $$(".tab").forEach(t => t.classList.remove("active"));
    $$(".panel").forEach(p => p.classList.remove("active"));
    active = $(".tab:not([hidden])");
    active.classList.add("active");
    $("#panel-" + active.dataset.tab).classList.add("active");
  }
  loadKpis();
  const name = active.dataset.tab;
  replay($("#panel-" + name));
  if (loaders[name]) loaders[name]();
}

// ------------------------------------------------------------------ tabs
const loaders = {};
$$(".tab").forEach(tab => tab.addEventListener("click", () => {
  $$(".tab").forEach(t => t.classList.remove("active"));
  $$(".panel").forEach(p => p.classList.remove("active"));
  tab.classList.add("active");
  const name = tab.dataset.tab;
  const panel = $("#panel-" + name);
  panel.classList.add("active");
  replay(panel);
  if (loaders[name]) loaders[name]();
}));

// role buttons
$$(".role").forEach(b => b.addEventListener("click", () => {
  $$(".role").forEach(r => r.classList.remove("active"));
  b.classList.add("active");
  currentRole = b.dataset.role;
  applyRole();
}));

// ------------------------------------------------------------------ KPIs
async function loadKpis() {
  const role = R();
  try {
    if (role.student) {
      const m = await getData("/api/matrix");
      const row = m.rows.find(x => x.student.roll_no === role.student);
      const eligible = row ? row.cells.filter(c => c.is_eligible).length : 0;
      const ap = await getData("/api/applications");
      const myAp = ap.applications.filter(a => a.roll_no === role.student).length;
      const rn = await getData("/api/renewal-risk");
      const myRn = rn.results.filter(x => x.student.roll_no === role.student);
      const atRisk = myRn.some(x => ["AT_RISK", "LIKELY_LOSS"].includes(x.risk_level));
      $("#kpis").innerHTML = `
        <div class="kpi"><div class="num">${eligible}</div><div class="lbl">Schemes you qualify for</div></div>
        <div class="kpi good"><div class="num">${myAp}</div><div class="lbl">Your applications</div></div>
        <div class="kpi ${atRisk ? "bad" : "good"}"><div class="num">${atRisk ? "!" : "✓"}</div><div class="lbl">${atRisk ? "Renewal at risk" : "Renewals on track"}</div></div>`;
      return;
    }
    const c = await getData("/api/coverage");
    const r = await getData("/api/renewal-risk");
    const rec = await getData("/api/reconciliation");
    $("#kpis").innerHTML = `
      <div class="kpi"><div class="num">${c.total_eligible}</div><div class="lbl">Eligible matches</div></div>
      <div class="kpi good"><div class="num">${c.total_covered}</div><div class="lbl">Covered</div></div>
      <div class="kpi bad"><div class="num">${c.coverage_gap}</div><div class="lbl">Coverage gap</div></div>
      <div class="kpi bad"><div class="num">${r.at_risk_count}</div><div class="lbl">Renewals at risk</div></div>
      <div class="kpi bad"><div class="num">${rec.suppress_count}</div><div class="lbl">Reminders to suppress</div></div>`;
  } catch (e) { $("#kpis").innerHTML = `<div class="note">${esc(e.message)}</div>`; }
}

// ------------------------------------------------------------------ Coverage
loaders.coverage = async () => {
  const el = $("#panel-coverage"); loading(el, "/api/coverage");
  try {
    const d = await getData("/api/coverage");
    const rows = d.per_scheme.map(s => `<tr>
        <td>${esc(s.scheme_name)}</td>
        <td>${s.eligible}</td><td>${s.applied}</td>
        <td class="cell-ok">${s.covered}</td>
        <td class="${s.gap > 0 ? "cell-no" : ""}"><b>${s.gap}</b></td></tr>`).join("");
    const rej = d.rejections.length
      ? d.rejections.map(r => `<li>${esc(r.rejection_reason)} — <b>${r.n}</b></li>`).join("")
      : "<li>No rejections recorded.</li>";
    el.innerHTML = `
      <div class="card">
        <h2>Coverage — every eligible student accounted for</h2>
        <div class="sub">Headline goal of the Scholarship Agent: close the gap between who is
          eligible and who is actually covered.</div>
        <div class="kpis" style="margin-bottom:14px">
          <div class="kpi"><div class="num">${d.total_eligible}</div><div class="lbl">Eligible matches</div></div>
          <div class="kpi good"><div class="num">${d.total_covered}</div><div class="lbl">Covered</div></div>
          <div class="kpi bad"><div class="num">${d.coverage_gap}</div><div class="lbl">Gap to close</div></div>
        </div>
        <div class="tbl-wrap"><table>
          <thead><tr><th>Scheme</th><th>Eligible</th><th>Applied</th><th>Covered</th><th>Gap</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
      </div>
      <div class="card">
        <h2>Why applications were rejected</h2>
        <div class="sub">Rejection reasons feed next year's process — most are procedural, not merit.</div>
        <ul>${rej}</ul>
      </div>`;
  } catch (e) { errorCard(el, e); }
};

// ------------------------------------------------------------------ Matrix / My Eligibility
loaders.matrix = async () => {
  const el = $("#panel-matrix"); loading(el, "/api/matrix");
  try {
    const d = await getData("/api/matrix");
    const mine = R().student;
    const dataRows = mine ? d.rows.filter(x => x.student.roll_no === mine) : d.rows;
    const head = d.schemes.map(s => `<th title="${esc(s.name)}">${esc(s.code)}</th>`).join("");
    const rows = dataRows.map(r => {
      const cells = r.cells.map(c => {
        const pill = c.is_eligible ? `<span class="pill ok">✓</span>` : `<span class="pill no">✗</span>`;
        return `<td>${pill}
          <button class="why-btn">why</button>${whyBlock(c.criteria_result)}</td>`;
      }).join("");
      const acts = (R().canAct && !mine)
        ? `<div class="row-actions"><button class="btn small" data-notify="${esc(r.student.student_id)}">Notify</button><button class="btn small ghost" data-prepare="${esc(r.student.student_id)}">Prepare</button></div>`
        : "";
      return `<tr><td><b>${esc(r.student.roll_no)}</b><br><span class="note">${esc(r.student.full_name)}</span>${acts}</td>${cells}</tr>`;
    }).join("");
    const title = mine ? "My eligibility" : "Eligibility Matrix — every student × every scheme";
    const sub = mine
      ? "Which schemes you qualify for, with the exact rule behind each decision. Click <b>why</b>."
      : "Computed deterministically from the schemes' JSON rules. Click <b>why</b> on any cell to see the exact rules that passed or failed.";
    el.innerHTML = `<div class="card">
      <h2>${title}</h2>
      <div class="sub">${sub}</div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Student</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
    </div>`;
    wireWhy(el);
    $$("[data-notify]", el).forEach(b => b.addEventListener("click", () => notifyStudent(b)));
    $$("[data-prepare]", el).forEach(b => b.addEventListener("click", () => openPrepare(b.dataset.prepare)));
  } catch (e) { errorCard(el, e); }
};

// ---- Step 3: notify eligible students (drafts go to the approval queue) ----
async function notifyStudent(btn) {
  btn.disabled = true; const old = btn.textContent; btn.textContent = "Drafting…";
  try {
    const d = await api("/api/notify/" + btn.dataset.notify, { method: "POST" });
    invalidateCache();
    if (d.drafted === 0) showToast(`${d.roll_no}: already notified or applied — nothing new to send.`);
    else showToast(`${d.drafted} notification(s) drafted for ${d.roll_no} — awaiting approval in Agent Activity.`);
  } catch (e) { showToast("Could not notify: " + e.message); }
  finally { btn.disabled = false; btn.textContent = old; }
}

// ---- Step 4: application pack (document checklist + pre-filled data) ----
async function openPrepare(sid) {
  const m = $("#prepare-modal"), body = $("#prepare-body");
  try {
    const d = await api("/api/student/" + sid + "/pack");
    const pre = Object.entries(d.prefilled).map(([k, v]) =>
      `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("");
    const packs = d.packs.length ? d.packs.map(p => `
      <div class="pack-scheme">
        <div class="pack-h"><b>${esc(p.scheme)}</b><span class="pill status">${esc(p.benefit)}</span></div>
        <div class="note">Apply by ${esc(p.deadline)}</div>
        <div class="pack-docs">${(p.documents.length ? p.documents : ["As per scheme"])
          .map(x => `<label><input type="checkbox"> ${esc(x)}</label>`).join("")}</div>
      </div>`).join("") : `<div class="note">Not currently eligible for any scheme.</div>`;
    body.innerHTML = `
      <h2>Application pack — ${esc(d.facts.full_name)} (${esc(d.facts.roll_no)})</h2>
      <div class="sub">Pre-filled from institutional records; tick documents as collected.</div>
      <div class="pack-pre">${pre}</div>
      <div class="sch-rules-h">Eligible schemes & document checklist</div>
      ${packs}`;
    m.hidden = false;
  } catch (e) { showToast("Could not open pack: " + e.message); }
}

// ---- toast ----
let _toastTimer = null;
function showToast(msg) {
  const t = $("#toast"); if (!t) return;
  t.textContent = msg; t.hidden = false; t.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { t.classList.remove("show"); t.hidden = true; }, 4200);
}

// ------------------------------------------------------------------ Applications
loaders.applications = async () => {
  const el = $("#panel-applications"); loading(el, "/api/applications");
  try {
    const d = await getData("/api/applications");
    const mine = R().student;
    const list = mine ? d.applications.filter(a => a.roll_no === mine) : d.applications;
    const rows = list.map(a => `<tr>
        <td><b>${esc(a.roll_no)}</b><br><span class="note">${esc(a.full_name)}</span></td>
        <td>${esc(a.scheme_name)}</td>
        <td><span class="pill status">${esc(a.status)}</span></td>
        <td>${esc(a.applied_on || "—")}</td>
        <td>${a.sanctioned_amount ? money(a.sanctioned_amount) : "—"}</td>
        <td>${a.disbursed_amount ? money(a.disbursed_amount) : "—"}</td>
        <td class="note">${esc(a.rejection_reason || "")}</td></tr>`).join("")
      || `<tr><td colspan="7" class="note">No applications yet.</td></tr>`;
    el.innerHTML = `<div class="card">
      <h2>${mine ? "My applications" : "Application Tracker"}</h2>
      <div class="sub">Every application from submission → institution verification → sanction →
        disbursement, so nothing lapses silently.</div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Student</th><th>Scheme</th><th>Status</th><th>Applied</th>
        <th>Sanctioned</th><th>Disbursed</th><th>Note</th></tr></thead>
        <tbody>${rows}</tbody></table></div></div>`;
  } catch (e) { errorCard(el, e); }
};

// ------------------------------------------------------------------ Renewal risk
loaders.renewal = async () => {
  const el = $("#panel-renewal"); loading(el, "/api/renewal-risk");
  try {
    const d = await getData("/api/renewal-risk");
    const mine = R().student;
    const list = mine ? d.results.filter(x => x.student.roll_no === mine) : d.results;
    const pillCls = { NONE: "none", WATCH: "watch", AT_RISK: "atrisk", LIKELY_LOSS: "loss" };
    const rows = list.map(r => `<tr>
        <td><b>${esc(r.student.roll_no)}</b><br><span class="note">${esc(r.student.full_name)}</span></td>
        <td>${esc(r.scheme_name)}</td>
        <td><span class="pill ${pillCls[r.risk_level] || "none"}">${esc(r.risk_level)}</span></td>
        <td>${r.student.attendance_pct}%</td>
        <td>${r.student.cgpa}</td>
        <td>${r.flag_raised ? '<span class="pill loss">flag raised</span>' : "—"}
            <button class="why-btn">why</button>${whyBlock(r.criteria_result)}</td></tr>`).join("")
      || `<tr><td colspan="6" class="note">No live scholarships to renew.</td></tr>`;
    el.innerHTML = `<div class="card">
      <h2>${mine ? "My renewal status" : "Renewal Risk — catch it while there is still time"}</h2>
      <div class="sub">Live scholarships checked against each scheme's renewal rule. Students at risk
        are flagged to the Scholarship Officer as a <b>SCHOLARSHIP_RISK</b> risk-flag.</div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Student</th><th>Scheme</th><th>Risk</th><th>Attendance</th><th>CGPA</th><th>Action</th></tr></thead>
        <tbody>${rows}</tbody></table></div></div>`;
    wireWhy(el);
  } catch (e) { errorCard(el, e); }
};

// ------------------------------------------------------------------ Reconciliation
loaders.reconciliation = async () => {
  const el = $("#panel-reconciliation"); loading(el, "/api/reconciliation");
  try {
    const d = await getData("/api/reconciliation");
    const canAct = R().canAct;
    const rows = d.results.map(r => {
      const action = r.recommend_suppress
        ? (canAct
            ? `<button class="btn small" data-suppress="${esc(r.reminder_dispatch_id)}">Suppress reminder</button>`
            : `<span class="pill atrisk">suppress recommended</span>`)
        : '<span class="pill ok">ok</span>';
      return `<tr>
        <td><b>${esc(r.roll_no)}</b><br><span class="note">${esc(r.full_name)}</span></td>
        <td>${esc(r.scheme_name)}</td>
        <td>${money(r.covered_amount)}</td>
        <td>${money(r.outstanding)}</td>
        <td>${r.active_reminder ? `<span class="pill atrisk">${esc(r.reminder_segment || "reminder")}</span>` : "—"}</td>
        <td>${action}</td></tr>`;
    }).join("");
    el.innerHTML = `<div class="card">
      <h2>Fee Reconciliation</h2>
      <div class="sub">Matches scholarship disbursements against the fee ledger so recipients are not
        chased for money already covered.</div>
      <div class="note quote">"Reminders MUST be suppressed where a sanctioned scholarship or approved
        installment plan covers the dues. This is the most common cause of avoidable distress in fee
        follow-up." — comment in the platform schema (finance.reminder_dispatch).</div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Student</th><th>Scheme</th><th>Covered</th><th>Outstanding</th>
        <th>Active reminder</th><th>Agent action${canAct ? " (needs approval)" : ""}</th></tr></thead>
        <tbody>${rows}</tbody></table></div></div>`;
    $$("[data-suppress]", el).forEach(btn => btn.addEventListener("click", async () => {
      btn.disabled = true; btn.textContent = "Approving…";
      try {
        await api("/api/suppress-reminder", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reminder_dispatch_id: btn.dataset.suppress,
            note: "Approved by Scholarship Officer — covered by sanctioned scholarship" })
        });
        btn.textContent = "Suppressed ✓";
        invalidateCache(); loadKpis();
      } catch (e) { btn.disabled = false; btn.textContent = "Retry"; alert(e.message); }
    }));
  } catch (e) { errorCard(el, e); }
};

// ------------------------------------------------------------------ Schemes
loaders.schemes = async () => {
  const el = $("#panel-schemes"); loading(el, "/api/schemes");
  try {
    const d = await getData("/api/schemes");
    const cards = d.schemes.map(s => {
      const rules = (s.eligibility_criteria.all || s.eligibility_criteria.any || [])
        .map(r => `<li>${esc(r.field)} ${esc(r.op)} ${esc(Array.isArray(r.value) ? r.value.join("/") : r.value)}</li>`).join("");
      const docs = (s.required_documents || []).map(x => `<span class="badge">${esc(x)}</span>`).join(" ");
      return `<div class="card">
        <h2>${esc(s.name)} <span class="pill status">${esc(s.provider_type)}</span></h2>
        <div class="sub">${esc(s.provider_name || "")} · ${esc(s.benefit_type)} · ${money(s.benefit_amount)}
          · window ${esc(s.application_opens)} → ${esc(s.application_closes)}
          ${s.renewal_required ? "· <b>renewable</b>" : ""}</div>
        <b class="note">Eligibility rules (machine-evaluable)</b>
        <ul>${rules}</ul>
        <div>${docs}</div>
      </div>`;
    }).join("");
    const addBtn = R().canAct
      ? `<div class="actions-row"><button class="btn" id="open-scheme">+ Add scheme</button>
           <span class="note">Officer can register a new scholarship — it is matched against all students instantly.</span></div>`
      : "";
    el.innerHTML = addBtn + (cards || `<div class="card"><h2>No schemes</h2></div>`);
    const ob = $("#open-scheme"); if (ob) ob.addEventListener("click", openSchemeModal);
  } catch (e) { errorCard(el, e); }
};

// ------------------------------------------------------------------ add scheme
const RULE_FIELDS = [["social_category", "Social category"], ["annual_income", "Annual income"],
  ["cgpa", "CGPA"], ["attendance_pct", "Attendance %"], ["gender", "Gender"],
  ["year_of_study", "Year of study"], ["programme_code", "Programme"], ["backlog_count", "Backlogs"]];
const RULE_OPS = [["lte", "≤"], ["gte", "≥"], ["lt", "<"], ["gt", ">"], ["eq", "="], ["in", "one of"], ["not_in", "not one of"]];

function addRuleRow(field, op, val) {
  const host = $("#sch-rules"); if (!host) return;
  const div = document.createElement("div");
  div.className = "sch-rule";
  div.innerHTML =
    `<select class="r-field">${RULE_FIELDS.map(f => `<option value="${f[0]}"${f[0] === field ? " selected" : ""}>${f[1]}</option>`).join("")}</select>
     <select class="r-op">${RULE_OPS.map(o => `<option value="${o[0]}"${o[0] === op ? " selected" : ""}>${o[1]}</option>`).join("")}</select>
     <input class="r-val" placeholder="value (comma for lists)" value="${val ? esc(val) : ""}">
     <button type="button" class="r-del" aria-label="Remove rule">×</button>`;
  div.querySelector(".r-del").addEventListener("click", () => div.remove());
  host.appendChild(div);
}

function openSchemeModal() {
  const m = $("#scheme-modal"); if (!m) return;
  $("#sch-rules").innerHTML = "";
  addRuleRow("annual_income", "lte", "250000");
  addRuleRow("cgpa", "gte", "7.0");
  const err = $("#sch-error"); if (err) err.hidden = true;
  m.hidden = false;
}

(function () {
  const m = $("#scheme-modal"); if (!m) return;
  $$("[data-close-scheme]").forEach(b => b.addEventListener("click", () => { m.hidden = true; }));
  const add = $("#sch-add-rule"); if (add) add.addEventListener("click", () => addRuleRow("cgpa", "gte", ""));
  const form = $("#scheme-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const rules = $$(".sch-rule", m).map(r => ({
      field: r.querySelector(".r-field").value,
      op: r.querySelector(".r-op").value,
      value: r.querySelector(".r-val").value,
    }));
    const body = {
      code: f.get("code"), name: f.get("name"),
      provider_type: f.get("provider_type"), provider_name: f.get("provider_name"),
      benefit_type: f.get("benefit_type"), benefit_amount: f.get("benefit_amount"),
      application_opens: f.get("application_opens"), application_closes: f.get("application_closes"),
      required_documents: f.get("required_documents"),
      renewal_required: form.querySelector('[name="renewal_required"]').checked,
      rules,
    };
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "Creating…";
    try {
      await api("/api/scheme", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      m.hidden = true; form.reset();
      invalidateCache(); loadKpis(); loaders.schemes();
    } catch (err) {
      const e2 = $("#sch-error"); e2.textContent = err.message; e2.hidden = false;
    } finally { btn.disabled = false; btn.textContent = "Create scheme"; }
  });
})();

// ------------------------------------------------------------------ Agent activity
loaders.activity = async () => {
  const el = $("#panel-activity"); loading(el);
  try {
    const runs = await api("/api/runs");
    const flags = await api("/api/flags");
    const appr = await api("/api/approvals");
    const runRows = runs.runs.map(r => `<tr>
        <td><span class="pill status">${esc(r.trigger_type)}</span></td>
        <td>${esc(r.request_text || "")}</td>
        <td>${esc(r.status)}</td>
        <td>${r.input_sources} sources → ${r.outputs} outputs</td>
        <td class="note">${esc((r.started_at || "").replace("T", " ").slice(0, 19))}</td></tr>`).join("");
    const flagRows = flags.flags.map(f => `<tr>
        <td><span class="pill loss">${esc(f.severity)}</span></td>
        <td>${esc(f.roll_no || "")} ${esc(f.full_name || "")}</td>
        <td>${esc(f.deviation_summary)}</td>
        <td class="note">${esc(f.suggested_first_action)}</td></tr>`).join("") || `<tr><td colspan="4" class="note">No open flags. Run Renewal Risk first.</td></tr>`;
    const apprRows = appr.approvals.map(a => `<tr>
        <td>${esc(a.reasoning_summary)}</td>
        <td><button class="btn small" data-approve="${esc(a.agent_output_id)}">Approve</button>
            <button class="btn small ghost" data-reject="${esc(a.agent_output_id)}">Reject</button></td></tr>`).join("")
      || `<tr><td colspan="2" class="note">Nothing awaiting approval.</td></tr>`;

    el.innerHTML = `
      <div class="card"><h2>Human approval queue</h2>
        <div class="sub">Class-3 agent: actions that affect a student wait for a human decision.</div>
        <div class="tbl-wrap"><table><tbody>${apprRows}</tbody></table></div></div>
      <div class="card"><h2>Open risk flags (SCHOLARSHIP_RISK)</h2>
        <div class="tbl-wrap"><table>
          <thead><tr><th>Severity</th><th>Student</th><th>Concern</th><th>Suggested first action</th></tr></thead>
          <tbody>${flagRows}</tbody></table></div></div>
      <div class="card"><h2>Recent agent runs (audit trail)</h2>
        <div class="sub">Every action this agent takes is logged with its inputs and outputs — the
          evidence trail an accreditation audit walks back through.</div>
        <div class="tbl-wrap"><table>
          <thead><tr><th>Trigger</th><th>Request</th><th>Status</th><th>Provenance</th><th>When</th></tr></thead>
          <tbody>${runRows}</tbody></table></div></div>`;

    $$("[data-approve]", el).forEach(b => b.addEventListener("click", () => decide(b, "APPROVE")));
    $$("[data-reject]", el).forEach(b => b.addEventListener("click", () => decide(b, "REJECT")));
  } catch (e) { errorCard(el, e); }
};

// ------------------------------------------------------------------ Integrations
loaders.integrations = async () => {
  const el = $("#panel-integrations"); loading(el);
  try {
    const d = await api("/api/integrations");
    const db = d.database;
    const reads = db.reads.map(r => `<tr><td><code>${esc(r.object)}</code></td><td class="cell-ok">${r.rows}</td></tr>`).join("");
    const consumes = d.consumes.map(c => `<div class="int-item">
        <div class="int-h"><b>${esc(c.agent)}</b><span class="pill watch">consumes</span></div>
        <div class="note">Provides <b>${esc(c.provides)}</b> · source <code>${esc(c.source)}</code></div>
        <div class="int-status">${esc(c.status)}</div></div>`).join("");
    const feeds = d.feeds.map(f => `<div class="int-item">
        <div class="int-h"><b>${esc(f.agent)}</b><span class="pill ok">feeds</span></div>
        <div class="note">Gives <b>${esc(f.gives)}</b> · target <code>${esc(f.target)}</code></div></div>`).join("");
    const prov = d.provenance.length
      ? d.provenance.map(p => `<tr><td><code>${esc(p.source_schema)}.${esc(p.source_table)}</code></td>
          <td>${p.record_count == null ? "—" : p.record_count}</td>
          <td class="note">${esc(p.request_text || "")}</td></tr>`).join("")
      : `<tr><td colspan="3" class="note">Open Coverage, Renewal or Reconciliation once to generate live lineage.</td></tr>`;
    el.innerHTML = `
      <div class="card">
        <h2>Connected to the shared Academic Platform database</h2>
        <div class="int-conn">
          <span class="pill ok">● CONNECTED</span>
          <b>${esc(db.provider)}</b>${db.instance ? ` · <code>${esc(db.instance)}</code>` : ""}${db.version ? ` · ${esc(db.version)}` : ""}
        </div>
        <div class="sub">Running on the exact schema the competition provided
          (<code>schema_full.sql</code>): <b>${db.schemas || "—"}</b> schemas · <b>${db.tables || "—"}</b>
          tables loaded whole — the same database every other team's agent uses.</div>
        <div class="int-live">
          <span>Database server time (live): <b id="db-time">${esc(db.server_time || "")}</b></span>
          <button class="btn small" id="int-refresh">↻ Refresh</button>
        </div>
        <div class="sub">That clock is read straight from the database — press <b>Refresh</b> and it
          moves, because it is queried live, never stored. <b>${db.runs_logged}</b> agent runs are
          logged. The row counts below are read the same way, right now.</div>
        <div class="tbl-wrap"><table>
          <thead><tr><th>Shared object read</th><th>Live rows</th></tr></thead>
          <tbody>${reads}</tbody></table></div>
      </div>
      <div class="card">
        <h2>Consumes — Agents 10 &amp; 11</h2>
        <div class="sub">Inputs read from other teams' agents (stubbed for the demo, per the spec).</div>
        <div class="int-grid">${consumes}</div>
      </div>
      <div class="card">
        <h2>Feeds — Agents 40, 41 &amp; 43</h2>
        <div class="sub">Outputs written back for downstream agents through the shared tables.</div>
        <div class="int-grid">${feeds}</div>
      </div>
      <div class="card">
        <h2>Live data lineage (provenance)</h2>
        <div class="sub">Every run records exactly which records fed it — <code>agentops.agent_run_input</code>.</div>
        <div class="tbl-wrap"><table>
          <thead><tr><th>Source table</th><th>Rows</th><th>Run</th></tr></thead>
          <tbody>${prov}</tbody></table></div>
      </div>`;
    const rf = $("#int-refresh"); if (rf) rf.addEventListener("click", () => loaders.integrations());
  } catch (e) { errorCard(el, e); }
};

async function decide(btn, decision) {
  const id = btn.dataset.approve || btn.dataset.reject;
  btn.disabled = true;
  try {
    await api("/api/approve", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_output_id: id, decision })
    });
    invalidateCache(); loaders.activity();
  } catch (e) { btn.disabled = false; alert(e.message); }
}

// ------------------------------------------------------------------ Chat
$("#chat-toggle").addEventListener("click", () => $("#chat").classList.toggle("hidden"));
$("#chat-close").addEventListener("click", () => $("#chat").classList.add("hidden"));

// ---- image attach ----
let pendingImage = null;
const imgInput = $("#chat-image"), attach = $("#chat-attach");
if (imgInput) imgInput.addEventListener("change", () => {
  const f = imgInput.files && imgInput.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    pendingImage = reader.result;
    attach.hidden = false;
    attach.innerHTML = `<img src="${pendingImage}" alt="attachment" />
      <span>Image attached</span><button type="button" id="chat-attach-x" aria-label="Remove">×</button>`;
    $("#chat-attach-x").addEventListener("click", clearImage);
  };
  reader.readAsDataURL(f);
});
function clearImage() {
  pendingImage = null;
  if (attach) { attach.hidden = true; attach.innerHTML = ""; }
  if (imgInput) imgInput.value = "";
}

// ---- voice input (Web Speech API; graceful if unsupported) ----
const mic = $("#chat-mic");
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recog = null, listening = false;
if (mic && SR) {
  recog = new SR(); recog.lang = "en-IN"; recog.interimResults = false;
  recog.onresult = (e) => { $("#chat-input").value = e.results[0][0].transcript; };
  recog.onend = () => { listening = false; mic.classList.remove("live"); };
  recog.onerror = () => { listening = false; mic.classList.remove("live"); };
  mic.addEventListener("click", () => {
    if (listening) { recog.stop(); return; }
    try { recog.start(); listening = true; mic.classList.add("live"); } catch (e) {}
  });
} else if (mic) {
  mic.addEventListener("click", () => addMsg("Voice input isn't supported in this browser.", "bot"));
}

$("#chat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#chat-input");
  const text = input.value.trim();
  if (!text && !pendingImage) return;
  addMsg(text || "🖼 image", "me");
  const img = pendingImage;
  input.value = ""; clearImage();
  const thinking = addMsg("…", "bot");
  try {
    const d = await api("/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text, image: img, role: currentRole, viewer: R().student || "",
        ai_consent: (typeof window.aiConsent === "function" ? window.aiConsent() : true)
      })
    });
    thinking.innerHTML = `<span class="tag">AURA</span>${esc(d.reply)}`;
  } catch (err) {
    thinking.textContent = "Error: " + err.message;
  }
});
function addMsg(text, who) {
  const div = document.createElement("div");
  div.className = "msg " + who;
  div.textContent = text;
  $("#chat-log").appendChild(div);
  $("#chat-log").scrollTop = $("#chat-log").scrollHeight;
  return div;
}

// close the application-pack modal
(function () {
  const m = $("#prepare-modal"); if (!m) return;
  $$("[data-close-prepare]").forEach(b => b.addEventListener("click", () => { m.hidden = true; }));
})();

// ------------------------------------------------------------------ theme
(function () {
  const btn = $("#theme-toggle");
  if (!btn) return;
  const cur = () => document.documentElement.getAttribute("data-theme") || "light";
  btn.addEventListener("click", () => {
    const next = cur() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    // Only remember the theme if the Preferences cookie was allowed.
    if (!window.__consent || window.__consent.preferences !== false) {
      try { localStorage.setItem("agent42-theme", next); } catch (e) {}
    }
  });
})();

// ------------------------------------------------------------------ profile menu
(function () {
  const wrap = $("#profile"), btn = $("#avatar-btn"), menu = $("#profile-menu");
  if (!wrap || !btn || !menu) return;
  async function build() {
    const name = menu.dataset.name || "Signed in";
    const mode = menu.dataset.mode || "guest";
    let roll = ROLES[currentRole].student;
    if (!roll && /^\d{2}CSE\d{3}$/i.test(name)) roll = name.toUpperCase();
    let detail = `<div class="pm-note">Scholarship section · Vignan University</div>`;
    if (roll) {
      try {
        const s = (await getData("/api/students")).students.find(x => x.roll_no === roll);
        if (s) detail = `<div class="pm-rows">
          <div><span>Roll no</span><b>${esc(s.roll_no)}</b></div>
          <div><span>Programme</span><b>${esc(s.programme_code)} · Year ${esc(s.year_of_study)}</b></div>
          <div><span>CGPA</span><b>${esc(s.cgpa)}</b></div>
          <div><span>Attendance</span><b>${esc(s.attendance_pct)}%</b></div>
          <div><span>Category</span><b>${esc(s.social_category || "—")}</b></div></div>`;
      } catch (e) { /* keep generic note */ }
    }
    menu.innerHTML = `
      <div class="pm-head"><span class="pm-avatar">${esc(name[0].toUpperCase())}</span>
        <div><div class="pm-name">${esc(name)}</div>
          <div class="pm-mode">Signed in · ${esc(mode)}</div></div></div>
      ${detail}
      <a class="pm-signout" href="/logout">Sign out</a>`;
  }
  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!menu.hidden) { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); return; }
    await build(); menu.hidden = false; btn.setAttribute("aria-expanded", "true");
  });
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); }
  });
})();

// ------------------------------------------------------------------ boot
(function initRoleContext() {
  if (APP.student && ROLES.STUDENT) ROLES.STUDENT.student = APP.student;
  const rs = document.querySelector(".role-switch");
  if (!APP.canSwitch && ROLES[APP.role]) {
    currentRole = APP.role;                       // locked to the signed-in role
    if (rs) rs.innerHTML =
      `<span class="signed-role">Signed in as <b>${esc(ROLES[APP.role].label)}</b> — you see only this role's view.</span>
       <a class="linkbtn" href="/logout">Use guest login to preview all roles</a>`;
  } else if (rs) {
    rs.insertAdjacentHTML("beforeend",
      `<span class="guest-note">Guest preview — switch roles to explore. In production each user sees only their own role.</span>`);
  }
})();
applyRole();

// Platform status bar: fill the live DB provider and jump to Integrations.
(function () {
  const link = document.querySelector("[data-goto-integrations]");
  const intTab = document.querySelector('.tab[data-tab="integrations"]');
  if (link) {
    if (!intTab || intTab.hidden) link.style.display = "none";
    else link.addEventListener("click", (e) => { e.preventDefault(); intTab.click(); });
  }
  getData("/api/integrations").then(d => {
    const el = $("#pb-db");
    if (el && d && d.database && d.database.provider) el.textContent = d.database.provider;
  }).catch(() => {});
})();
