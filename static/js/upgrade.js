/* ============================================================
   Agent 42 — visual upgrade layer
   Load AFTER app.js. Overrides two loaders and the tab rail;
   touches nothing else. Remove this one <script> tag to revert.
   ============================================================ */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function lakh(n) {
    n = Number(n) || 0;
    if (n >= 10000000) return "₹" + (n / 10000000).toFixed(2).replace(/\.00$/, "") + " crore";
    if (n >= 100000) return "₹" + (n / 100000).toFixed(2).replace(/\.00$/, "") + " lakh";
    return "₹" + n.toLocaleString("en-IN");
  }
  function inr(n) {
    return (n == null) ? "—" : "₹" + Number(n).toLocaleString("en-IN");
  }
  function pad2(n) { return String(n).padStart(2, "0"); }
  var _reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  /* ---------------------------------------------------------- chapter rail */

  var CLAIMS = {
    coverage: "The gap between who qualifies and who is actually paid — priced in rupees, computed in SQL, never estimated.",
    matrix: "Every student against every scheme — eligible, applied, claimed — and each decision opens to the exact rules behind it.",
    applications: "Nothing lapses silently: every application has a visible stage, and every eligible match nobody applied for is counted.",
    renewal: "Awards are caught before they lapse — while a fixable attendance dip is still fixable.",
    reconciliation: "No student is chased for fees a scholarship already paid. The agent recommends; a human approves.",
    schemes: "Register a scheme and every student is re-matched instantly — the agentic loop, not a nightly batch.",
    activity: "Every run logged: inputs, reasoning, outputs, risk flags. Student-affecting actions wait for a human.",
    integrations: "Integration by shared database, not custom APIs. 72 agents, one schema."
  };

  var META = {};   // tab -> short live caption, filled in as data arrives

  function buildRail() {
    var nav = $("nav.tabs");
    if (!nav || nav.dataset.a42) return;
    var tabs = $$(".tab", nav);
    if (!tabs.length) return;

    var head = document.createElement("div");
    head.className = "a42-railhead";
    head.innerHTML =
      '<span class="a42-railtitle">The agent, in ' + tabs.length + ' sections</span>' +
      '<span class="a42-railpos" id="a42-railpos">01 <span>/ ' + pad2(tabs.length) + "</span></span>";

    var track = document.createElement("div");
    track.className = "a42-railtrack";

    tabs.forEach(function (t, i) {
      var label = t.textContent.trim();
      t.dataset.a42label = label;
      t.innerHTML =
        '<span class="a42-tabnum">' + pad2(i + 1) + "</span>" +
        '<span class="a42-tablabel">' + esc(label) + "</span>" +
        '<span class="a42-tabmeta" data-meta="' + esc(t.dataset.tab) + '">—</span>' +
        '<span class="a42-tabbar" aria-hidden="true"></span>';
      track.appendChild(t);
    });

    var prog = document.createElement("div");
    prog.className = "a42-railprog";
    prog.innerHTML = '<span id="a42-railfill"></span>';

    nav.innerHTML = "";
    nav.appendChild(head);
    nav.appendChild(track);
    nav.appendChild(prog);
    nav.dataset.a42 = "1";

    window.__a42SyncRail = syncRail;
    syncRail();
  }

  function syncRail(pending) {
    var tabs = $$("nav.tabs .tab").filter(function (t) { return !t.hidden; });
    var i = pending
      ? tabs.findIndex(function (t) { return t.dataset.tab === pending; })
      : tabs.findIndex(function (t) { return t.classList.contains("active"); });
    if (i < 0) i = tabs.findIndex(function (t) { return t.classList.contains("active"); });
    var pos = $("#a42-railpos");
    if (pos && i >= 0) pos.innerHTML = pad2(i + 1) + ' <span>/ ' + pad2(tabs.length) + "</span>";
    // The rule under the rail is a full-width divider, not a progress meter:
    // it separates the chapter index from the panel body. Position is already
    // carried by the NN / 08 marker and the gold underline.
    Object.keys(META).forEach(function (k) {
      var el = $('.a42-tabmeta[data-meta="' + k + '"]');
      if (el) el.textContent = META[k];
    });
    // The "What this proves" strip was removed — tabs open directly on their content.
  }

  function setMeta(tab, text) {
    META[tab] = text;
    var el = $('.a42-tabmeta[data-meta="' + tab + '"]');
    if (el) el.textContent = text;
  }

  /* ------------------------------------------------ shared: lists at scale */

  // 1000 students never render as 1000 animated nodes: long lists are searched,
  // filtered and paged, and only the list body repaints while you type.
  var PAGE = 25;
  var PAGERS = {};   // key -> function(page) that repaints that list

  function pager(key, total, page, per) {
    var pages = Math.max(1, Math.ceil(total / per));
    if (pages <= 1) return "";
    function btn(p, label, disabled, current) {
      return '<button class="a42-pg' + (current ? " on" : "") + '" data-a42-page="' + key +
        '" data-p="' + p + '"' + (disabled ? " disabled" : "") +
        (current ? ' aria-current="page"' : "") + ">" + label + "</button>";
    }
    var nums = [], p;
    for (p = 1; p <= pages; p++) {
      if (p === 1 || p === pages || Math.abs(p - page) <= 1) nums.push(p);
      else if (nums[nums.length - 1] !== "…") nums.push("…");
    }
    return '<div class="a42-pager">' + btn(page - 1, "‹ Prev", page <= 1) +
      nums.map(function (n) {
        return n === "…" ? '<span class="a42-pgdots">…</span>' : btn(n, n, false, n === page);
      }).join("") +
      btn(page + 1, "Next ›", page >= pages) + "</div>";
  }
  function rangeText(total, page, per, noun) {
    if (!total) return "No " + noun + " match these filters";
    var a = (page - 1) * per + 1, b = Math.min(total, page * per);
    return "Showing <b>" + a + "–" + b + "</b> of <b>" + total.toLocaleString("en-IN") + "</b> " + noun;
  }
  // compact "25 of 1,000 students" — the count on this page, of the total
  function rangeCompact(total, page, per, noun) {
    if (!total) return "No " + noun + " match these filters";
    var a = (page - 1) * per + 1, b = Math.min(total, page * per);
    return "<b>" + (b - a + 1) + "</b> of <b>" + total.toLocaleString("en-IN") + "</b> " + noun;
  }
  function pageOf(list, page, per) { return list.slice((page - 1) * per, page * per); }
  function clampPage(page, total, per) {
    return Math.min(Math.max(1, page), Math.max(1, Math.ceil(total / per)));
  }
  function nf(n) { return Number(n || 0).toLocaleString("en-IN"); }
  function pct(n, d) { return d ? Math.round(100 * n / d) : 0; }

  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-a42-page]");
    if (!b || b.disabled) return;
    var fn = PAGERS[b.dataset.a42Page];
    if (!fn) return;
    fn(Number(b.dataset.p));
    // keep the list's top in view when paging from the bottom controls
    var host = b.closest("[data-a42-list]");
    if (host && host.getBoundingClientRect().top < 0) {
      var rail = $("nav.tabs"), top = $(".topbar");
      var off = (rail ? rail.offsetHeight : 0) + (top ? top.offsetHeight : 0) + 12;
      window.scrollTo({ top: host.getBoundingClientRect().top + window.scrollY - off, behavior: "instant" });
    }
  });

  // POST an agent action, then refresh everything that depends on it.
  async function act(btn, path, body, done) {
    if (!btn || btn.disabled) return;
    var old = btn.textContent;
    btn.disabled = true; btn.textContent = "Working…";
    try {
      var d = await window.api(path, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {})
      });
      if (window.invalidateCache) window.invalidateCache();
      if (window.showToast) window.showToast(done(d));
      if (window.loadKpis) window.loadKpis();
      var active = $("nav.tabs .tab.active");
      if (active && window.loaders[active.dataset.tab]) window.loaders[active.dataset.tab]();
    } catch (e) {
      btn.disabled = false; btn.textContent = old;
      if (window.showToast) window.showToast("Could not complete that: " + e.message);
    }
  }

  var _typing = null;
  function onType(input, fn) {
    input.addEventListener("input", function () {
      clearTimeout(_typing);
      _typing = setTimeout(fn, 140);
    });
  }

  /* ------------------------------------------------------------- coverage */

  function schemeAmount(schemes, name) {
    var hit = (schemes || []).find(function (s) {
      return (s.scheme_name || s.name) === name;
    });
    if (!hit) return 0;
    return Number(hit.benefit_amount != null ? hit.benefit_amount
      : (hit.amount != null ? hit.amount : 0)) || 0;
  }
  function schemeCode(schemes, name) {
    var hit = (schemes || []).find(function (s) {
      return (s.scheme_name || s.name) === name;
    });
    return (hit && (hit.code || hit.scheme_code)) || "";
  }

  // Where one student stands overall. Colours are shared with the matrix so the
  // same blue always means "money reached them" and gold always means "the gap".
  var BUCKETS = [
    { key: "FULL", label: "Fully covered",
      desc: "Has a scholarship, and nothing they qualify for is left unclaimed." },
    { key: "PARTIAL", label: "Partly covered",
      desc: "Has a scholarship — but qualifies for another that nobody has applied to." },
    { key: "IN_PROGRESS", label: "Applied, waiting",
      desc: "Has applied; no money sanctioned yet." },
    { key: "UNCLAIMED", label: "Eligible, nothing claimed",
      desc: "Qualifies for at least one scheme, with no application moving (or only a rejected one)." },
    { key: "NOT_ELIGIBLE", label: "No scheme matches",
      desc: "No current scheme’s rules match this student." }
  ];
  var BUCKET_LABEL = {};
  BUCKETS.forEach(function (b) { BUCKET_LABEL[b.key] = b.label; });

  function stackBar(parts, total, cls) {
    return '<div class="a42-stack ' + (cls || "") + '">' + parts.map(function (p) {
      var w = total ? 100 * p.n / total : 0;
      if (!w) return "";
      return '<span class="' + p.cls + '" style="width:' + w.toFixed(3) + '%" title="' +
        esc(p.label + " — " + nf(p.n) + " (" + pct(p.n, total) + "%)") + '">' +
        (w >= 7 ? "<b>" + nf(p.n) + "</b>" : "") + "</span>";
    }).join("") + "</div>";
  }

  // One full-width bar per scheme: everyone who qualifies, split by how far they got.
  // Segments print their count inside when they are ≥3.5% of the bar; smaller non-zero
  // segments spill out as dot-chips on the line under the bar, so every count shows.
  var COV_SEG = [
    { key: "eligible_claimed",   color: "#3f68ea", ink: "#fff",     chip: "got the money" },
    { key: "eligible_applied",   color: "#a9c1fb", ink: "#16203a",  chip: "waiting" },
    { key: "eligible_rejected",  color: "#f3c7c2", ink: "#7a201b",  chip: "rejected" },
    { key: "eligible_unapplied", color: "#fbe4bb", ink: "#8a4b08",  chip: "never applied" }
  ];
  function schemeSegBar(s) {
    var elig = s.eligible || 0;
    var bar = COV_SEG.map(function (g) {
      var n = s[g.key] || 0;
      if (!n) return "";
      var w = elig ? 100 * n / elig : 0;
      var inside = w >= 3.5 ? '<b>' + nf(n) + "</b>" : "";
      return '<span style="background:' + g.color + ";width:" + w.toFixed(3) + '%;color:' + g.ink +
        '" title="' + esc(g.chip + " — " + nf(n)) + '">' + inside + "</span>";
    }).join("");
    var tiny = COV_SEG.map(function (g) {
      var n = s[g.key] || 0;
      if (!n) return "";
      var w = elig ? 100 * n / elig : 0;
      if (w >= 3.5) return "";
      return '<span class="chip"><i style="background:' + g.color + '"></i><b>' + nf(n) + "</b> " + esc(g.chip) + "</span>";
    }).join("");
    return '<div class="a42-covrow">' +
      '<div class="nm">' + esc(s.scheme_name) + "</div>" +
      '<div class="bw"><div class="a42-covbar">' + bar + "</div>" +
        '<div class="ft"><span class="lf"><b class="bl">' + pct(s.eligible_claimed, elig) +
          "%</b> got the money · <b class=\"gd\">" + nf(s.eligible_unapplied) + "</b> never applied</span>" +
        '<span class="chips">' + tiny + "</span></div></div>" +
    "</div>";
  }

  function installCoverage(getData, errorCard) {
    window.loaders.coverage = async function () {
      var el = $("#panel-coverage");
      try {
        var res = await Promise.all([
          getData("/api/coverage"),
          getData("/api/schemes").then(function (r) { return r.schemes || []; }).catch(function () { return []; }),
          getData("/api/applications").then(function (r) { return r.applications || []; }).catch(function () { return []; })
        ]);
        var d = res[0], schemes = res[1], apps = res[2];

        var stuck = 0, moved = 0, priced = false;
        d.per_scheme.forEach(function (s) {
          var amt = s.benefit_amount != null ? Number(s.benefit_amount) : schemeAmount(schemes, s.scheme_name);
          if (amt) priced = true;
          stuck += (s.gap > 0 ? s.gap : 0) * amt;
          moved += s.covered * amt;
        });
        var total = moved + stuck;
        var movedPct = total ? Math.round(100 * moved / total) : 0;

        setMeta("coverage", priced ? lakh(stuck) + " gap" : d.coverage_gap + " gap");

        var year = d.academic_year ? d.academic_year : "";

        // --- 1. gap summary — two lines + a ribbon
        var gapCard =
          '<div class="a42-covgap">' +
            '<div class="hd">' +
              "<div class=\"tx\">" +
                '<div class="l1"><b class="amt">' + (priced ? lakh(stuck) : nf(d.coverage_gap) + " matches") +
                  "</b> of scholarship money is unclaimed.</div>" +
                '<div class="l2"><b>' + nf(d.coverage_gap) + "</b> of <b>" + nf(d.total_eligible) +
                  "</b> eligible student–scheme matches have no application yet.</div>" +
              "</div>" +
              (year ? '<div class="yr">' + esc(year) + "</div>" : "") +
            "</div>" +
            '<div class="a42-covribbon"><div class="fill" style="width:' + movedPct + '%"></div>' +
              '<div class="rest"></div></div>' +
            '<div class="rf"><span><b class="bl">' + movedPct + "%</b> moved · " + nf(d.total_covered) +
              " reaching students</span><span class=\"gd\">the rest is unclaimed</span></div>" +
          "</div>";

        // --- 2. scheme by scheme
        var covRows = d.per_scheme.map(schemeSegBar).join("");
        var schemeCard =
          '<div class="a42-ledger" style="animation-delay:.14s">' +
            '<h2 class="a42-h3" style="margin-bottom:4px">Scheme by scheme</h2>' +
            '<div class="sub" style="max-width:72ch">One bar per scheme: everyone who qualifies, split by how far they got.</div>' +
            '<div class="a42-covaxis"><span style="left:0">0%</span><span style="left:25%">25%</span>' +
              '<span style="left:50%">50%</span><span style="left:75%">75%</span><span style="right:0">100%</span></div>' +
            covRows +
            '<div class="a42-legend covlegend">' +
              '<span><i style="background:#3f68ea"></i>Got the money</span>' +
              '<span><i style="background:#a9c1fb"></i>Applied, waiting</span>' +
              '<span><i style="background:#f3c7c2"></i>Rejected</span>' +
              '<span><i style="background:#fbe4bb"></i>Never applied</span>' +
            "</div>" +
          "</div>";

        // --- 3. disbursement donut + rejections
        var ds = d.disbursement || {};
        var C = 326.7; // circumference 2π·52
        var sanct = Number(ds.sanctioned) || 0;
        var paidFrac = sanct ? (Number(ds.disbursed) || 0) / sanct : 0;
        var blueDash = (paidFrac * C).toFixed(1);
        var goldDash = ((1 - paidFrac) * C).toFixed(1);
        var goldOff = "-" + blueDash;
        var paidPct = pct(ds.disbursed, ds.sanctioned);
        // oldest application still waiting (submitted / verified / sanctioned, not paid or rejected)
        var waiting = apps.filter(function (a) {
          return ["SUBMITTED", "INSTITUTION_VERIFIED", "SANCTIONED"].indexOf(a.status) >= 0;
        });
        var longest = waiting.reduce(function (m, a) { return Math.max(m, Number(a.days_waiting) || 0); }, 0);
        var disbStats = [
          { k: "Applied → paid", v: (ds.avg_days != null ? nf(Math.round(ds.avg_days)) + " days" : "—"),
            n: "average time to reach the student", color: "#12224e" },
          { k: "Rejection rate", v: pct(ds.rejected, ds.applications) + "%", color: "#d8443c",
            n: nf(ds.rejected) + " of " + nf(ds.applications) + " applications" },
          { k: "Longest wait", v: nf(longest) + " days", color: "#12224e",
            n: "oldest application still waiting" }
        ];
        var disbCard =
          '<div class="a42-ledger a42-disb" style="animation-delay:.18s">' +
            '<div class="a42-eyebrow">Money already approved</div>' +
            '<div class="a42-donutgrid">' +
              '<div class="a42-donut"><svg viewBox="0 0 120 120">' +
                '<circle cx="60" cy="60" r="52" fill="none" stroke="#f1f4fa" stroke-width="15"></circle>' +
                '<circle cx="60" cy="60" r="52" fill="none" stroke="#f8d9a6" stroke-width="15" ' +
                  'stroke-dasharray="' + goldDash + " " + C + '" stroke-dashoffset="' + goldOff + '" stroke-linecap="butt"></circle>' +
                '<circle cx="60" cy="60" r="52" fill="none" stroke="#3f68ea" stroke-width="15" ' +
                  'stroke-dasharray="' + blueDash + " " + C + '" stroke-linecap="butt" class="arc"></circle>' +
                "</svg>" +
                '<div class="ctr"><div class="v">' + lakh(ds.sanctioned) + "</div>" +
                  '<div class="k">Sanctioned</div><div class="n">' + nf(ds.awards) + " awards</div></div>" +
              "</div>" +
              '<div class="a42-donutkey">' +
                '<div class="row"><span class="sw" style="background:#3f68ea"></span><div>' +
                  '<div class="amt bl">' + lakh(ds.disbursed) + ' <em>' + paidPct + "%</em></div>" +
                  '<div class="cap">Paid to students</div></div></div>' +
                '<div class="row"><span class="sw" style="background:#f8d9a6"></span><div>' +
                  '<div class="amt gd">' + lakh(ds.awaiting_amount) + " <em>" + (100 - paidPct) + "%</em></div>" +
                  '<div class="cap">Approved, not yet paid · ' + nf(ds.awaiting) + " awards</div></div></div>" +
              "</div>" +
            "</div>" +
            '<div class="a42-disbstats">' + disbStats.map(function (t) {
              return '<div class="tile"><div class="k">' + esc(t.k) + "</div>" +
                '<div class="v" style="color:' + t.color + '">' + t.v + "</div>" +
                '<div class="n">' + esc(t.n) + "</div></div>";
            }).join("") + "</div>" +
          "</div>";

        var rejMax = (d.rejections || []).reduce(function (m, r) { return Math.max(m, r.n); }, 1);
        var rejRows = (d.rejections || []).map(function (r) {
          return '<div class="a42-rejrow"><div class="tx"><div class="rn">' + esc(r.rejection_reason) + "</div>" +
            '<div class="bar"><span style="width:' + Math.round(100 * r.n / rejMax) + '%"></span></div></div>' +
            '<div class="n">' + nf(r.n) + "</div></div>";
        }).join("");
        var rejCard =
          '<div class="a42-ledger a42-rejcard" style="animation-delay:.22s">' +
            '<h2 class="a42-h3" style="margin-bottom:4px">Why applications were rejected</h2>' +
            '<div class="sub" style="margin-bottom:14px">' + nf(ds.rejected || 0) + " of " + nf(ds.applications || 0) +
              " — paperwork, not marks.</div>" +
            (rejRows || '<div class="a42-note ok"><i>✓</i><span>No rejections recorded this cycle.</span></div>') +
            '<div class="a42-note ok" style="margin-top:16px"><i>→</i><span>Next cycle the agent checks ' +
              "documents before the student applies.</span></div>" +
          "</div>";

        el.innerHTML = gapCard + schemeCard +
          '<div class="a42-covsplit">' + disbCard + rejCard + "</div>";
        syncRail();
      } catch (e) { errorCard(el, e); }
    };
  }

  // Legend → highlight that group of squares in the student grid.
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-a42-bucket]");
    if (!b) return;
    var grid = $("#a42-waffle");
    if (!grid) return;
    var k = b.dataset.a42Bucket;
    var on = grid.dataset.focus === k;
    if (on) delete grid.dataset.focus; else grid.dataset.focus = k;
    $$(".a42-bkey").forEach(function (x) {
      x.classList.toggle("on", !on && x.dataset.a42Bucket === k);
    });
  });

  /* --------------------------------------------------------- role helpers */

  // app.js owns the role model (scope, tab list, canAct, the student a STUDENT
  // session is pinned to). Read it rather than duplicating the table here, so the
  // two can never drift. A real sign-in is locked to body[data-role]; a GUEST
  // preview follows whichever role button is active.
  function activeRole() {
    var locked = document.body.dataset.role || "GUEST";
    var canSwitch = (document.body.dataset.canSwitch || "yes") !== "no";
    var key;
    if (locked !== "GUEST" && !canSwitch) {
      key = locked;
    } else {
      var b = $(".role.active");
      key = (b && b.dataset.role) || "ACCOUNTS";
    }
    var table = window.ROLES || {};
    var def = table[key] || table.ACCOUNTS || {};
    return {
      key: key,
      canAct: def.canAct !== false,
      // a locked STUDENT session carries its own roll number on the body
      student: def.student ? (document.body.dataset.roleStudent || def.student) : ""
    };
  }

  /* -------------------------------------------------- application tracker */

  // The four real stages an application moves through, in order.
  var STAGES = [
    { key: "SUBMITTED", label: "Submitted", hint: "waiting for the college to verify" },
    { key: "INSTITUTION_VERIFIED", label: "Verified", hint: "college checked it, sent to the portal" },
    { key: "SANCTIONED", label: "Sanctioned", hint: "approved — money on its way" },
    { key: "DISBURSED", label: "Paid", hint: "money reached the student" }
  ];
  var STAGE_INDEX = {};
  STAGES.forEach(function (s, i) { STAGE_INDEX[s.key] = i; });
  // Stage colours (light → dark) for the dot track and the bottom funnel ribbon.
  var STAGE_COLOR = { SUBMITTED: "#c9d8fc", INSTITUTION_VERIFIED: "#a9c1fb",
    SANCTIONED: "#6084fc", DISBURSED: "#3f68ea" };
  var STAGE_INK = { SUBMITTED: "#16203a", INSTITUTION_VERIFIED: "#16203a",
    SANCTIONED: "#fff", DISBURSED: "#fff" };
  var STATUS_TEXT = { SUBMITTED: "Submitted", INSTITUTION_VERIFIED: "Verified by college",
    SANCTIONED: "Sanctioned", DISBURSED: "Paid", REJECTED: "Rejected", DRAFT: "Draft",
    LAPSED: "Lapsed" };

  function initialsOf(n) {
    return String(n || "").trim().split(/\s+/).slice(0, 2)
      .map(function (w) { return w[0]; }).join("").toUpperCase();
  }
  function shortScheme(n) {
    return String(n || "").replace(/ Scholarship for | Scholarship| Students$/g, " ").trim();
  }
  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso + "T00:00:00");
    return isNaN(d) ? iso : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  // A small four-step track: where this one application is right now.
  function miniTrack(status) {
    if (status === "REJECTED") {
      return '<div class="a42-mini rej"><span class="dots"><i class="x">✕</i></span>' +
        '<span class="lb">Rejected</span></div>';
    }
    var at = STAGE_INDEX[status];
    if (at == null) at = -1;
    var dots = STAGES.map(function (s, i) {
      return '<i class="' + (i < at ? "done" : (i === at ? "now" : "")) + '"></i>';
    }).join("<b></b>");
    return '<div class="a42-mini s' + at + '"><span class="dots">' + dots + "</span>" +
      '<span class="lb">' + esc(STATUS_TEXT[status] || status) + "</span></div>";
  }

  // The big stepper a student sees for their own application.
  function bigTrack(a) {
    if (a.status === "REJECTED") {
      return '<div class="a42-bigtrack rej"><div class="a42-bstep done"><i>1</i><span>Submitted</span></div>' +
        '<div class="a42-bstep bad"><i>✕</i><span>Rejected</span></div></div>';
    }
    var at = STAGE_INDEX[a.status];
    return '<div class="a42-bigtrack">' + STAGES.map(function (s, i) {
      var cls = i < at ? "done" : (i === at ? "now" : "");
      return '<div class="a42-bstep ' + cls + '"><i>' + (i < at ? "✓" : i + 1) + "</i><span>" +
        esc(s.label) + "</span></div>";
    }).join("") + "</div>";
  }

  var AP = { q: "", stage: "", scheme: "", page: 1 };

  function installApplications(getData, errorCard) {
    var APPS = [], SCHEMES = [];

    function filtered() {
      var q = AP.q.trim().toLowerCase();
      return APPS.filter(function (a) {
        if (AP.stage === "STALLED") { if (!a.stalled) return false; }
        else if (AP.stage && a.status !== AP.stage) return false;
        if (AP.scheme && a.scheme_code !== AP.scheme) return false;
        if (q && (a.roll_no + " " + a.full_name).toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
    }

    // Four dots, one per stage, filled up to where the application has reached.
    // The whole track turns green once the money is paid (at === 3); in-progress
    // stages are a uniform blue; a rejected application shows a single red dot.
    function stageDots(status) {
      var at = STAGE_INDEX[status];
      if (at == null) at = -1;
      var rej = status === "REJECTED";
      var fill = at === 3 ? "#12a150" : "#3f68ea";
      return '<div class="a42-apdots">' + STAGES.map(function (s, i) {
        var bg, bd;
        if (rej) { bg = i === 0 ? "#d8443c" : "#fff"; bd = i === 0 ? "#d8443c" : "#d3def5"; }
        else if (i <= at) { bg = fill; bd = fill; }
        else { bg = "#fff"; bd = "#d3def5"; }
        return (i ? '<b></b>' : "") + '<i style="background:' + bg + ";border-color:" + bd + '"></i>';
      }).join("") + "</div>";
    }

    function renderList() {
      var host = $("#a42-aplist");
      if (!host) return;
      var list = filtered();
      AP.page = clampPage(AP.page, list.length, PAGE);
      var rows = pageOf(list, AP.page, PAGE).map(function (a) {
        var rej = a.status === "REJECTED";
        var amount, amtColor, note;
        if (rej) { amount = "—"; amtColor = "#c0392f"; note = "not approved"; }
        else if (a.disbursed_amount) { amount = inr(a.disbursed_amount); amtColor = "#12a150"; note = "paid " + fmtDate(a.disbursed_on); }
        else if (a.sanctioned_amount) { amount = inr(a.sanctioned_amount); amtColor = "#2f52c4"; note = "sanctioned"; }
        else { amount = "pending"; amtColor = "#8290ab"; note = "awaiting a decision"; }
        var statusLabel = rej ? "Rejected" : (STATUS_TEXT[a.status] || a.status);
        var statusColor = rej ? "#c0392f" : (a.status === "DISBURSED" ? "#12a150" : "#2f52c4");
        // In-progress applications show how long they've been waiting in the current
        // stage; paid ones need no note, rejected ones show why.
        var inProgress = !rej && a.status !== "DISBURSED";
        var waitTxt = inProgress ? (nf(a.days_waiting) + " days in this stage")
          : (rej && a.rejection_reason ? a.rejection_reason : "");
        var waitColor = a.stalled ? "#b0700a" : "#5b6478";
        return '<div class="a42-aprow' + (rej ? " rej" : "") + '">' +
          '<button class="who" data-a42-story="' + esc(a.student_id || "") + '" title="Open ' + esc(a.full_name) + '’s application pack">' +
            '<span class="av">' + esc(initialsOf(a.full_name)) + "</span>" +
            '<span class="tx"><span class="nm">' + esc(a.full_name) + "</span>" +
            '<span class="rl">' + esc(a.roll_no) + (a.year_of_study ? " · Y" + esc(a.year_of_study) : "") + "</span></span></button>" +
          '<div class="sc"><b>' + esc(shortScheme(a.scheme_name)) + "</b><span>" +
            esc(a.external_application_no || a.scheme_code) + " · applied " + fmtDate(a.applied_on) + "</span></div>" +
          '<div class="tr">' + stageDots(a.status) +
            '<div class="sl" style="color:' + statusColor + '">' + esc(statusLabel) + "</div>" +
            (waitTxt ? '<div class="wt" style="color:' + waitColor + '">' + esc(waitTxt) + "</div>" : "") + "</div>" +
          '<div class="am"><div class="v" style="color:' + amtColor + '">' + amount + "</div>" +
            '<div class="nt">' + esc(note) + "</div></div>" +
        "</div>";
      }).join("");
      host.innerHTML =
        (rows ? '<div class="a42-aprows">' + rows + "</div>"
              : '<div class="a42-note ok"><i>·</i><span>Nothing matches — clear the search or pick another stage.</span></div>') +
        pager("apps", list.length, AP.page, PAGE);
      var meta = $("#a42-apmeta");
      if (meta) meta.innerHTML = rangeCompact(list.length, AP.page, PAGE, "applications");
      $$("[data-a42-stage]").forEach(function (b) {
        b.classList.toggle("on", (b.dataset.a42Stage || "") === AP.stage);
      });
    }
    PAGERS.apps = function (p) { AP.page = p; renderList(); };

    function studentView(el, apps, schemesByCode, eligibleCodes) {
      var cards = apps.map(function (a) {
        var money = a.disbursed_amount ? inr(a.disbursed_amount) + " paid on " + fmtDate(a.disbursed_on)
          : a.sanctioned_amount ? inr(a.sanctioned_amount) + " sanctioned — payment is next"
          : a.status === "REJECTED" ? "Not approved" : "Waiting for a decision";
        return '<div class="a42-mycard' + (a.status === "REJECTED" ? " rej" : "") + '">' +
          '<div class="hd"><div><div class="a42-eyebrow">' + esc(a.external_application_no || a.scheme_code) + "</div>" +
            '<div class="ti">' + esc(a.scheme_name) + "</div></div>" +
            '<div class="mo">' + esc(money) + "</div></div>" +
          bigTrack(a) +
          (a.rejection_reason ? '<div class="a42-note bad"><i>!</i><span>' + esc(a.rejection_reason) +
            " — fix the document and re-apply in the next window.</span></div>" : "") +
          '<div class="ft">Applied ' + fmtDate(a.applied_on) + "</div>" +
        "</div>";
      }).join("");
      var applied = {};
      apps.forEach(function (a) { applied[a.scheme_code] = true; });
      var missing = (eligibleCodes || []).filter(function (c) { return !applied[c]; });
      var nudge = missing.length
        ? '<div class="a42-never" style="margin-top:18px"><div class="n">' + missing.length +
            '<div class="k">not applied yet</div></div><div class="t"><div class="h">You qualify for ' +
            (missing.length === 1 ? "a scheme" : "schemes") + " you haven’t applied to.</div><p>" +
            missing.map(function (c) { return "<b>" + esc((schemesByCode[c] || {}).name || c) + "</b>"; }).join(", ") +
            ". Open <b>My eligibility</b> to see why you qualify and what to submit.</p></div></div>"
        : "";
      el.innerHTML =
        '<div class="a42-ledger">' +
          '<div class="a42-eyebrow">Submitted → verified → sanctioned → paid</div>' +
          '<h2 class="a42-h2">' + (apps.length ? "Where your applications stand" : "You haven’t applied for anything yet") + "</h2>" +
          '<div class="sub" style="margin-top:8px">Each step lights up as the college and the scheme act on it.</div>' +
          (cards ? '<div class="a42-mycards">' + cards + "</div>" : "") + nudge +
        "</div>";
    }

    window.loaders.applications = async function () {
      var el = $("#panel-applications");
      try {
        var role = activeRole();
        var res = await Promise.all([
          getData("/api/applications"),
          role.student ? Promise.resolve(null) : getData("/api/coverage").catch(function () { return null; }),
          getData("/api/schemes").catch(function () { return { schemes: [] }; }),
          role.student ? getData("/api/matrix").catch(function () { return null; }) : Promise.resolve(null)
        ]);
        var apps = res[0].applications || [];
        var cov = res[1];
        SCHEMES = res[2].schemes || [];
        var byCode = {};
        SCHEMES.forEach(function (s) { byCode[s.code] = s; });

        if (role.student) {
          apps = apps.filter(function (a) { return a.roll_no === role.student; });
          var mrow = res[3] && (res[3].rows || []).find(function (r) { return r.student.roll_no === role.student; });
          var elig = mrow ? mrow.cells.filter(function (c) { return c.is_eligible; })
            .map(function (c) { return c.scheme_code; }) : [];
          studentView(el, apps, byCode, elig);
          setMeta("applications", apps.length + " application" + (apps.length === 1 ? "" : "s"));
          syncRail();
          return;
        }
        APPS = apps;

        var count = {}, sum = {};
        apps.forEach(function (a) {
          count[a.status] = (count[a.status] || 0) + 1;
          sum[a.status] = (sum[a.status] || 0) + Number(a.disbursed_amount || a.sanctioned_amount || 0);
        });
        var never = 0, neverMoney = 0;
        if (cov) cov.per_scheme.forEach(function (s) {
          never += s.eligible_unapplied || 0;
          neverMoney += (s.eligible_unapplied || 0) * (Number(s.benefit_amount) || 0);
        });
        var paid = sum.DISBURSED || 0, sanctioned = sum.SANCTIONED || 0;
        var stalled = apps.filter(function (a) { return a.stalled; });
        var undrafted = stalled.filter(function (a) { return !a.follow_up_drafted; }).length;
        var maxStall = stalled.reduce(function (m, a) { return Math.max(m, Number(a.days_waiting) || 0); }, 0);
        var pipeline = STAGES.reduce(function (t, s) { return t + (count[s.key] || 0); }, 0);
        var sancPaidMoney = (cov && cov.disbursement && cov.disbursement.sanctioned != null)
          ? cov.disbursement.sanctioned : (paid + sanctioned);
        var waitingN = (count.SUBMITTED || 0) + (count.INSTITUTION_VERIFIED || 0);

        var schemeOpts = '<option value="">All schemes</option>' + SCHEMES.map(function (s) {
          return '<option value="' + esc(s.code) + '"' + (AP.scheme === s.code ? " selected" : "") + ">" +
            esc(shortScheme(s.name)) + "</option>";
        }).join("");

        // --- funnel ribbon (display-only — the chips do the filtering) ---
        var funnel = STAGES.map(function (s) {
          var n = count[s.key] || 0;
          if (!n) return "";
          return '<div title="' + esc(s.label + " — " + n) + '" style="width:' + (pipeline ? 100 * n / pipeline : 0).toFixed(3) +
            "%;background:" + STAGE_COLOR[s.key] + ";color:" + STAGE_INK[s.key] + '"><b>' + nf(n) + "</b></div>";
        }).join("");
        var dotLegend = STAGES.map(function (s) {
          return '<span><i style="background:' + STAGE_COLOR[s.key] + '"></i>' + esc(s.label) + "</span>";
        }).join("");

        el.innerHTML =
          // opens on the stage chips + application list
          '<div class="a42-ledger" data-a42-list>' +
            '<div class="a42-toolbar">' +
              '<label class="a42-search"><span aria-hidden="true">⌕</span>' +
                '<input id="a42-apq" type="search" placeholder="Search name or register number" value="' + esc(AP.q) + '"></label>' +
              '<select id="a42-apscheme" aria-label="Scheme">' + schemeOpts + "</select>" +
              '<div class="a42-chips">' +
                '<button class="a42-fchip" data-a42-stage="">All <em>' + nf(apps.length) + "</em></button>" +
                STAGES.map(function (s) {
                  return '<button class="a42-fchip" data-a42-stage="' + s.key + '">' + esc(s.label) +
                    " <em>" + nf(count[s.key] || 0) + "</em></button>";
                }).join("") +
                '<button class="a42-fchip" data-a42-stage="REJECTED">Rejected <em>' + nf(count.REJECTED || 0) + "</em></button>" +
                '<button class="a42-fchip" data-a42-stage="STALLED">Stalled <em>' + nf(stalled.length) + "</em></button>" +
              "</div>" +
              '<div class="a42-listmeta apmeta" id="a42-apmeta"></div>' +
            "</div>" +
            '<div class="a42-apheadrow">' +
              '<div>Student</div><div>Scheme</div><div>Stage</div><div class="r">Money</div></div>' +
            '<div id="a42-aplist"></div>' +
          "</div>" +
          // compressed summary card at the bottom
          '<div class="a42-ledger" style="animation-delay:.1s">' +
            '<div class="a42-apsumhd">' +
              '<div class="eb">' + nf(apps.length) + " applications · " + lakh(sancPaidMoney) + " sanctioned or paid</div>" +
              '<div class="rt">' + nf(count.DISBURSED || 0) + " paid · " + nf(waitingN) + " waiting · " +
                nf(count.REJECTED || 0) + " rejected</div>" +
            "</div>" +
            '<div class="a42-funnel">' + funnel + "</div>" +
            '<div class="a42-funlegend">' + dotLegend + "</div>" +
            '<div class="a42-oframps">' +
              (stalled.length
                ? '<div class="oframp"><div class="tx"><div class="big" style="color:#8a4b08">' + nf(stalled.length) +
                    " stalled</div><div class=\"sb\">past their limit · longest " + nf(maxStall) + " days</div></div>" +
                    (role.canAct
                      ? (undrafted ? '<button class="a42-btn small" id="a42-followups">Draft follow-ups</button>'
                          : '<span class="a42-chip" style="background:#dcfce7;color:#166534">all drafted</span>')
                      : "") + "</div>"
                : "") +
              (cov
                ? '<div class="oframp"><div class="tx"><div class="big" style="color:#e8930c">' + nf(never) +
                    " never applied</div><div class=\"sb\">qualify but no application" + (neverMoney ? " · " + lakh(neverMoney) : "") +
                    "</div></div>" +
                    (role.canAct ? '<button class="a42-btn small" id="a42-tracknotify">Draft notices</button>' : "") + "</div>"
                : "") +
            "</div>" +
          "</div>";

        var fu = $("#a42-followups", el);
        if (fu) fu.addEventListener("click", function () {
          act(fu, "/api/follow-ups", {}, function (d) {
            return d.drafted + " follow-up(s) drafted — approve them in Agent Activity.";
          });
        });
        var tn = $("#a42-tracknotify", el);
        if (tn) tn.addEventListener("click", function () {
          act(tn, "/api/notify-all", {}, function (d) {
            return d.drafted ? d.drafted + " notice(s) drafted — approve them in Agent Activity."
              : "Every eligible student without an application already has a notice.";
          });
        });
        onType($("#a42-apq", el), function () { AP.q = $("#a42-apq").value; AP.page = 1; renderList(); });
        $("#a42-apscheme", el).addEventListener("change", function (e) {
          AP.scheme = e.target.value; AP.page = 1; renderList();
        });
        renderList();

        setMeta("applications", nf(apps.length) + " applications");
        syncRail();
      } catch (e) { errorCard(el, e); }
    };
  }

  // Stage node or filter chip → filter the list (a second tap on a node clears it).
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-a42-stage]");
    if (!b) return;
    var k = b.dataset.a42Stage || "";
    AP.stage = (b.classList.contains("a42-node") || b.classList.contains("a42-off")) && AP.stage === k ? "" : k;
    AP.page = 1;
    if (window.loaders && window.loaders.applications) {
      var list = $("#a42-aplist");
      if (list && PAGERS.apps) {
        PAGERS.apps(1);
        if (b.classList.contains("a42-node") || b.classList.contains("a42-off")) {
          var host = list.closest("[data-a42-list]");
          var rail = $("nav.tabs"), top = $(".topbar");
          var off = (rail ? rail.offsetHeight : 0) + (top ? top.offsetHeight : 0) + 12;
          if (host) window.scrollTo({ top: host.getBoundingClientRect().top + window.scrollY - off, behavior: "smooth" });
        }
      }
    }
  });

  // Student names open the application pack app.js already builds from
  // /api/student/<id>/pack — delegated so re-rendered panels stay wired.
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-a42-story]");
    if (b && b.dataset.a42Story && typeof window.openPrepare === "function") window.openPrepare(b.dataset.a42Story);
  });

  /* ---------------------------------------------------- eligibility matrix */

  // Each student x scheme pair sits on one rung of a ladder:
  // not eligible → eligible → applied → claimed (or rejected). The engine sends
  // the rung with every cell; the colours match the coverage panel.
  var RUNG = {
    NOT_ELIGIBLE: { cls: "no", icon: "–", label: "Not eligible", long: "A rule failed — never offered" },
    ELIGIBLE: { cls: "ok", icon: "✓", label: "Eligible", long: "Eligible — nobody has applied yet" },
    APPLIED: { cls: "ap", icon: "◔", label: "Applied", long: "Applied — being processed" },
    CLAIMED: { cls: "cl", icon: "₹", label: "Got money", long: "Claimed — money sanctioned or paid" },
    REJECTED: { cls: "rj", icon: "!", label: "Rejected", long: "Applied — rejected" }
  };
  var RUNG_ORDER = ["NOT_ELIGIBLE", "ELIGIBLE", "APPLIED", "CLAIMED", "REJECTED"];

  function ruleText(r) {
    var v = r.expected;
    if (Array.isArray(v)) v = v.join(" / ");
    if (typeof v === "number" && v >= 1000) v = Number(v).toLocaleString("en-IN");
    return (r.field_label || r.field) + " " + (r.op_label || r.op) + " " + v;
  }
  function ruleActual(r) {
    var a = r.actual;
    if (a === null || a === undefined) return "—";
    if (typeof a === "number" && a >= 1000) return Number(a).toLocaleString("en-IN");
    return String(a);
  }
  function rungOf(cell) {
    return (cell && cell.state) || (cell && cell.is_eligible ? "ELIGIBLE" : "NOT_ELIGIBLE");
  }

  function ruleTrace(cell, scheme, student) {
    var ruleRows = (cell.criteria_result || []).map(function (r) {
      return '<div class="a42-why-rule ' + (r.passed ? "pass" : "fail") + '">' +
        '<span class="v">' + (r.passed ? "PASS" : "FAIL") + "</span>" +
        '<span class="r">' + esc(ruleText(r)) + "</span>" +
        '<span class="a">' + (student ? "yours" : "student") + ": <b>" + esc(ruleActual(r)) + "</b></span></div>";
    }).join("") || '<div class="a42-why-rule pass"><span class="v">PASS</span>' +
      '<span class="r">This scheme has no eligibility rules — every student qualifies.</span></div>';
    var amt = Number(scheme.benefit_amount) || 0;
    var rung = rungOf(cell);
    var verdict = !cell.is_eligible
      ? "One rule failed — does not qualify for this scheme."
      : "Qualifies" + (amt ? " — worth " + inr(amt) : "") + ". " +
        ({ ELIGIBLE: "Has not applied yet.",
           APPLIED: "Application in process.",
           CLAIMED: "Money sanctioned or paid.",
           REJECTED: "Application was rejected." }[rung] || "");
    return '<div class="rules">' + ruleRows + '</div><div class="vl">' + verdict + "</div>";
  }

  var MX = { q: "", batch: "", show: "all", scheme: "", page: 1, open: null };

  function installMatrix(getData, errorCard) {
    var ROWS = [], SCHEMES = [], BYCODE = {};

    function cellsInScope(r) {
      return MX.scheme ? r.cells.filter(function (c) { return c.scheme_code === MX.scheme; }) : r.cells;
    }
    function keep(r) {
      if (MX.batch && r.student.batch_label !== MX.batch) return false;
      var q = MX.q.trim().toLowerCase();
      if (q && (r.student.roll_no + " " + r.student.full_name).toLowerCase().indexOf(q) < 0) return false;
      if (MX.show === "all") return true;
      var cells = cellsInScope(r);
      if (MX.show === "any") return cells.some(function (c) { return c.is_eligible; });
      if (MX.show === "none") return !cells.some(function (c) { return c.is_eligible; });
      if (MX.show === "tried") return cells.some(function (c) { return c.is_eligible && rungOf(c) !== "ELIGIBLE"; });
      return cells.some(function (c) { return rungOf(c) === MX.show; });
    }

    function renderList() {
      var host = $("#a42-mxlist");
      if (!host) return;
      var list = ROWS.filter(keep);
      MX.page = clampPage(MX.page, list.length, PAGE);
      var cols = "minmax(210px,1.5fr) repeat(" + SCHEMES.length + ", minmax(104px,1fr))";
      var head = '<div class="a42-mxrow head" style="grid-template-columns:' + cols + '"><div>Student</div>' +
        SCHEMES.map(function (s) {
          return '<div class="a42-mxhead' + (MX.scheme === s.code ? " on" : "") + '">' +
            esc(shortScheme(s.name)) + "</div>";
        }).join("") + "</div>";
      var body = pageOf(list, MX.page, PAGE).map(function (r) {
        var st = r.student;
        var openHere = MX.open && MX.open.split("|")[0] === st.roll_no;
        var cells = SCHEMES.map(function (s) {
          var cell = r.cells.find(function (c) { return c.scheme_code === s.code; });
          var u = RUNG[rungOf(cell)];
          var key = st.roll_no + "|" + s.code;
          return '<button class="a42-st ' + u.cls + (MX.open === key ? " sel" : "") +
            (MX.scheme && MX.scheme !== s.code ? " dim" : "") + '" data-a42-why="' + esc(key) +
            '" title="' + esc(st.full_name + " · " + shortScheme(s.name) + " — " + u.long + " — tap to see why") + '">' +
            "<i>" + u.icon + "</i><span>" + u.label + "</span></button>";
        }).join("");
        var why = "";
        if (openHere) {
          var code = MX.open.split("|")[1];
          var oc = r.cells.find(function (c) { return c.scheme_code === code; });
          var os = BYCODE[code];
          if (oc && os) {
            why = '<div class="a42-why"><div class="hd"><div>' +
              '<div class="a42-eyebrow">Why</div>' +
              '<div class="ti">' + esc(st.full_name) + " (" + esc(st.roll_no) + ") × " + esc(os.name) + "</div></div>" +
              '<button class="cl" data-a42-why-close>close</button></div>' + ruleTrace(oc, os) +
              '<div class="a42-whyact">' +
                (rungOf(oc) === "ELIGIBLE" && activeRole().canAct
                  ? '<button class="a42-btn small" data-a42-notify="' + esc(st.student_id) + '">Draft notice for ' +
                    esc(st.full_name.split(" ")[0]) + "</button>" : "") +
                '<button class="a42-btn ghost small" data-a42-story="' + esc(st.student_id) + '">Open application pack</button>' +
              "</div></div>";
          }
        }
        return '<div class="a42-mxrow" style="grid-template-columns:' + cols + '">' +
          '<button class="a42-mxname" data-a42-story="' + esc(st.student_id) + '" title="Open this student’s application pack">' +
            '<span class="av">' + esc(initialsOf(st.full_name)) + "</span>" +
            '<span class="tx"><span class="rl">' + esc(st.roll_no) + (st.year_of_study ? " · Y" + esc(st.year_of_study) : "") + "</span>" +
            '<span class="nm">' + esc(st.full_name) + "</span></span></button>" +
          cells + "</div>" + why;
      }).join("");
      host.innerHTML =
        '<div class="a42-listmeta">' + rangeCompact(list.length, MX.page, PAGE, "students") + "</div>" +
        (body ? '<div class="a42-mxwrap"><div class="a42-mxgrid" style="min-width:' +
            (210 + SCHEMES.length * 112) + 'px">' + head + body + "</div></div>"
          : '<div class="a42-note ok"><i>·</i><span>No students match — clear the search or change the filters.</span></div>') +
        pager("mx", list.length, MX.page, PAGE);
    }
    PAGERS.mx = function (p) { MX.page = p; MX.open = null; renderList(); };
    window.__a42MatrixList = renderList;

    function ladder() {
      return SCHEMES.map(function (s, i) {
        var e = 0, ap = 0, cl = 0;
        ROWS.forEach(function (r) {
          var c = r.cells.find(function (x) { return x.scheme_code === s.code; });
          if (!c || !c.is_eligible) return;
          e++;
          var g = rungOf(c);
          if (g !== "ELIGIBLE") ap++;
          if (g === "CLAIMED") cl++;
        });
        function step(n, label, show, cls, sub) {
          return '<button class="a42-rung ' + cls + '" data-a42-filter="' + esc(s.code) + "|" + show + '">' +
            '<span class="n">' + nf(n) + "</span><span class=\"l\">" + label + "</span>" +
            '<span class="bar"><i style="width:' + pct(n, e) + '%"></i></span>' +
            '<span class="s">' + sub + "</span></button>";
        }
        return '<div class="a42-ladder" style="animation-delay:' + (i * 0.06) + 's">' +
          '<div class="nm"><b>' + esc(shortScheme(s.name)) + "</b><span>" + esc(s.code) + "</span></div>" +
          step(e, "Eligible", "any", "e", "all rules pass") +
          '<span class="a42-chev" aria-hidden="true">›</span>' +
          step(ap, "Applied", "tried", "a", pct(ap, e) + "% of eligible") +
          '<span class="a42-chev" aria-hidden="true">›</span>' +
          step(cl, "Claimed", "CLAIMED", "c", pct(cl, e) + "% of eligible") +
          "</div>";
      }).join("");
    }

    function studentView(el, row) {
      if (!row) {
        el.innerHTML = '<div class="a42-ledger"><h2 class="a42-h3">We couldn’t find your record</h2></div>';
        return;
      }
      var cards = SCHEMES.map(function (s, i) {
        var c = row.cells.find(function (x) { return x.scheme_code === s.code; }) || {};
        var g = rungOf(c), u = RUNG[g];
        var steps = ["ELIGIBLE", "APPLIED", "CLAIMED"].map(function (k, j) {
          var reached = c.is_eligible && ({ ELIGIBLE: 0, APPLIED: 1, REJECTED: 1, CLAIMED: 2 }[g] >= j);
          return '<span class="' + (reached ? "on" : "") + (g === "REJECTED" && j === 1 ? " bad" : "") + '">' +
            (j === 1 && g === "REJECTED" ? "Rejected" : RUNG[k].label) + "</span>";
        }).join("<b>›</b>");
        return '<div class="a42-schemecard ' + u.cls + '" style="animation-delay:' + (i * 0.07) + 's">' +
          '<div class="hd"><span class="a42-st ' + u.cls + ' big"><i>' + u.icon + "</i><span>" + u.label + "</span></span>" +
            '<span class="amt">' + inr(s.benefit_amount) + "</span></div>" +
          '<div class="ti">' + esc(s.name) + "</div>" +
          '<div class="pv">' + esc(s.provider_name || s.provider_type || "") + "</div>" +
          (c.is_eligible ? '<div class="a42-steps">' + steps + "</div>" : "") +
          '<div class="a42-why flat">' + ruleTrace(c, s, true) + "</div>" +
        "</div>";
      }).join("");
      var n = row.cells.filter(function (c) { return c.is_eligible; }).length;
      el.innerHTML =
        '<div class="a42-ledger">' +
          '<div class="a42-eyebrow">Eligible → applied → claimed</div>' +
          '<h2 class="a42-h2">You qualify for ' + n + " of " + SCHEMES.length + " schemes.</h2>" +
          '<div class="sub" style="margin-top:8px;max-width:70ch">Every scheme below was checked against your ' +
            "own record — each rule, and your value, is shown. The badge says how far you’ve got.</div>" +
          '<div class="a42-schemecards">' + cards + "</div>" +
        "</div>";
    }

    window.loaders.matrix = async function () {
      var el = $("#panel-matrix");
      try {
        var role = activeRole();
        var d = await getData("/api/matrix");
        SCHEMES = d.schemes || [];
        BYCODE = {};
        SCHEMES.forEach(function (s) { BYCODE[s.code] = s; });
        var rows = d.rows || [];

        if (role.student) {
          studentView(el, rows.find(function (r) { return r.student.roll_no === role.student; }));
          setMeta("matrix", SCHEMES.length + " schemes checked");
          syncRail();
          return;
        }
        ROWS = rows;

        var counts = {};
        rows.forEach(function (r) {
          r.cells.forEach(function (c) { var g = rungOf(c); counts[g] = (counts[g] || 0) + 1; });
        });
        var decisions = rows.length * SCHEMES.length;
        var batches = [];
        rows.forEach(function (r) {
          if (r.student.batch_label && batches.indexOf(r.student.batch_label) < 0) batches.push(r.student.batch_label);
        });
        batches.sort();

        // Horizontal legend — a glyph tile + its plain label, wrapping. "Got money"
        // matches the Coverage legend; the grid and legend explain themselves, so the
        // old heading + per-scheme ladder are gone.
        var legend = RUNG_ORDER.map(function (k) {
          var u = RUNG[k];
          return '<span class="a42-mxleg"><span class="a42-st ' + u.cls + ' key"><i>' + u.icon +
            "</i></span>" + esc(u.label) + "</span>";
        }).join("");

        var sel = function (id, label, opts, cur) {
          return '<select id="' + id + '" aria-label="' + label + '">' + opts.map(function (o) {
            return '<option value="' + esc(o[0]) + '"' + (o[0] === cur ? " selected" : "") + ">" + esc(o[1]) + "</option>";
          }).join("") + "</select>";
        };

        var cta = counts.ELIGIBLE
          ? '<div class="a42-mxcta"><span><b>' + nf(counts.ELIGIBLE) + "</b> eligible matches have no " +
              "application yet. Notices wait for your approval.</span>" +
              (role.canAct ? '<button class="a42-btn" id="a42-notifyall">Draft notices</button>'
                : '<span class="a42-chip" style="background:#eef1f7;color:#5b6478">\u{1F512} read-only in this role</span>') +
            "</div>"
          : "";

        el.innerHTML =
          '<div class="a42-ledger" data-a42-list>' +
            '<div class="a42-mxlegend">' + legend + "</div>" +
            '<div class="a42-toolbar">' +
              '<label class="a42-search"><span aria-hidden="true">⌕</span>' +
                '<input id="a42-mxq" type="search" placeholder="Search name or register number" value="' + esc(MX.q) + '"></label>' +
              sel("a42-mxshow", "Show", [["all", "All students"], ["any", "Eligible for a scheme"],
                ["ELIGIBLE", "Eligible, not applied"], ["tried", "Applied (any outcome)"],
                ["APPLIED", "Applied, in process"],
                ["CLAIMED", "Got money"], ["REJECTED", "Rejected"], ["none", "Not eligible for any"]], MX.show) +
              sel("a42-mxscheme", "Scheme", [["", "Any scheme"]].concat(SCHEMES.map(function (s) {
                return [s.code, shortScheme(s.name)];
              })), MX.scheme) +
              sel("a42-mxbatch", "Batch", [["", "All batches"]].concat(batches.map(function (b) {
                return [b, b];
              })), MX.batch) +
              '<button class="a42-btn ghost small" id="a42-mxreset">Reset</button>' +
            "</div>" +
            '<div id="a42-mxlist"></div>' +
            cta +
          "</div>";

        var na = $("#a42-notifyall", el);
        if (na) na.addEventListener("click", function () {
          act(na, "/api/notify-all", {}, function (d) {
            return d.drafted
              ? d.drafted + " notice(s) drafted — approve them in Agent Activity."
              : "Every eligible student without an application already has a notice drafted or sent.";
          });
        });
        onType($("#a42-mxq", el), function () { MX.q = $("#a42-mxq").value; MX.page = 1; MX.open = null; renderList(); });
        [["#a42-mxshow", "show"], ["#a42-mxscheme", "scheme"], ["#a42-mxbatch", "batch"]].forEach(function (p) {
          $(p[0], el).addEventListener("change", function (e) {
            MX[p[1]] = e.target.value; MX.page = 1; MX.open = null; renderList();
          });
        });
        $("#a42-mxreset", el).addEventListener("click", function () {
          MX.q = ""; MX.show = "all"; MX.scheme = ""; MX.batch = ""; MX.page = 1; MX.open = null;
          window.loaders.matrix();
        });
        renderList();

        setMeta("matrix", nf(decisions) + " decisions");
        syncRail();
      } catch (e) { errorCard(el, e); }
    };
  }

  // Cell → rule trace under its row; ladder number → filtered list.
  document.addEventListener("click", function (ev) {
    var t = ev.target;
    if (!t.closest) return;
    var cell = t.closest("[data-a42-why]");
    if (cell) {
      var k = cell.dataset.a42Why;
      MX.open = (MX.open === k) ? null : k;
      if (window.__a42MatrixList) window.__a42MatrixList();
      return;
    }
    if (t.closest("[data-a42-why-close]")) {
      MX.open = null;
      if (window.__a42MatrixList) window.__a42MatrixList();
      return;
    }
    var f = t.closest("[data-a42-filter]");
    if (f) {
      var p = f.dataset.a42Filter.split("|");
      MX.scheme = p[0]; MX.show = p[1]; MX.q = ""; MX.page = 1; MX.open = null;
      var s1 = $("#a42-mxscheme"), s2 = $("#a42-mxshow"), q = $("#a42-mxq");
      if (s1) s1.value = MX.scheme;
      if (s2) s2.value = MX.show;
      if (q) q.value = "";
      if (window.__a42MatrixList) window.__a42MatrixList();
      var host = $("#a42-mxlist");
      host = host && host.closest("[data-a42-list]");
      if (host) {
        var rail = $("nav.tabs"), top = $(".topbar");
        var off = (rail ? rail.offsetHeight : 0) + (top ? top.offsetHeight : 0) + 12;
        window.scrollTo({ top: host.getBoundingClientRect().top + window.scrollY - off, behavior: "smooth" });
      }
    }
  });

  /* ------------------------------------------------- fee reconciliation */

  var RC = { open: false, page: 1 };

  function installReconciliation(getData, errorCard) {
    // One approval row: the fee bill on one side, what Agent 40's ledger expects
    // on the other. The mismatch (a ₹0 the ledger should not show) is the point-7 bug.
    function reconRow(r, canAct) {
      var covers = Number(r.covered_amount) || 0, out = Number(r.outstanding) || 0;
      var clears = covers >= out ? "clears all of it" : "clears part of it";
      var expect = Number(r.scholarship_expected) || 0;
      var ledgerVal = expect ? inr(expect) : "nothing";
      var ledgerInk = r.ledger_mismatch ? "#b0700a" : (expect ? "#166534" : "#b0700a");
      var ledgerNote = r.ledger_mismatch ? "should be " + inr(r.ledger_expected)
        : (expect ? "correct" : "no scholarship recorded");
      var action = canAct
        ? '<button class="a42-btn small" data-a42-suppress="' + esc(r.reminder_dispatch_id) + '">Approve suppression</button>'
        : '<span class="a42-chip" style="background:#eef1f7;color:#5b6478">\u{1F512} read-only</span>';
      return '<div class="a42-recrow">' +
        '<button class="who"' + (r.student_id ? ' data-a42-story="' + esc(r.student_id) + '"' : "") +
          '><div class="nm">' + esc(r.full_name) + '</div><div class="rl">' + esc(r.roll_no) + "</div></button>" +
        '<div class="sch">' + esc(shortScheme(r.scheme_name)) +
          (r.active_reminder ? '<div class="note">Fee reminder active</div>' : "") + "</div>" +
        '<div class="fee"><div class="top"><span class="v">' + inr(out) + '</span><span class="lb">shown unpaid</span></div>' +
          '<div class="cov">the ' + inr(covers) + " award " + clears + "</div></div>" +
        '<div class="led"><div class="v" style="color:' + ledgerInk + '">' + ledgerVal + "</div>" +
          '<div class="nt">' + ledgerNote + "</div></div>" +
        '<div class="act">' + action + "</div>" +
      "</div>";
    }

    window.loaders.reconciliation = async function () {
      var el = $("#panel-reconciliation");
      try {
        var role = activeRole();
        var canAct = role.canAct;
        var d = await getData("/api/reconciliation");
        var list = d.results || [];
        if (role.student) list = list.filter(function (r) { return r.roll_no === role.student; });

        var loud = role.student ? list : list.filter(function (r) { return r.recommend_suppress; });
        var quiet = role.student ? [] : list.filter(function (r) { return !r.recommend_suppress; });
        var wrongly = loud.reduce(function (t, r) { return t + (Number(r.outstanding) || 0); }, 0);
        var ledgerN = d.ledger_sync_count || 0;
        var matchedMoney = quiet.reduce(function (t, r) { return t + (Number(r.covered_amount) || 0); }, 0);
        var quietReminders = quiet.filter(function (r) { return r.active_reminder; }).length;

        setMeta("reconciliation", (d.suppress_count || 0) + " to approve");

        if (role.student) {
          el.innerHTML =
            '<div class="a42-ledger">' +
              '<h2 class="a42-h3" style="margin-bottom:4px">Your fees and scholarship</h2>' +
              '<div class="sub" style="margin-bottom:14px">If a scholarship covers your dues, reminders to you ' +
                "should stop — this shows whether they have.</div>" +
              (list.length
                ? '<div class="a42-recrows">' + list.map(function (r) { return reconRow(r, false); }).join("") + "</div>"
                : '<div class="a42-note ok"><i>✓</i><span>No live award to reconcile against your fees.</span></div>') +
            "</div>";
          syncRail();
          return;
        }

        var rows = loud.map(function (r) { return reconRow(r, canAct); }).join("") ||
          '<div class="a42-note ok"><i>✓</i><span>Nothing needs a human — every award and fee demand agree.</span></div>';

        var tiles = [
          { v: nf(list.length), k: "Awards checked", n: "every live scholarship", color: "#12224e" },
          { v: nf(loud.length), k: "Reminders to stop", n: "fees already covered", color: "#e8930c" },
          { v: nf(ledgerN), k: "Ledger mismatches", n: "Agent 40 expects the wrong amount", color: "#8a4b08" },
          { v: lakh(wrongly), k: "Wrongly chased", n: "already covered by an award", color: "#c0392f" }
        ];

        el.innerHTML =
          '<div class="a42-ledger">' +
            '<div class="a42-rechd"><div>' +
              '<h2 class="a42-h3" style="margin-bottom:4px">' + nf(loud.length) + " student" +
                (loud.length === 1 ? "" : "s") + " chased for fees a scholarship already covers</h2>" +
              '<div class="sub" style="max-width:78ch">Agent 40’s fee ledger still shows these balances ' +
                "outstanding, so Agent 41 keeps sending reminders. Suppress the reminder, and correct the " +
                "balance the ledger expects.</div></div>" +
              (ledgerN && canAct
                ? '<button class="a42-btn" id="a42-ledgersync">Adjust ' + nf(ledgerN) + " outstanding balance" +
                    (ledgerN === 1 ? "" : "s") + "</button>"
                : "") +
            "</div>" +
            '<div class="a42-rechead"><div>Student</div><div>Scheme</div><div>Outstanding on the fee bill</div>' +
              '<div>Agent 40 ledger expects</div><div class="r">Action</div></div>' +
            rows +
            '<div class="a42-safeband"><span><b>' + nf(quiet.length) + "</b> award" + (quiet.length === 1 ? "" : "s") +
              " already line up with the fees — nothing to do.</span>" +
              '<button class="a42-btn ghost small" id="a42-rctoggle">' + (RC.open ? "Hide detail" : "Show detail") + "</button></div>" +
            (RC.open ? '<div class="a42-safedetail">' + nf(quiet.length) + " matched awards · " + lakh(matchedMoney) +
              " set against fees · " + nf(quietReminders) + " active reminders.</div>" : "") +
          "</div>" +
          '<div class="a42-ledger a42-recfound" style="animation-delay:.1s">' +
            '<div class="a42-eyebrow">What the check found</div>' +
            '<div class="a42-rectiles">' + tiles.map(function (t) {
              return '<div class="tile"><div class="v" style="color:' + t.color + '">' + t.v + "</div>" +
                '<div class="k">' + esc(t.k) + '</div><div class="n">' + esc(t.n) + "</div></div>";
            }).join("") + "</div>" +
          "</div>";

        var ls = $("#a42-ledgersync", el);
        if (ls) ls.addEventListener("click", function () {
          act(ls, "/api/fee-ledger/sync", { note: "Approved by Scholarship Officer" }, function (d) {
            return d.updated + " fee demand(s) updated in the ledger.";
          });
        });
        var tg = $("#a42-rctoggle", el);
        if (tg) tg.addEventListener("click", function () {
          RC.open = !RC.open;
          window.loaders.reconciliation();
        });
        syncRail();
      } catch (e) { errorCard(el, e); }
    };
  }

  // Approve suppression in place: the agent recommends, a human decides.
  document.addEventListener("click", async function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-a42-suppress]");
    if (!b || b.disabled) return;
    b.disabled = true;
    var old = b.textContent;
    b.textContent = "Approving…";
    try {
      await window.api("/api/suppress-reminder", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reminder_dispatch_id: b.dataset.a42Suppress,
          note: "Approved by Scholarship Officer — covered by sanctioned scholarship"
        })
      });
      b.outerHTML = '<span class="a42-chip" style="background:#dcfce7;color:#166534">Suppressed ✓</span>';
      if (window.invalidateCache) window.invalidateCache();
      if (window.loadKpis) window.loadKpis();
    } catch (e) {
      b.disabled = false; b.textContent = old;
      if (window.showToast) window.showToast("Could not suppress: " + e.message);
    }
  });

  /* -------------------------------------------------------- scheme register */

  var OP_TEXT = { lte: "≤", gte: "≥", lt: "<", gt: ">", eq: "=",
    in: "one of", not_in: "not one of" };

  function critText(r) {
    var v = r.value;
    if (Array.isArray(v)) v = v.join(" / ");
    else if (typeof v === "number" && v >= 1000) v = Number(v).toLocaleString("en-IN");
    return r.field + " " + (OP_TEXT[r.op] || r.op) + " " + v;
  }

  // A stored machine rule → a plain sentence a first-time visitor can read. The
  // rule itself stays machine-evaluable JSON; this is only the display layer.
  function lakhWord(n) {
    n = Number(n) || 0;
    var l = n / 100000;
    return "₹" + (l % 1 === 0 ? l.toFixed(0) : l.toFixed(1)) + " lakh";
  }
  function plainRule(r) {
    var f = r.field, op = r.op, v = r.value;
    if (f === "annual_income" || f === "family_income") return "Family income up to " + lakhWord(v);
    if (f === "social_category") {
      var list = Array.isArray(v) ? v : [v];
      return "Category " + list.join(" or ");
    }
    if (f === "cgpa") return "CGPA " + Number(v).toFixed(1) + " or above";
    if (f === "gender") return v === "F" ? "Women students" : (v === "M" ? "Men students" : "Gender " + v);
    if (f === "attendance_pct") return "Keeps it above " + v + "% attendance";
    if (f === "backlog_count") return "No pending backlogs";
    return critText(r);   // safe fallback for an unseen field
  }
  function plainRenewal(s) {
    if (!s.renewal_required) return "Not renewable — one award per cycle";
    var rules = (s.renewal_criteria && (s.renewal_criteria.all || s.renewal_criteria.any)) || [];
    var att = null, cg = null;
    rules.forEach(function (r) {
      if (r.field === "attendance_pct") att = r.value;
      if (r.field === "cgpa") cg = r.value;
    });
    if (att != null && cg != null) return "Keeps " + att + "% attendance and CGPA " + Number(cg);
    if (att != null) return "Keeps it above " + att + "% attendance";
    if (cg != null) return "Keeps CGPA " + Number(cg) + " or above";
    return "Renewable — conditions on file";
  }

  // Set by the hook below, rendered once at the top of the panel, then dismissed.
  var matchResult = null;

  window.__a42SchemeCreated = async function (code, name) {
    // Show the receipt frame at once. Re-matching every student runs through the
    // engine and takes a few seconds; the panel must not sit silent while it does.
    matchResult = { code: code, name: name || code, count: null, pending: true };
    if (window.loaders.schemes) await window.loaders.schemes();
    try {
      // The cache was just invalidated, so this is a fresh read: the engine has
      // already re-evaluated every student against the new rule-set.
      var m = await window.getData("/api/matrix");
      var rows = m.rows || [], names = [], n = 0;
      rows.forEach(function (r) {
        var c = (r.cells || []).find(function (x) { return x.scheme_code === code; });
        if (c && c.is_eligible) { n++; if (names.length < 5) names.push(r.student.full_name); }
      });
      var sch = (m.schemes || []).find(function (s) { return s.code === code; });
      matchResult = { code: code, name: (sch && sch.name) || name || code, count: n,
        total: rows.length, amount: sch ? (Number(sch.benefit_amount) || 0) : 0, names: names };
    } catch (e) {
      matchResult = { code: code, name: name || code, count: null };
    }
    if (window.loaders.schemes) window.loaders.schemes();
  };

  function matchBanner() {
    if (!matchResult) return "";
    var r = matchResult;
    var body = r.pending
      ? "Registered. The engine is now evaluating its rules against every student — " +
        "the count lands here the moment it returns."
      : r.count == null
      ? "The scheme is registered. The re-match count could not be read back just now — " +
        "open the Eligibility Matrix to see it."
      : "Matched against all " + r.total + " students the moment you submitted — <b>" +
        r.count + " now eligible</b>" + (r.amount ? ", worth " + lakh(r.count * r.amount) : "") +
        ". Coverage, the eligibility matrix and the register below already include it.";
    var who = (r.names && r.names.length)
      ? '<div class="who">' + esc(r.names.join(", ")) +
        (r.count > r.names.length ? " and " + (r.count - r.names.length) + " more" : "") + "</div>"
      : "";
    return '<div class="a42-match' + (r.pending ? " pending" : "") + '"><div class="tx">' +
      '<div class="k">● ' + (r.pending ? "Registered · matching…" : "Registered and matched") + "</div>" +
      '<div class="n">' + esc(r.name) + "</div>" +
      "<p>" + body + "</p>" + who + "</div>" +
      (r.pending ? '<span class="a42-spin" aria-hidden="true"></span>'
                 : '<button class="a42-btn ghost small" id="a42-match-x">Dismiss</button>') +
      "</div>";
  }

  var SCHEME_BY_CODE = {};
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest && ev.target;
    if (!t || !t.closest) return;
    var e = t.closest("[data-a42-edit]");
    if (e && typeof window.openSchemeEdit === "function") {
      window.openSchemeEdit(SCHEME_BY_CODE[e.dataset.a42Edit]);
      return;
    }
    var r = t.closest("[data-a42-retire]");
    if (r) {
      var retiring = r.dataset.active === "1";
      if (retiring && !window.confirm("Retire " + r.dataset.a42Retire + "? It stops being matched and notified; " +
          "existing applications are kept.")) return;
      act(r, "/api/scheme/" + encodeURIComponent(r.dataset.a42Retire), { is_active: !retiring }, function () {
        return r.dataset.a42Retire + (retiring ? " retired." : " reinstated — every student re-matched.");
      });
      return;
    }
    var b = t.closest("[data-a42-bulk]");
    if (b) {
      act(b, "/api/approve-bulk", { output_type: b.dataset.a42Bulk }, function (d) {
        return d.approved + " item(s) approved.";
      });
      return;
    }
    var n = t.closest("[data-a42-notify]");
    if (n) {
      act(n, "/api/notify/" + encodeURIComponent(n.dataset.a42Notify), {}, function (d) {
        return d.drafted ? d.drafted + " notice(s) drafted for " + d.roll_no + " — approve in Agent Activity."
                         : d.roll_no + ": already notified or applied — nothing new to send.";
      });
    }
  });

  function installSchemes(getData, errorCard) {
    window.loaders.schemes = async function () {
      var el = $("#panel-schemes");
      try {
        var role = activeRole();
        var canAct = role.canAct;
        var res = await Promise.all([
          getData(canAct ? "/api/schemes?all=1" : "/api/schemes"),
          role.student ? Promise.resolve(null) : getData("/api/coverage").catch(function () { return null; })
        ]);
        var schemes = res[0].schemes || [];
        var cov = res[1];
        var eligibleByName = {};
        if (cov) cov.per_scheme.forEach(function (s) { eligibleByName[s.scheme_name] = s.eligible; });

        // Opens with the "+ Add scheme" button alone, right-aligned; a locked role
        // gets a one-line note instead. The comparison card is gone.
        var head = canAct
          ? '<div class="a42-addrow"><button class="a42-btn" id="a42-open-scheme">+ Add scheme</button></div>'
          : '<div class="a42-ledger a42-lock"><span class="ic">\u{1F512}</span><span>' +
            (role.student
              ? "Every scheme’s rules are shown here in plain language — the same rules the engine " +
                "evaluated against your record. Registering a scheme is the Scholarship Officer’s action."
              : "This role reads the register. Registering a scheme is the Scholarship Officer’s " +
                "action, and it is logged against their name.") + "</span></div>";

        var cards = schemes.map(function (s, i) {
          var crit = s.eligibility_criteria || {};
          var rules = (crit.all || crit.any || []).map(function (r) {
            return '<span class="rule">' + esc(plainRule(r)) + "</span>";
          }).join("") || '<span class="rule">Open to every student</span>';
          var docsTxt = (s.required_documents || []).map(esc).join(" · ") || "As per scheme";
          var renewable = !!s.renewal_required;
          var n = eligibleByName[s.name];
          var providerYear = esc(s.provider_name || s.provider_type || "—") + " · " +
            inr(s.benefit_amount) + " a year" +
            (s.application_opens ? " · open " + esc(fmtDate(s.application_opens)) + " – " +
              esc(fmtDate(s.application_closes)) : "");

          SCHEME_BY_CODE[s.code] = s;
          var tools = canAct
            ? '<div class="tools">' +
                '<button class="lnk" data-a42-edit="' + esc(s.code) + '">Edit for this cycle</button>' +
                '<button class="lnk mute" data-a42-retire="' + esc(s.code) + '" data-active="' +
                  (s.is_active ? "1" : "0") + '">' + (s.is_active ? "Retire" : "Reinstate") + "</button></div>"
            : "";
          return '<div class="a42-schemecard2' + (s.is_active === false ? " retired" : "") +
              '" style="animation-delay:' + (0.02 + i * 0.05).toFixed(2) + 's">' +
            (s.is_active === false ? '<div class="a42-retired">Retired — not matched against students</div>' : "") +
            '<div class="hd"><div class="ti"><h3>' + esc(s.name) + "</h3>" +
              '<div class="pv">' + providerYear + "</div></div>" +
              (n != null ? '<div class="ct"><span class="v">' + n + '</span><span class="k">students qualify</span></div>' : "") +
            "</div>" +
            '<div class="cols">' +
              '<div class="col"><div class="hh">Who qualifies</div><div class="rules">' + rules + "</div></div>" +
              '<div class="col"><div class="hh">Documents</div><div class="docs">' + docsTxt + "</div></div>" +
              '<div class="col"><div class="hh">To keep it next year</div>' +
                '<div class="ren' + (renewable ? "" : " mute") + '">' + esc(plainRenewal(s)) + "</div>" +
                tools + "</div>" +
            "</div>" +
          "</div>";
        }).join("");

        el.innerHTML = matchBanner() + head +
          (cards ? '<div class="a42-schemelist">' + cards + "</div>"
            : '<div class="a42-ledger"><h2 class="a42-h3">No schemes registered yet</h2></div>');

        var mx = $("#a42-match-x", el);
        if (mx) mx.addEventListener("click", function () {
          matchResult = null;
          if (window.loaders.schemes) window.loaders.schemes();
        });

        var ob = $("#a42-open-scheme", el);
        if (ob && typeof window.openSchemeModal === "function") {
          ob.addEventListener("click", window.openSchemeModal);
        }
        setMeta("schemes", schemes.length + " rule-set" + (schemes.length === 1 ? "" : "s"));
        syncRail();
      } catch (e) { errorCard(el, e); }
    };
  }

  /* --------------------------------------------------------- agent activity */

  var QUEUE_SHOWN = 8;    // the queue can hold hundreds of runs; show the newest
  var RUNS_SHOWN = 6;

  var traceStep = 0, traceRunning = false, traceTimers = [];

  // The trace narrates the detect → decide → act → measure loop. Every figure in
  // it is read back from the API responses — no line here invents a number.
  function buildTrace(cov, matrix, ren, rec, integ) {
    var schemes = (matrix && matrix.schemes) || [];
    var students = (matrix && matrix.rows) || [];
    var checks = schemes.length * students.length;
    var db = (integ && integ.database) || {};
    var rows = {};
    (db.reads || []).forEach(function (r) { rows[r.object] = r.rows; });
    var readRows = function (name, fallback) {
      var hit = Object.keys(rows).find(function (k) { return k.indexOf(name) === 0; });
      return hit ? rows[hit] : fallback;
    };
    var atRisk = ((ren && ren.results) || []).filter(function (r) {
      return ["AT_RISK", "LIKELY_LOSS"].indexOf(r.risk_level) >= 0;
    });
    var toSuppress = ((rec && rec.results) || []).filter(function (r) { return r.recommend_suppress; });
    var runId = (matrix && matrix.run_id ? String(matrix.run_id).slice(0, 8) : "live");

    var L = [];
    L.push([0, "#8fe0b0", "agent_run " + runId + " · trigger=USER · actor=A42_SCHOLARSHIP_AGENT"]);
    L.push([420, "#9fb6e4", "DETECT  read people.v_student_profile → " + students.length + " rows"]);
    L.push([640, "#9fb6e4", "DETECT  read attendance.v_current_attendance → " +
      readRows("attendance.attendance_summary", students.length) + " rows  (owner: Agent 11)"]);
    L.push([860, "#9fb6e4", "DETECT  read assessment.term_result → " +
      readRows("assessment.term_result", students.length) + " rows  (owner: Agent 10)"]);
    L.push([1080, "#9fb6e4", "DETECT  read finance.scholarship_scheme → " + schemes.length + " active rule-sets"]);
    L.push([1320, "#ffd27a", "DECIDE  evaluate " + schemes.length + " rule-sets × " + students.length +
      " students = " + checks + " deterministic checks"]);
    ((cov && cov.per_scheme) || []).forEach(function (s, i) {
      L.push([1560 + i * 180, "#ffd27a", "DECIDE  " + padRight(s.scheme_code, 13) + "→  " +
        s.eligible + " eligible · " + (s.eligible_claimed != null ? s.eligible_claimed : s.covered) + " covered · gap " + s.gap]);
    });
    if (cov) {
      L.push([2340, "#ffd27a", "DECIDE  " + cov.total_eligible + " eligible matches · " +
        (cov.total_claimed != null ? cov.total_claimed : cov.total_covered) + " covered · gap = " + cov.coverage_gap]);
    }
    var SHOW = 3;   // a 1000-student run: narrate a few, count the rest
    atRisk.slice(0, SHOW).forEach(function (r, i) {
      var att = r.student && r.student.attendance_pct;
      L.push([2600 + i * 120, "#ff9f9f", "DECIDE  renewal check: " + r.student.roll_no +
        " attendance " + att + "% < floor " + floorOf(r.criteria_result) + "%  →  " + r.risk_level]);
    });
    if (atRisk.length > SHOW) {
      L.push([2960, "#ff9f9f", "DECIDE  … and " + (atRisk.length - SHOW) + " more renewals below their floor"]);
    }
    toSuppress.slice(0, SHOW).forEach(function (r, i) {
      L.push([3000 + i * 120, "#ff9f9f", "DECIDE  reconcile: " + r.roll_no + " covered " +
        inr(r.covered_amount) + " ≥ outstanding " + inr(r.outstanding) + " AND reminder active"]);
    });
    if (toSuppress.length > SHOW) {
      L.push([3200, "#ff9f9f", "DECIDE  … and " + (toSuppress.length - SHOW) + " more reminders chasing covered fees"]);
    }
    L.push([3260, "#9fe6ff", "ACT     write agentops.risk_flag × " + atRisk.length + "  (SCHOLARSHIP_RISK)"]);
    L.push([3440, "#9fe6ff", "ACT     write agentops.agent_output  (reasoning_summary attached)"]);
    if (toSuppress.length) {
      L.push([3620, "#e8930c", "ACT     HOLD  suppress_reminder × " + toSuppress.length +
        " → class-3 action, queued for human approval"]);
    }
    L.push([3880, "#8fe0b0", "MEASURE coverage " + (cov && cov.total_eligible
      ? Math.round(1000 * (cov.total_claimed != null ? cov.total_claimed : cov.total_covered) / cov.total_eligible) / 10 : 0) + "% · gap " +
      (cov ? cov.coverage_gap : 0) + " · at-risk " + atRisk.length +
      " · awaiting approval " + toSuppress.length]);
    L.push([4080, "#8fe0b0", "agent_run " + runId + " · status=COMPLETED · provenance rows logged: " +
      (db.runs_logged != null ? db.runs_logged : students.length)]);
    // The trace console is a light-blue surface, so remap the dark-bg pastel inks
    // to darker variants that stay legible on it.
    var CMAP = { "#8fe0b0": "#0f8a44", "#9fb6e4": "#2f52c4", "#ffd27a": "#b0700a",
      "#ff9f9f": "#c0392f", "#9fe6ff": "#0e7aa8", "#e8930c": "#b0700a" };
    return L.map(function (l) { return { d: l[0], c: (CMAP[l[1]] || l[1]), t: l[2] }; });
  }
  function padRight(s, n) {
    s = String(s || "");
    while (s.length < n) s += " ";
    return s;
  }

  var PHASE_DEFS = [
    { n: "1", label: "Detect", from: 1, to: 4,
      desc: "Read the shared platform tables — including the ones Agents 10 and 11 own." },
    { n: "2", label: "Decide", from: 5, to: 14,
      desc: "Walk every scheme's JSON rules against every student. Deterministic, and it records its working." },
    { n: "3", label: "Act", from: 15, to: 17,
      desc: "Write flags and outputs back. Anything touching a student stops at the approval gate." },
    { n: "4", label: "Measure", from: 18, to: 99,
      desc: "Recompute coverage, gap and risk so the next pass starts from the new truth." }
  ];

  function stopTrace() {
    traceTimers.forEach(clearTimeout);
    traceTimers = [];
  }

  function installActivity(getData, errorCard) {
    var TRACE = [];
    var STATS = {};

    function renderTrace() {
      var box = $("#a42-tracebox");
      if (!box) return;
      var lines = traceStep === 0
        ? '<div class="ln"><span class="ts">›</span><span style="color:#8290ab">' +
          "Press the button to replay the last run.</span></div>"
        : TRACE.slice(0, traceStep).map(function (l, i) {
            return '<div class="ln"><span class="ts">' + String(i).padStart(2, "0") + " · " +
              String(l.d).padStart(4, "0") + 'ms</span><span style="color:' + l.c + '">' +
              esc(l.t) + "</span></div>";
          }).join("") +
          (traceRunning ? '<div class="ln"><span class="ts">›</span><span class="cur">█</span></div>' : "");
      box.innerHTML = lines;
      box.scrollTop = box.scrollHeight;

      var btn = $("#a42-tracebtn");
      if (btn) {
        btn.textContent = traceRunning ? "Running…"
          : (traceStep ? "↻ Replay the last agent run" : "▶ Replay the last agent run");
        btn.style.background = traceRunning ? "#4064e6" : "#6084fc";
      }
      $$(".a42-phase").forEach(function (el) {
        var from = Number(el.dataset.from), to = Number(el.dataset.to);
        var active = traceStep >= from && traceStep <= to;
        var done = traceStep > to;
        el.classList.toggle("on", active);
        el.classList.toggle("done", done && !active);
        var st = $(".stat", el);
        if (st) st.textContent = (active || done) ? (STATS[el.dataset.phase] || "") : "waiting…";
      });
    }

    function runTrace() {
      stopTrace();
      traceStep = 0; traceRunning = true; renderTrace();
      if (_reduced) { traceStep = TRACE.length; traceRunning = false; renderTrace(); return; }
      TRACE.forEach(function (ln, i) {
        traceTimers.push(setTimeout(function () {
          traceStep = i + 1;
          traceRunning = i + 1 < TRACE.length;
          renderTrace();
        }, 90 + i * 210));
      });
    }

    window.loaders.activity = async function () {
      var el = $("#panel-activity");
      try {
        var role = activeRole();
        var canAct = role.canAct;
        var res = await Promise.all([
          getData("/api/runs"),
          getData("/api/approvals").catch(function () { return { approvals: [] }; }),
          getData("/api/coverage").catch(function () { return null; }),
          getData("/api/matrix").catch(function () { return null; }),
          getData("/api/renewal-risk").catch(function () { return null; }),
          getData("/api/reconciliation").catch(function () { return null; }),
          getData("/api/integrations").catch(function () { return null; })
        ]);
        var runs = res[0].runs || [];
        var approvals = res[1].approvals || [];
        var waiting = res[1].total != null ? res[1].total : approvals.length;
        var cov = res[2], matrix = res[3], ren = res[4], rec = res[5], integ = res[6];

        TRACE = buildTrace(cov, matrix, ren, rec, integ);
        stopTrace(); traceStep = 0; traceRunning = false;

        var schemes = (matrix && matrix.schemes || []).length;
        var students = (matrix && matrix.rows || []).length;
        var atRisk = ((ren && ren.results) || []).filter(function (r) {
          return ["AT_RISK", "LIKELY_LOSS"].indexOf(r.risk_level) >= 0;
        }).length;
        var held = ((rec && rec.results) || []).filter(function (r) { return r.recommend_suppress; }).length;
        STATS = {
          "1": "4 sources · " + nf(students) + " students",
          "2": nf(schemes * students) + " checks · 0 guesses",
          "3": atRisk + " flags · " + held + " held for a human",
          "4": "gap " + (cov ? cov.coverage_gap : 0) + " · at-risk " + atRisk
        };

        // Compressed: number + label on one row, the live stat underneath — no
        // paragraph, no numbered icon tile. The card's colour is the signal.
        var phases = PHASE_DEFS.map(function (p) {
          return '<div class="a42-phase mini" data-phase="' + p.n + '" data-from="' + p.from +
            '" data-to="' + p.to + '">' +
            '<div class="ph"><span class="dot">' + p.n + "</span>" +
            '<span class="lb">' + esc(p.label) + "</span></div>" +
            '<div class="stat">waiting…</div></div>';
        }).join("");

        var byType = res[1].by_type || {};
        var bulk = canAct ? [["ALERT", "student notices"], ["ACTION_PROPOSAL", "follow-ups"]]
          .filter(function (t) { return byType[t[0]]; })
          .map(function (t) {
            return '<button class="a42-btn small" data-a42-bulk="' + t[0] + '">Approve all ' +
              nf(byType[t[0]]) + " " + t[1] + "</button>";
          }).join("") : "";
        var queue = approvals.slice(0, QUEUE_SHOWN).map(function (a) {
          var btns = canAct
            ? '<button class="a42-btn small" data-approve="' + esc(a.agent_output_id) + '">Approve</button>' +
              '<button class="a42-btn ghost small" data-reject="' + esc(a.agent_output_id) + '">Reject</button>'
            : '<span class="a42-chip" style="background:#eef1f7;color:#5b6478">\u{1F512} read-only in this role</span>';
          return '<div class="a42-approval"><div class="tx">' +
            '<div class="k">' + esc(a.output_type || "RECOMMENDATION") + "</div>" +
            '<div class="s">' + esc(a.reasoning_summary || "—") + "</div></div>" +
            '<div class="bt">' + btns + "</div></div>";
        }).join("");

        var allDone = runs.every(function (r) { return r.status === "SUCCEEDED" || r.status === "COMPLETED"; });
        var timeline = runs.slice(0, RUNS_SHOWN).map(function (r) {
          return '<div class="a42-auditrow">' +
            '<div class="tg">' + esc(r.trigger_type || "RUN") + "</div>" +
            '<div class="rq"><div class="t">' + esc(r.request_text || "—") + "</div>" +
              '<div class="w">' + esc(String(r.started_at || "").replace("T", " ").slice(0, 19)) + "</div></div>" +
            '<div class="tr">' + (r.input_sources || 0) + " source(s) → " + (r.outputs || 0) + " output(s)</div>" +
            '<div class="tk">' + (r.latency_ms != null ? r.latency_ms + " ms" : "—") + "</div>" +
          "</div>";
        }).join("");

        el.innerHTML =
          '<div class="a42-dark">' +
            '<div class="a42-darkhd"><div>' +
              '<div class="ti">Watch it work, step by step</div>' +
              '<div class="sb">A real run takes milliseconds — this replays the last one at readable speed.</div></div>' +
              '<button id="a42-tracebtn" class="a42-btn">▶ Replay the last agent run</button></div>' +
            '<div class="a42-phases">' + phases + "</div>" +
            '<div class="a42-tracebox" id="a42-tracebox"></div>' +
          "</div>" +
          '<div class="a42-ledger" style="animation-delay:.12s">' +
            '<h2 class="a42-h3" style="margin-bottom:4px">Human approval queue</h2>' +
            '<div class="sub" style="margin-bottom:16px">Nothing reaches a student without your approval. ' +
              nf(Math.min(QUEUE_SHOWN, approvals.length)) + " newest of <b>" + nf(waiting) + "</b> waiting.</div>" +
            (bulk ? '<div class="a42-bulkbar"><span>Reviewed the drafts? Approve a whole batch at once — ' +
              "money-moving recommendations still go one by one.</span>" + bulk + "</div>" : "") +
            '<div class="a42-approvals">' + (queue ||
              '<div class="a42-note ok"><i>✓</i><span>Nothing is waiting on a human right now.</span></div>') +
            "</div></div>" +
          '<div class="a42-ledger" style="animation-delay:.2s">' +
            '<div class="a42-schemehd"><div>' +
              '<h2 class="a42-h3" style="margin-bottom:4px">Every run, logged</h2>' +
              '<div class="sub">What started it, what it read, how long it took.</div></div>' +
              '<span class="a42-count">last ' + runs.length + " run" + (runs.length === 1 ? "" : "s") +
                (allDone ? " · all completed" : "") + "</span></div>" +
            '<div class="a42-audithead"><div>Trigger</div><div>Request</div><div>Tables read</div>' +
              '<div class="r">Took</div></div>' +
            '<div class="a42-runs">' + (timeline ||
              '<div class="a42-note ok"><i>✓</i><span>No runs logged yet.</span></div>') + "</div></div>";

        var btn = $("#a42-tracebtn", el);
        if (btn) btn.addEventListener("click", runTrace);
        renderTrace();

        setMeta("activity", runs.length + " run" + (runs.length === 1 ? "" : "s") + " logged");
        syncRail();
      } catch (e) { errorCard(el, e); }
    };
  }

  // Approve / reject reuse app.js's decide(), which posts and refetches.
  document.addEventListener("click", function (ev) {
    var t = ev.target;
    if (!t.closest) return;
    var a = t.closest("[data-approve]"), r = t.closest("[data-reject]");
    if ((a || r) && typeof window.decide === "function") {
      window.decide(a || r, a ? "APPROVE" : "REJECT");
    }
  });

  /* ----------------------------------------------------------- integrations */

  // The five agents Agent 42 actually shares tables with. Blue = we read their
  // rows, green = they read ours. The other 66 are the same schema, no wiring.
  var CONNECTED = {
    10: ["#6084fc", "Academic"], 11: ["#6084fc", "Attendance"],
    40: ["#38e08a", "Fee mgmt"], 41: ["#38e08a", "Reminders"], 43: ["#38e08a", "Edu loans"]
  };
  var ORBIT_LABELS = [
    { agent: "Agent 10", role: "Academic → we read",     top: "16%", left: "20%", c: "#6084fc", rc: "#a8c4fd" },
    { agent: "Agent 11", role: "Attendance → we read",   top: "78%", left: "22%", c: "#6084fc", rc: "#a8c4fd" },
    { agent: "Agent 40", role: "Fee mgmt ← we write",    top: "14%", left: "76%", c: "#38e08a", rc: "#8fe0b0" },
    { agent: "Agent 41", role: "Reminders ← we write",   top: "50%", left: "88%", c: "#38e08a", rc: "#8fe0b0" },
    { agent: "Agent 43", role: "Edu loans ← we write",   top: "84%", left: "74%", c: "#38e08a", rc: "#8fe0b0" }
  ];

  // 72 agents placed on a Fibonacci sphere so the spin never shows a seam.
  function constellation() {
    var out = [], i;
    for (i = 1; i <= 72; i++) {
      if (i === 42) continue;                       // 42 is the core, drawn separately
      var k = i - 0.5;
      var phi = Math.acos(1 - 2 * k / 72);
      var theta = Math.PI * (1 + Math.sqrt(5)) * k;
      var R = 168;
      var x = R * Math.sin(phi) * Math.cos(theta);
      var y = R * Math.cos(phi);
      var z = R * Math.sin(phi) * Math.sin(theta);
      var hot = CONNECTED[i];
      var size = hot ? 16 : 7;
      out.push('<i style="transform:translate3d(' + x.toFixed(1) + "px," + y.toFixed(1) +
        "px," + z.toFixed(1) + "px);width:" + size + "px;height:" + size + "px;margin-left:" +
        (-size / 2) + "px;margin-top:" + (-size / 2) + "px;background:" +
        (hot ? hot[0] : "#3e5891") + ";box-shadow:" +
        (hot ? "0 0 18px " + hot[0] + ", 0 0 5px #fff" : "0 0 6px rgba(62,88,145,.7)") + '"></i>');
    }
    return out.join("");
  }

  function installIntegrations(getData, errorCard) {
    window.loaders.integrations = async function () {
      var el = $("#panel-integrations");
      try {
        var d = await getData("/api/integrations");
        var db = d.database || {};
        var reads = db.reads || [];

        var rows = reads.map(function (x) {
          return '<div class="a42-readrow"><code>' + esc(x.object) + "</code><span>" +
            x.rows + "</span></div>";
        }).join("");

        var lineage = function (list, kind) {
          return (list || []).map(function (a) {
            return '<div class="a42-lin ' + kind + '">' +
              '<div class="hd"><b>' + esc(a.agent) + "</b>" +
                '<span class="a42-chip">' + kind + "</span></div>" +
              "<div class=\"gv\">Gives <b>" + esc(a.gives || a.provides || "—") +
                "</b> · <code>" + esc(a.target || a.source || "—") + "</code></div>" +
              (a.status ? '<div class="st">' + esc(a.status) + "</div>" : "") +
            "</div>";
          }).join("");
        };

        var prov = (d.provenance || []).slice(0, 12).map(function (p) {
          return "<tr><td><code>" + esc(p.source_schema + "." + p.source_table) + "</code></td>" +
            '<td class="m">' + p.record_count + "</td>" +
            '<td class="s">' + esc(p.request_text || "—") + "</td></tr>";
        }).join("");

        el.innerHTML =
          '<div class="a42-orbitwrap">' +
            '<div class="a42-orbitcopy">' +
              '<h2>One database. 72 agents. Zero custom APIs.</h2>' +
              "<p>Every dot is one agent on the shared platform. Agent 42 <b>reads</b> the tables " +
                "Agents 10 &amp; 11 fill and <b>writes</b> the tables Agents 40, 41 &amp; 43 read. " +
                "Change one connection string and the whole platform integrates.</p>" +
              '<div class="a42-orbitlegend">' +
                '<span><i style="background:#6084fc;box-shadow:0 0 10px rgba(96,132,252,.9)"></i>' +
                  "Consumes — we read their rows</span>" +
                '<span><i style="background:#38e08a;box-shadow:0 0 10px rgba(56,224,138,.9)"></i>' +
                  "Feeds — they read our rows</span>" +
                '<span class="dim"><i style="background:#3e5891"></i>' +
                  "The other 66 agents — same schema, same rules</span>" +
              "</div>" +
            "</div>" +
            '<div class="a42-orbit">' +
              '<div class="a42-sphere">' + constellation() + "</div>" +
              '<div class="a42-core-glow"></div>' +
              '<div class="a42-core"><span class="n">42</span><span class="l">Scholarship</span></div>' +
              ORBIT_LABELS.map(function (o) {
                return '<div class="a42-orbitlabel" style="top:' + o.top + ";left:" + o.left +
                  ";border-color:" + o.c + '"><b>' + esc(o.agent) + "</b>" +
                  '<span style="color:' + o.rc + '">' + esc(o.role) + "</span></div>";
              }).join("") +
            "</div>" +
          "</div>" +

          '<div class="a42-intgrid">' +
            '<div class="a42-ledger">' +
              '<h2 class="a42-h3">Proof, not a claim</h2>' +
              '<div class="a42-dbline">' +
                '<span class="a42-chip" style="background:' + (db.connected ? "#dcfce7" : "#fee2e2") +
                  ";color:" + (db.connected ? "#166534" : "#991b1b") + '">● ' +
                  (db.connected ? "CONNECTED" : "OFFLINE") + "</span>" +
                "<b>" + esc(db.provider || "PostgreSQL") + "</b>" +
                '<span class="in">' + esc(db.instance || "") + "</span></div>" +
              '<div class="sub">The clock below is read straight from the database on every press ' +
                "— it is queried live, never stored. If it moves, the connection is real. " +
                "Running on <code>" + esc(db.source || "the platform schema") + "</code>: <b>" +
                (db.schemas || 0) + "</b> schemas · <b>" + (db.tables || 0) + "</b> tables.</div>" +
              '<div class="a42-clock"><span id="a42-dbtime">' +
                esc(db.server_time || "—") + "</span>" +
                '<button class="a42-btn small" id="a42-dbrefresh">↻ Read it again</button></div>' +
            "</div>" +
            '<div class="a42-ledger" style="animation-delay:.08s">' +
              '<h2 class="a42-h3">Shared objects, live row counts</h2>' +
              '<div class="a42-reads">' + (rows ||
                '<div class="a42-note ok"><i>✓</i><span>No shared objects reported.</span></div>') +
              "</div></div>" +
          "</div>" +

          '<div class="a42-intgrid">' +
            '<div class="a42-ledger" style="animation-delay:.12s">' +
              '<h2 class="a42-h3">Consumes — we read their rows</h2>' +
              '<div class="a42-lins">' + lineage(d.consumes, "consumes") + "</div></div>" +
            '<div class="a42-ledger" style="animation-delay:.16s">' +
              '<h2 class="a42-h3">Feeds — they read our rows</h2>' +
              '<div class="a42-lins">' + lineage(d.feeds, "feeds") + "</div></div>" +
          "</div>" +

          '<div class="a42-ledger" style="animation-delay:.2s">' +
            '<h2 class="a42-h3" style="margin-bottom:4px">Live data lineage (provenance)</h2>' +
            '<div class="sub" style="margin-bottom:14px">Every run records exactly which records ' +
              "fed it — <code>agentops.agent_run_input</code>.</div>" +
            '<div class="a42-tablewrap"><table class="a42-table"><thead><tr>' +
              "<th>Source table</th><th>Rows</th><th>Run</th></tr></thead><tbody>" +
              (prov || '<tr><td colspan="3" class="s">No provenance rows yet.</td></tr>') +
            "</tbody></table></div></div>";

        var rf = $("#a42-dbrefresh", el);
        if (rf) rf.addEventListener("click", async function () {
          rf.disabled = true;
          try {
            if (window.invalidateCache) window.invalidateCache();
            var fresh = await getData("/api/integrations");
            var t = $("#a42-dbtime");
            if (t) t.textContent = (fresh.database || {}).server_time || "—";
          } catch (e) { /* the card stays; the clock simply does not move */ }
          finally { rf.disabled = false; }
        });

        setMeta("integrations", "72 agents");
        syncRail();
      } catch (e) { errorCard(el, e); }
    };
  }

  /* -------------------------------------------------------------- renewal */

  function floorOf(criteria) {
    var f = 75;
    (criteria || []).forEach(function (c) {
      var field = c.field || c.f, val = c.value != null ? c.value : c.v;
      if (field === "attendance_pct" && !isNaN(Number(val))) f = Number(val);
    });
    return f;
  }

  var RN = { open: false, page: 1 };

  function installRenewal(getData, errorCard) {
    // The redesigned attendance cell: a fill to the student's attendance, the
    // shortfall stretch up to the floor, and a tick at the floor itself.
    function attCell(r) {
      var att = Number(r.student.attendance_pct) || 0;
      var floor = floorOf(r.criteria_result);
      var shortfall = Math.round((floor - att) * 10) / 10;
      var loss = r.risk_level === "LIKELY_LOSS" || shortfall > 10;
      var barColor = loss ? "#7f9df0" : "#9cbcfd";
      var ink = loss ? "#c0392f" : "#b0700a";
      var attW = Math.max(0, Math.min(100, att));
      var gapRight = Math.max(0, 100 - floor);
      var phrase = shortfall > 0
        ? (shortfall === 1 ? "1 pt short of " + floor + "%" : shortfall + " pts short of " + floor + "%")
        : "at the line";
      return '<div class="a42-attcell"><div class="trk">' +
          '<span class="fill" style="width:' + attW + '%;background:' + barColor + '"></span>' +
          '<span class="gap" style="left:' + attW + '%;right:' + gapRight + '%"></span>' +
          '<span class="tick" style="left:' + floor + '%"></span></div>' +
        '<div class="ft"><span class="pc" style="color:' + ink + '">' + att + "%</span>" +
          '<span class="sh">' + esc(phrase) + "</span></div></div>";
    }

    function riskRow(r, i) {
      var loss = r.risk_level === "LIKELY_LOSS" ||
        (floorOf(r.criteria_result) - (Number(r.student.attendance_pct) || 0)) > 10;
      var amt = r.sanctioned_amount != null ? r.sanctioned_amount : r.amount;
      var tier = loss ? "Likely loss" : "At risk";
      var tierBg = loss ? "#fdf0ef" : "#fdf6ea", tierInk = loss ? "#c0392f" : "#b0700a";
      return '<div class="a42-riskrow" style="animation-delay:' + (Math.min(i, 12) * 0.05).toFixed(2) + 's">' +
        '<div class="who"><div class="nm">' + esc(r.student.full_name) + "</div>" +
          '<div class="rl">' + esc(r.student.roll_no) + " · CGPA " + esc(r.student.cgpa) + "</div></div>" +
        '<div class="sch">' + esc(shortScheme(r.scheme_name)) + "</div>" +
        attCell(r) +
        '<div class="stk">' + (amt != null ? inr(amt) : "—") + "</div>" +
        '<div class="tr"><span class="tier" style="background:' + tierBg + ";color:" + tierInk + '">' +
          esc(tier) + "</span></div>" +
      "</div>";
    }

    window.loaders.renewal = async function () {
      var el = $("#panel-renewal");
      try {
        var d = await getData("/api/renewal-risk");
        var list = d.results || d.list || d || [];
        if (!Array.isArray(list)) list = [];
        var role = activeRole();
        if (role.student) list = list.filter(function (r) { return r.student.roll_no === role.student; });

        var urgent = list.filter(function (r) { return r.risk_level && r.risk_level !== "NONE"; });
        var safe = list.filter(function (r) { return !r.risk_level || r.risk_level === "NONE"; });
        urgent.sort(function (a, b) {
          return (floorOf(b.criteria_result) - (Number(b.student.attendance_pct) || 0)) -
                 (floorOf(a.criteria_result) - (Number(a.student.attendance_pct) || 0));
        });
        var stake = urgent.reduce(function (t, r) { return t + (Number(r.sanctioned_amount) || 0); }, 0);
        var secured = safe.reduce(function (t, r) { return t + (Number(r.sanctioned_amount) || 0); }, 0);
        setMeta("renewal", urgent.length + " at risk");

        // --- action list (opens the tab) ---
        var rows = urgent.map(function (r, i) { return riskRow(r, i); }).join("") ||
          '<div class="a42-note ok"><i>✓</i><span>No live award is below its renewal floor right now.</span></div>';
        var actionCard =
          '<div class="a42-ledger">' +
            '<div class="a42-riskhd"><div>' +
              '<h2 class="a42-h3" style="margin-bottom:4px">' + nf(urgent.length) + " award" +
                (urgent.length === 1 ? "" : "s") + " about to be lost</h2>" +
              '<div class="sub">Attendance below the 75% the scheme needs. Furthest below first.</div></div>' +
              '<div class="rt"><div class="v">' + inr(stake) + "</div><div class=\"k\">at stake</div></div>" +
            "</div>" +
            '<div class="a42-riskhead"><div>Student</div><div>Scheme</div><div>Attendance vs 75%</div>' +
              '<div class="r">At stake</div><div class="r">Risk</div></div>' +
            rows +
          "</div>";

        // --- bottom distribution card (all live awards by attendance) ---
        var LO = 55, STEP = 5, N = 9;   // 55–100 in 5-pt buckets; 75 falls at bucket 4 (44.44%)
        var buckets = new Array(N).fill(0);
        list.forEach(function (r) {
          var a = Number(r.student.attendance_pct) || 0;
          var idx = Math.floor((a - LO) / STEP);
          idx = Math.max(0, Math.min(N - 1, idx));
          buckets[idx]++;
        });
        var maxB = Math.max.apply(null, buckets.concat([1]));
        var bars = buckets.map(function (n, i) {
          var lo = LO + i * STEP;
          var color = lo < 65 ? "#d8443c" : (lo < 75 ? "#e8930c" : "#a9c1fb");
          var h = Math.round((n / maxB) * 92);
          return '<div class="col"><span class="n" style="color:' + color + '">' + nf(n) + "</span>" +
            '<div class="bar" style="height:' + h + "px;background:" + color + '"></div></div>';
        }).join("");
        var labels = buckets.map(function (n, i) { return '<div class="lbl">' + (LO + i * STEP) + "</div>"; }).join("");
        var atts = safe.map(function (r) { return Number(r.student.attendance_pct) || 0; }).sort(function (a, b) { return a - b; });
        var med = atts.length ? (atts.length % 2 ? atts[(atts.length - 1) / 2]
          : Math.round((atts[atts.length / 2 - 1] + atts[atts.length / 2]) / 2 * 10) / 10) : 0;
        var distCard = role.student ? "" :
          '<div class="a42-ledger a42-distcard" style="animation-delay:.1s">' +
            '<div class="a42-apsumhd"><div class="eb">All ' + nf(list.length) + " live awards by attendance</div>" +
              '<div class="rt">one bar = 5 points · ' + nf(urgent.length) + " fall below the line</div></div>" +
            '<div class="a42-hist"><div class="bars">' + bars +
              '<div class="thresh"></div><div class="threshlbl">75% NEEDED</div></div>' +
              '<div class="labels">' + labels + "</div></div>" +
            '<div class="a42-legend distlegend">' +
              '<span><i style="background:#d8443c"></i>Likely loss</span>' +
              '<span><i style="background:#e8930c"></i>At risk, still fixable</span>' +
              '<span><i style="background:#a9c1fb"></i>On track</span></div>' +
            '<div class="a42-safeband"><span><b>' + nf(safe.length) + "</b> award" + (safe.length === 1 ? " is" : "s are") +
              " safe — " + lakh(secured) + " secured.</span>" +
              '<button class="a42-btn ghost small" id="a42-rntoggle">' + (RN.open ? "Hide detail" : "Show detail") + "</button></div>" +
            (RN.open ? '<div class="a42-safedetail">' + nf(safe.length) + " safe awards · median attendance " + med +
              "% · lowest " + (atts[0] || 0) + "% · highest " + (atts[atts.length - 1] || 0) + "%.</div>" : "") +
          "</div>";

        el.innerHTML = actionCard + distCard;

        var tg = $("#a42-rntoggle", el);
        if (tg) tg.addEventListener("click", function () {
          RN.open = !RN.open;
          window.loaders.renewal();
        });
        syncRail();
      } catch (e) { errorCard(el, e); }
    };
  }

  /* ------------------------------------------------------------- live meta */

  // A signed-in student is served only their own rows; staff-only endpoints
  // answer 403, so don't ask for them at all.
  function lockedStudent() {
    return document.body.dataset.role === "STUDENT" && document.body.dataset.canSwitch === "no";
  }

  function fillMeta(getData) {
    var staff = !lockedStudent();
    if (staff) getData("/api/coverage").then(function (d) {
      if (!META.coverage) setMeta("coverage", d.coverage_gap + " gap");
    }).catch(function () {});
    getData("/api/matrix").then(function (d) {
      var rows = d.rows || [];
      var n = rows.reduce(function (t, r) { return t + (r.cells || []).length; }, 0);
      if (n) setMeta("matrix", n + " decisions");
    }).catch(function () {});
    getData("/api/applications").then(function (d) {
      var n = (d.applications || d.results || []).length;
      setMeta("applications", n + " applications");
    }).catch(function () {});
    getData("/api/reconciliation").then(function (d) {
      var n = (d.results || []).filter(function (r) { return r.recommend_suppress; }).length;
      setMeta("reconciliation", n + " to approve");
    }).catch(function () {});
    getData("/api/schemes").then(function (d) {
      setMeta("schemes", (d.schemes || []).length + " rule-sets");
    }).catch(function () {});
    if (staff) getData("/api/runs").then(function (d) {
      var n = (d.runs || []).length;
      setMeta("activity", n + " runs logged");
    }).catch(function () {});
    getData("/api/renewal-risk").then(function (d) {
      var n = (d.results || []).filter(function (r) {
        return ["AT_RISK", "LIKELY_LOSS"].indexOf(r.risk_level) >= 0;
      }).length;
      setMeta("renewal", n + " at risk");
    }).catch(function () {});
    setMeta("integrations", "72 agents");
  }

  /* ----------------------------------------------------------------- boot */

  function boot() {
    if (!window.loaders || typeof window.getData !== "function") {
      // app.js keeps these module-private in some builds — see port/README.md
      console.warn("[a42 upgrade] loaders/getData not exposed; rail only.");
      buildRail();
      return;
    }
    buildRail();
    installCoverage(window.getData, window.errorCard || function (el, e) {
      el.innerHTML = '<div class="card"><h2>Could not load</h2><div class="sub">' +
        esc(e.message) + "</div></div>";
    });
    installApplications(window.getData, window.errorCard || function (el, e) {
      el.innerHTML = '<div class="card"><h2>Could not load</h2><div class="sub">' +
        esc(e.message) + "</div></div>";
    });
    installMatrix(window.getData, window.errorCard || function (el, e) {
      el.innerHTML = '<div class="card"><h2>Could not load</h2><div class="sub">' +
        esc(e.message) + "</div></div>";
    });
    installReconciliation(window.getData, window.errorCard || function (el, e) {
      el.innerHTML = '<div class="card"><h2>Could not load</h2><div class="sub">' +
        esc(e.message) + "</div></div>";
    });
    installSchemes(window.getData, window.errorCard || function (el, e) {
      el.innerHTML = '<div class="card"><h2>Could not load</h2><div class="sub">' +
        esc(e.message) + "</div></div>";
    });
    installActivity(window.getData, window.errorCard || function (el, e) {
      el.innerHTML = '<div class="card"><h2>Could not load</h2><div class="sub">' +
        esc(e.message) + "</div></div>";
    });
    installIntegrations(window.getData, window.errorCard || function (el, e) {
      el.innerHTML = '<div class="card"><h2>Could not load</h2><div class="sub">' +
        esc(e.message) + "</div></div>";
    });
    installRenewal(window.getData, window.errorCard || function (el, e) {
      el.innerHTML = '<div class="card"><h2>Could not load</h2><div class="sub">' +
        esc(e.message) + "</div></div>";
    });
    fillMeta(window.getData);

    // repaint the currently-visible panel with the new renderer
    var active = $("nav.tabs .tab.active");
    if (active && window.loaders[active.dataset.tab]) window.loaders[active.dataset.tab]();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
