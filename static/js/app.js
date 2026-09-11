"use strict";

// ------------------------------------------------------------------ helpers
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const money = (n) => (n === null || n === undefined) ? "—" : "₹" + Number(n).toLocaleString("en-IN");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function api(path, opts) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({ error: "bad response" }));
  if (data && data.error) throw new Error(data.error);
  return data;
}
function loading(el) { el.innerHTML = `<div class="loading">Running agent…</div>`; }
function errorCard(el, e) {
  el.innerHTML = `<div class="card"><h2>Could not load</h2>
    <div class="sub">${esc(e.message)}</div></div>`;
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

// ------------------------------------------------------------------ tabs
const loaders = {};
$$(".tab").forEach(tab => tab.addEventListener("click", () => {
  $$(".tab").forEach(t => t.classList.remove("active"));
  $$(".panel").forEach(p => p.classList.remove("active"));
  tab.classList.add("active");
  const name = tab.dataset.tab;
  $("#panel-" + name).classList.add("active");
  if (loaders[name]) loaders[name]();
}));

// role switch (visual; officer sees all, student view narrows tables)
let currentRole = "ACCOUNTS";
$$(".role").forEach(b => b.addEventListener("click", () => {
  $$(".role").forEach(r => r.classList.remove("active"));
  b.classList.add("active");
  currentRole = b.dataset.role;
  // re-run the active tab so the view reflects the role
  const active = $(".tab.active");
  if (active && loaders[active.dataset.tab]) loaders[active.dataset.tab]();
}));

// ------------------------------------------------------------------ KPIs
async function loadKpis() {
  try {
    const c = await api("/api/coverage");
    const r = await api("/api/renewal-risk");
    const rec = await api("/api/reconciliation");
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
  const el = $("#panel-coverage"); loading(el);
  try {
    const d = await api("/api/coverage");
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

// ------------------------------------------------------------------ Matrix
loaders.matrix = async () => {
  const el = $("#panel-matrix"); loading(el);
  try {
    const d = await api("/api/matrix");
    const head = d.schemes.map(s => `<th title="${esc(s.name)}">${esc(s.code)}</th>`).join("");
    const rows = d.rows.map(r => {
      const cells = r.cells.map(c => {
        const pill = c.is_eligible ? `<span class="pill ok">✓</span>` : `<span class="pill no">✗</span>`;
        return `<td>${pill}
          <button class="why-btn">why</button>${whyBlock(c.criteria_result)}</td>`;
      }).join("");
      return `<tr><td><b>${esc(r.student.roll_no)}</b><br><span class="note">${esc(r.student.full_name)}</span></td>${cells}</tr>`;
    }).join("");
    el.innerHTML = `<div class="card">
      <h2>Eligibility Matrix — every student × every scheme</h2>
      <div class="sub">Computed deterministically from the schemes' JSON rules. Click <b>why</b>
        on any cell to see the exact rules that passed or failed.</div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Student</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
    </div>`;
    wireWhy(el);
  } catch (e) { errorCard(el, e); }
};

// ------------------------------------------------------------------ Applications
const STATUS_ORDER = ["DRAFT", "SUBMITTED", "INSTITUTION_VERIFIED", "SANCTIONED", "DISBURSED", "REJECTED", "LAPSED"];
loaders.applications = async () => {
  const el = $("#panel-applications"); loading(el);
  try {
    const d = await api("/api/applications");
    const rows = d.applications.map(a => `<tr>
        <td><b>${esc(a.roll_no)}</b><br><span class="note">${esc(a.full_name)}</span></td>
        <td>${esc(a.scheme_name)}</td>
        <td><span class="pill status">${esc(a.status)}</span></td>
        <td>${esc(a.applied_on || "—")}</td>
        <td>${a.sanctioned_amount ? money(a.sanctioned_amount) : "—"}</td>
        <td>${a.disbursed_amount ? money(a.disbursed_amount) : "—"}</td>
        <td class="note">${esc(a.rejection_reason || "")}</td></tr>`).join("");
    el.innerHTML = `<div class="card">
      <h2>Application Tracker</h2>
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
  const el = $("#panel-renewal"); loading(el);
  try {
    const d = await api("/api/renewal-risk");
    const pillCls = { NONE: "none", WATCH: "watch", AT_RISK: "atrisk", LIKELY_LOSS: "loss" };
    const rows = d.results.map(r => `<tr>
        <td><b>${esc(r.student.roll_no)}</b><br><span class="note">${esc(r.student.full_name)}</span></td>
        <td>${esc(r.scheme_name)}</td>
        <td><span class="pill ${pillCls[r.risk_level] || "none"}">${esc(r.risk_level)}</span></td>
        <td>${r.student.attendance_pct}%</td>
        <td>${r.student.cgpa}</td>
        <td>${r.flag_raised ? '<span class="pill loss">flag raised</span>' : "—"}
            <button class="why-btn">why</button>${whyBlock(r.criteria_result)}</td></tr>`).join("");
    el.innerHTML = `<div class="card">
      <h2>Renewal Risk — catch it while there is still time</h2>
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
  const el = $("#panel-reconciliation"); loading(el);
  try {
    const d = await api("/api/reconciliation");
    const rows = d.results.map(r => `<tr>
        <td><b>${esc(r.roll_no)}</b><br><span class="note">${esc(r.full_name)}</span></td>
        <td>${esc(r.scheme_name)}</td>
        <td>${money(r.covered_amount)}</td>
        <td>${money(r.outstanding)}</td>
        <td>${r.active_reminder ? `<span class="pill atrisk">${esc(r.reminder_segment || "reminder")}</span>` : "—"}</td>
        <td>${r.recommend_suppress
              ? `<button class="btn small" data-suppress="${esc(r.reminder_dispatch_id)}">Suppress reminder</button>`
              : '<span class="pill ok">ok</span>'}</td></tr>`).join("");
    el.innerHTML = `<div class="card">
      <h2>Fee Reconciliation</h2>
      <div class="sub">Matches scholarship disbursements against the fee ledger so recipients are not
        chased for money already covered.</div>
      <div class="note quote">"Reminders MUST be suppressed where a sanctioned scholarship or approved
        installment plan covers the dues. This is the most common cause of avoidable distress in fee
        follow-up." — comment in the platform schema (finance.reminder_dispatch).</div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Student</th><th>Scheme</th><th>Covered</th><th>Outstanding</th>
        <th>Active reminder</th><th>Agent action (needs approval)</th></tr></thead>
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
        loadKpis();
      } catch (e) { btn.disabled = false; btn.textContent = "Retry"; alert(e.message); }
    }));
  } catch (e) { errorCard(el, e); }
};

// ------------------------------------------------------------------ Schemes
loaders.schemes = async () => {
  const el = $("#panel-schemes"); loading(el);
  try {
    const d = await api("/api/schemes");
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
    el.innerHTML = cards || `<div class="card"><h2>No schemes</h2></div>`;
  } catch (e) { errorCard(el, e); }
};

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

async function decide(btn, decision) {
  const id = btn.dataset.approve || btn.dataset.reject;
  btn.disabled = true;
  try {
    await api("/api/approve", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_output_id: id, decision })
    });
    loaders.activity();
  } catch (e) { btn.disabled = false; alert(e.message); }
}

// ------------------------------------------------------------------ Chat
$("#chat-toggle").addEventListener("click", () => $("#chat").classList.toggle("hidden"));
$("#chat-close").addEventListener("click", () => $("#chat").classList.add("hidden"));
$("#chat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#chat-input");
  const text = input.value.trim();
  if (!text) return;
  addMsg(text, "me");
  input.value = "";
  const thinking = addMsg("…", "bot");
  try {
    const d = await api("/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text })
    });
    thinking.innerHTML = `<span class="tag">${esc(d.intent || "answer")}</span>${esc(d.reply)}`;
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

// ------------------------------------------------------------------ boot
loadKpis();
loaders.coverage();
