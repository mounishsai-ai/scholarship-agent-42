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
  loadHero();
  const name = active.dataset.tab;
  if (typeof _activeTabName !== "undefined") _activeTabName = name;
  if (window.__updateSecNav) window.__updateSecNav();
  replay($("#panel-" + name));
  if (loaders[name]) loaders[name]();
}

// ------------------------------------------------------------------ Hero headline
const _prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function countUp(el, to) {
  to = Number(to) || 0;
  if (_prefersReduced || to <= 0) { el.textContent = to; return; }
  const dur = 620, t0 = performance.now();
  (function step(now) {
    const p = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(to * eased);
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}
async function loadHero() {
  const role = R();
  const eb = $("#hero-eyebrow"), h = $("#hero-headline"), sub = $("#hero-sub");
  if (!h) return;
  if (eb) eb.textContent = `${role.label} · live on the shared platform`;
  try {
    if (role.student) {
      const [m, rn] = await Promise.all([getData("/api/matrix"), getData("/api/renewal-risk")]);
      const row = m.rows.find(x => x.student.roll_no === role.student);
      const eligible = row ? row.cells.filter(c => c.is_eligible).length : 0;
      const name = row ? row.student.full_name.split(" ")[0] : "there";
      const atRisk = rn.results.some(x => x.student.roll_no === role.student && ["AT_RISK", "LIKELY_LOSS"].includes(x.risk_level));
      h.innerHTML = `Hi ${esc(name)} — you qualify for <span class="hl" id="hero-n">0</span> scholarship${eligible === 1 ? "" : "s"}.`;
      countUp($("#hero-n"), eligible);
      sub.innerHTML = atRisk
        ? `One of your renewals is <b>at risk</b> — check Renewal status before it lapses.`
        : `Every scheme you match, with the exact rule behind each decision. Your renewals are on track.`;
      return;
    }
    // Fire both in parallel — awaiting them one after the other doubled the hero's
    // wait (and it was the last thing on screen to settle).
    const [c, rec] = await Promise.all([getData("/api/coverage"), getData("/api/reconciliation")]);
    h.innerHTML = `<span class="hl" id="hero-n">0</span> scholarship matches are sitting <span class="hl-blue">unclaimed</span>.`;
    countUp($("#hero-n"), c.coverage_gap);
    const n = (x) => Number(x || 0).toLocaleString("en-IN");
    const cohort = (c.students && c.students.total) ? `${n(c.students.total)} students` : "the cohort";
    sub.innerHTML = `${n(c.total_eligible)} eligible matches across ${role.label === "Head of Department" ? `the department's ${cohort}` : cohort}, `
      + `${n(c.total_covered)} already covered${rec.suppress_count ? `, and ${rec.suppress_count} fee reminder(s) to suppress` : ""}. `
      + `Agent&nbsp;42 works the gap down, scheme by scheme.`;
  } catch (e) {
    h.textContent = "Every eligible student, every scheme — accounted for.";
    if (sub) sub.textContent = "";
  }
}

// Keep the sticky tab bar pinned just below the (variable-height) header,
// so the two never overlap when you scroll.
(function () {
  const tb = document.querySelector(".topbar");
  if (!tb) return;
  const set = () => document.documentElement.style.setProperty("--topbar-h", tb.offsetHeight + "px");
  set();
  window.addEventListener("resize", set);
  window.addEventListener("load", set);
})();

// ------------------------------------------------------------------ tabs
const loaders = {};
const TAB_ORDER = $$(".tab").map(t => t.dataset.tab);
let _activeTabName = "coverage";
// Switch tab with the handoff's two-phase transition: the outgoing panel leaves
// (220ms, toward the direction of travel), content is swapped at ~205ms, then the
// incoming panel slides in from the opposite side (500ms) while its cards cascade
// in with a 90ms stagger. Every caller — tabs, ‹ › arrows, KPI cards, swipe —
// funnels through here, so they all get the same motion.
let _swapping = false;
function switchTab(name, opts) {
  opts = opts || {};
  if (!name) return;
  const scrollToContent = () => {
    const a = document.querySelector(".tabs");
    if (a) a.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  if (name === _activeTabName) { if (opts.scrollToContent) scrollToContent(); return; }
  if (_swapping) return;          // repeat clicks mid-swap are ignored, per the spec
  // A new section opens at its own beginning. If the reader has scrolled down into
  // the previous panel, bring the new one in with its top just under the pinned
  // rail; if they're still up in the hero, leave the page exactly where it is
  // (never yank to the page top).
  const startY = panelStartY();
  const keepY = Math.min(window.scrollY, startY);
  const from = TAB_ORDER.indexOf(_activeTabName), to = TAB_ORDER.indexOf(name);
  const fwd = to >= from;
  const dir = fwd ? "right" : "left";
  const wrap = $(".panels");

  // The rail answers the press, not the commit: the active tab, its gold underline,
  // the NN / 08 marker and the progress line all move the instant you click.
  $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  if (window.__a42SyncRail) window.__a42SyncRail(name);

  const commit = () => {
    _swapping = false;
    $$(".panel").forEach(p => p.classList.remove("active"));
    const panel = $("#panel-" + name);
    if (!panel) return;
    panel.classList.add("active");
    panel.dataset.dir = dir;
    _activeTabName = name;
    if (window.__updateSecNav) window.__updateSecNav();

    if (wrap) {
      wrap.style.animation = "none";
      wrap.style.opacity = "1";
      wrap.style.filter = "none";
      wrap.style.transform = "none";
      if (!_prefersReduced) {
        void wrap.offsetWidth;
        wrap.style.animation = "panelIn" + (fwd ? "Fwd" : "Back") +
          " .5s cubic-bezier(.19,1,.22,1) both";
        setTimeout(() => {
          wrap.style.animation = "none";
          wrap.style.transform = "none";
        }, 620);
      }
    }
    cascade(panel);

    // Either bring the section content into view, or keep the current scroll.
    const after = opts.scrollToContent ? scrollToContent
      : () => { if (window.scrollY > keepY) window.scrollTo({ top: keepY, behavior: "instant" }); };
    requestAnimationFrame(after);
    const p = loaders[name] ? loaders[name]() : null;
    if (p && p.then) p.then(() => { cascade(panel); if (opts.scrollToContent) requestAnimationFrame(after); });
  };

  if (!wrap || _prefersReduced) { commit(); return; }
  _swapping = true;
  wrap.style.animation = "none";
  void wrap.offsetWidth;
  wrap.style.animation = "panelOut" + (fwd ? "Fwd" : "Back") +
    " .22s cubic-bezier(.45,0,.9,.6) both";
  setTimeout(commit, 205);
}

// Scroll position at which the panels begin right under the sticky header + rail.
function panelStartY() {
  const wrap = $(".panels"), rail = $(".tabs"), top = $(".topbar");
  if (!wrap) return 0;
  const pinned = (top ? top.offsetHeight : 0) + (rail ? rail.offsetHeight : 0);
  return Math.max(0, Math.round(wrap.getBoundingClientRect().top + window.scrollY - pinned));
}

// The card cascade inside a panel: 90ms apart, first one at 50ms. On a panel that
// is a single card, the cascade descends one level into that card's sections.
function cascade(panel) {
  if (!panel || _prefersReduced) return;
  let items = [...panel.children];
  if (items.length === 1 && items[0].children.length > 1) items = [...items[0].children];
  items.forEach((el, i) => {
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "asmIn .62s cubic-bezier(.16,1,.3,1) " +
      (0.05 + i * 0.09).toFixed(3) + "s both";
  });
}

$$(".tab").forEach(tab => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));

// Swipe left/right on the panels to move between visible tabs (touch + trackpad drag).
(function () {
  const area = $(".panels"); if (!area) return;
  let x0 = null, y0 = null;
  const visible = () => $$(".tab").filter(t => !t.hidden).map(t => t.dataset.tab);
  const go = (delta) => {
    const vis = visible(); const i = vis.indexOf(_activeTabName);
    const j = i + delta;
    if (j >= 0 && j < vis.length) switchTab(vis[j]);
  };
  area.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  area.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) go(dx < 0 ? 1 : -1);
    x0 = y0 = null;
  }, { passive: true });
})();

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
      const [m, ap, rn] = await Promise.all([
        getData("/api/matrix"), getData("/api/applications"), getData("/api/renewal-risk"),
      ]);
      const row = m.rows.find(x => x.student.roll_no === role.student);
      const eligible = row ? row.cells.filter(c => c.is_eligible).length : 0;
      const myAp = ap.applications.filter(a => a.roll_no === role.student).length;
      const myRn = rn.results.filter(x => x.student.roll_no === role.student);
      const atRisk = myRn.some(x => ["AT_RISK", "LIKELY_LOSS"].includes(x.risk_level));
      $("#kpis").innerHTML = `
        <div class="kpi"><div class="num">${eligible}</div><div class="lbl">Schemes you qualify for</div></div>
        <div class="kpi good"><div class="num">${myAp}</div><div class="lbl">Your applications</div></div>
        <div class="kpi ${atRisk ? "bad" : "good"}"><div class="num">${atRisk ? "!" : "✓"}</div><div class="lbl">${atRisk ? "Renewal at risk" : "Renewals on track"}</div></div>`;
      return;
    }
    const [c, r, rec] = await Promise.all([
      getData("/api/coverage"), getData("/api/renewal-risk"), getData("/api/reconciliation"),
    ]);
    const n = (x) => Number(x || 0).toLocaleString("en-IN");
    $("#kpis").innerHTML = `
      <div class="kpi"><div class="num">${n(c.total_eligible)}</div><div class="lbl">Eligible matches</div></div>
      <div class="kpi good"><div class="num">${n(c.total_covered)}</div><div class="lbl">Covered</div></div>
      <div class="kpi bad"><div class="num">${n(c.coverage_gap)}</div><div class="lbl">Coverage gap</div></div>
      <div class="kpi bad"><div class="num">${r.at_risk_count}</div><div class="lbl">Renewals at risk</div></div>
      <div class="kpi bad"><div class="num">${rec.suppress_count}</div><div class="lbl">Reminders to suppress</div></div>`;
  } catch (e) { $("#kpis").innerHTML = `<div class="note">${esc(e.message)}</div>`; }
}

// ------------------------------------------------------------------ Coverage
loaders.coverage = async () => {
  const el = $("#panel-coverage"); loading(el, "/api/coverage");
  try {
    const d = await getData("/api/coverage");
    const rows = d.per_scheme.map(s => {
      const pct = s.eligible ? Math.round(100 * s.covered / s.eligible) : 0;
      return `<tr>
        <td>${esc(s.scheme_name)}</td>
        <td>${s.eligible}</td><td>${s.applied}</td>
        <td class="cell-ok">${s.covered}</td>
        <td class="${s.gap > 0 ? "cell-no" : ""}"><b>${s.gap}</b></td>
        <td class="cov-bar-cell">
          <div class="cov-bar" title="${s.covered} of ${s.eligible} covered">
            <span class="cov-bar-fill" style="width:${pct}%"></span>
          </div>
          <span class="cov-bar-pct">${pct}%</span>
        </td></tr>`;
    }).join("");
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
          <thead><tr><th>Scheme</th><th>Eligible</th><th>Applied</th><th>Covered</th><th>Gap</th><th>Coverage</th></tr></thead>
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
      invalidateCache(); loadKpis();
      // The upgrade layer re-reads /api/matrix and reports how many students the
      // engine now matches to this scheme; it re-renders the panel when it has it.
      if (window.__a42SchemeCreated) window.__a42SchemeCreated(body.code, body.name);
      else loaders.schemes();
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
    const gear = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
    const clock = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
    const runItems = runs.runs.map((r, i) => {
      const when = (r.started_at || "").replace("T", " ").slice(0, 19) || "just now";
      return `<div class="tl-item ${i % 2 ? "right" : "left"}">
        <div class="tl-node">${gear}</div>
        <div class="tl-card">
          <div class="tl-head"><span class="tl-kind">${esc(r.trigger_type || "RUN")}</span>
            <span class="pill status">${esc(r.status || "LOGGED")}</span></div>
          <div class="tl-grid">
            <div><span>Request</span><b>${esc(r.request_text || "Scheduled agent pass")}</b></div>
            <div><span>Provenance</span><b>${r.input_sources} source(s) → ${r.outputs} output(s)</b></div>
          </div>
          <div class="tl-foot">${clock}<span>${esc(when)}</span></div>
        </div>
      </div>`;
    }).join("") || `<div class="note" style="padding:8px">No runs yet — open Coverage or Renewal Risk to generate the trail.</div>`;
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
      <div class="card">
        <div class="tl-header">
          <div><h2>Audit trail — every agent run, logged</h2>
            <div class="sub">Each action this agent takes is recorded with its inputs and outputs — the
              evidence trail an accreditation audit walks back through.</div></div>
          <span class="tl-count">${runs.runs.length} record(s) found</span>
        </div>
        <div class="timeline">${runItems}</div>
      </div>`;

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
    const orbit = `
      <div class="card orbit-card">
        <div class="orbit-copy">
          <h2>One database, 72 agents — how Agent 42 is wired in</h2>
          <div class="sub">No custom APIs. Agent 42 <b>reads</b> the shared tables Agents 10 &amp; 11 fill,
            and <b>writes</b> the tables Agents 40, 41 &amp; 43 read. Point every agent at the same
            database and they integrate automatically.</div>
          <div class="orbit-legend">
            <span class="ol in"><i></i>Consumes — reads from</span>
            <span class="ol out"><i></i>Feeds — writes to</span>
          </div>
        </div>
        <div class="orbit" role="img" aria-label="Agent 42 consumes Agents 10 and 11 and feeds Agents 40, 41 and 43">
          <div class="orbit-ring r1"></div>
          <div class="orbit-ring r2"></div>
          <div class="orbit-core"><span class="oc-num">42</span><span class="oc-lbl">Scholarship</span></div>
          <div class="orbit-pill in" style="--a:235deg"><b>Agent 10</b><span>Academic</span></div>
          <div class="orbit-pill in" style="--a:290deg"><b>Agent 11</b><span>Attendance</span></div>
          <div class="orbit-pill out" style="--a:55deg"><b>Agent 40</b><span>Fee mgmt</span></div>
          <div class="orbit-pill out" style="--a:90deg"><b>Agent 41</b><span>Reminders</span></div>
          <div class="orbit-pill out" style="--a:125deg"><b>Agent 43</b><span>Edu loans</span></div>
        </div>
      </div>`;
    el.innerHTML = orbit + `
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
    let pw = "";
    if (mode === "regid") {
      let acct = null;
      try { acct = await api("/api/account"); } catch (e) { /* the form still works */ }
      pw = `${acct && acct.default_password
          ? `<div class="pm-default">You're still using your default password (your register number). Change it below.</div>` : ""}
        <details class="pm-pw"${acct && acct.default_password ? " open" : ""}>
          <summary>Change password</summary>
          <form id="pm-pw-form" autocomplete="on">
            <input type="text" name="username" value="${esc(roll || "")}" autocomplete="username" hidden>
            <input type="password" name="current" placeholder="Current password" autocomplete="current-password" required>
            <input type="password" name="new" placeholder="New password (6+ characters)" autocomplete="new-password" minlength="6" required>
            <input type="password" name="confirm" placeholder="Repeat new password" autocomplete="new-password" minlength="6" required>
            <div class="msg" id="pm-pw-msg" hidden></div>
            <button class="btn small" type="submit">Update password</button>
          </form>
        </details>`;
    }
    menu.innerHTML = `
      <div class="pm-head"><span class="pm-avatar">${esc(name[0].toUpperCase())}</span>
        <div><div class="pm-name">${esc(name)}</div>
          <div class="pm-mode">Signed in · ${esc(mode === "regid" ? "register number" : mode)}</div></div></div>
      ${detail}
      ${pw}
      <a class="pm-signout" href="/logout">Sign out</a>`;
    const form = $("#pm-pw-form", menu);
    if (form) form.addEventListener("submit", changePassword);
  }
  async function changePassword(e) {
    e.preventDefault();
    const f = e.target, msg = $("#pm-pw-msg", f), btn = f.querySelector("button");
    const say = (text, ok) => { msg.textContent = text; msg.className = "msg " + (ok ? "ok" : "bad"); msg.hidden = false; };
    if (f.new.value !== f.confirm.value) { say("The two new passwords don't match."); return; }
    btn.disabled = true;
    try {
      await api("/api/account/password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current: f.current.value, new: f.new.value }),
      });
      f.reset();
      say("Password updated. Use it the next time you sign in.", true);
      const nudge = $(".pm-default", menu); if (nudge) nudge.remove();
    } catch (err) { say(err.message); }
    finally { btn.disabled = false; }
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
  if (APP.student && ROLES.STUDENT) {
    ROLES.STUDENT.student = APP.student;
    const who = ($("#profile-menu") || {}).dataset;
    ROLES.STUDENT.scope = `Your own record only — ${APP.student}${who && who.name ? ", " + who.name : ""}.`;
  }
  const rs = document.querySelector(".role-switch");
  if (!APP.canSwitch && ROLES[APP.role]) {
    currentRole = APP.role;                       // locked to the signed-in role
    if (rs) rs.innerHTML =
      `<span class="signed-role">Signed in as <b>${esc(ROLES[APP.role].label)}</b> — you see only this role's view.</span>
       <a class="linkbtn" href="/logout">Use guest login to preview all roles</a>`;
  } else if (rs) {
    rs.insertAdjacentHTML("beforeend",
      `<span class="guest-note"><b>Guest preview</b> — switch roles to explore. In production each user sees only their own role.</span>`);
  }
})();
applyRole();

(function nudgeDefaultPassword() {
  const menu = $("#profile-menu");
  if (!menu || menu.dataset.mode !== "regid") return;
  api("/api/account").then(a => {
    if (a && a.default_password) {
      setTimeout(() => showToast("You're signed in with your default password — open your profile (top right) to change it."), 1800);
    }
  }).catch(() => {});
})();

// Platform status bar: fill the live DB provider and jump to Integrations.
(function () {
  const link = document.querySelector("[data-goto-integrations]");
  const intTab = document.querySelector('.tab[data-tab="integrations"]');
  if (link) {
    if (!intTab || intTab.hidden) link.style.display = "none";
    else link.addEventListener("click", (e) => { e.preventDefault(); switchTab("integrations", { scrollToContent: true }); });
  }
  if (!APP.canSwitch && APP.role === "STUDENT") return;   // staff-only endpoint
  getData("/api/integrations").then(d => {
    const el = $("#pb-db");
    if (el && d && d.database && d.database.provider) el.textContent = d.database.provider;
  }).catch(() => {});
})();

// ------------------------------------------------------------------ 3D tilt on KPI cards
(function () {
  if (_prefersReduced) return;
  const host = $("#kpis"); if (!host) return;
  const MAX = 9;  // degrees
  host.addEventListener("pointermove", (e) => {
    const card = e.target.closest(".kpi"); if (!card) return;
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    card.style.setProperty("--ry", ((px - 0.5) * 2 * MAX).toFixed(2) + "deg");
    card.style.setProperty("--rx", ((0.5 - py) * 2 * MAX).toFixed(2) + "deg");
    card.style.setProperty("--gx", (px * 100).toFixed(0) + "%");
    card.style.setProperty("--gy", (py * 100).toFixed(0) + "%");
  });
  host.addEventListener("pointerleave", () => {
    $$(".kpi", host).forEach(c => { c.style.setProperty("--rx", "0deg"); c.style.setProperty("--ry", "0deg"); });
  }, true);
})();

// ------------------------------------------------------------------ Campus video: fade in only once it actually plays
(function () {
  const v = $("#dh-video"); if (!v) return;
  if (_prefersReduced) { v.remove(); return; }   // keep the still poster for reduced motion
  v.addEventListener("playing", () => v.classList.add("is-playing"), { once: true });
  v.addEventListener("error", () => v.remove());  // no mp4 yet → fall back to the poster image
  const src = v.querySelector("source");
  if (src) { const t = src.getAttribute("src"); src.setAttribute("src", t); v.load(); }
  const p = v.play(); if (p && p.catch) p.catch(() => {});
})();

// ------------------------------------------------------------------ Section nav: arrows, keys, mouse-drag, hint
(function () {
  const visible = () => $$(".tab").filter(t => !t.hidden).map(t => t.dataset.tab);
  function stepSection(delta) {
    const vis = visible(); const i = vis.indexOf(_activeTabName); const j = i + delta;
    if (j >= 0 && j < vis.length) { switchTab(vis[j]); hideHint(); }
  }
  const prev = $("#sec-prev"), next = $("#sec-next"), hint = $("#swipe-hint");
  if (prev) prev.addEventListener("click", () => stepSection(-1));
  if (next) next.addEventListener("click", () => stepSection(1));
  window.__updateSecNav = function () {
    const vis = visible(); const i = vis.indexOf(_activeTabName);
    if (prev) prev.classList.toggle("at-end", i <= 0);
    if (next) next.classList.toggle("at-end", i >= vis.length - 1);
  };
  window.__updateSecNav();
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input,textarea,select")) return;
    if (e.key === "ArrowRight") stepSection(1);
    else if (e.key === "ArrowLeft") stepSection(-1);
  });
  // Mouse drag across the panels (touch swipe is handled separately).
  const area = $(".panels"); let x0 = null, y0 = null, dragging = false;
  if (area) {
    area.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      if (e.target.closest("button,a,input,select,textarea,label,.why-btn,.cov-bar")) return;
      x0 = e.clientX; y0 = e.clientY; dragging = true;
    });
    window.addEventListener("pointerup", (e) => {
      if (!dragging) return; dragging = false;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy) * 1.5) stepSection(dx < 0 ? 1 : -1);
      x0 = y0 = null;
    });
  }
  let hintTimer = setTimeout(hideHint, 7500);
  function hideHint() { if (hint) hint.classList.add("hide"); clearTimeout(hintTimer); }
  window.hideHint = hideHint;
})();

// ------------------------------------------------------------------ AURA bot: "Ask me!" bubble
(function () {
  const bubble = $("#cl-bubble"), toggle = $("#chat-toggle"), chat = $("#chat");
  if (!bubble || !toggle) return;
  let dismissed = false, timer = null;
  const show = () => { if (dismissed || (chat && !chat.classList.contains("hidden"))) return; bubble.hidden = false; };
  const hide = () => { bubble.hidden = true; };
  const cycle = () => { show(); setTimeout(hide, 6500); timer = setTimeout(cycle, 32000); };
  setTimeout(cycle, 2800);
  toggle.addEventListener("click", () => { dismissed = true; hide(); if (timer) clearTimeout(timer); });
  bubble.addEventListener("click", () => toggle.click());
})();

// ------------------------------------------------------------------ upgrade layer hooks
// `loaders` is a module-private const, so the visual upgrade layer (upgrade.js,
// loaded after this file) cannot reach it without an explicit handle. getData and
// errorCard are function declarations and already global; exported here too so the
// contract the upgrade layer checks for is all in one place.
window.loaders = loaders; window.getData = getData; window.errorCard = errorCard;
window.ROLES = ROLES; window.currentRole = () => currentRole;
window.switchTab = switchTab; window.cascade = cascade;
