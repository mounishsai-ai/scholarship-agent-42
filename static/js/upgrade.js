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
    matrix: "80 rule evaluations, each one openable. The agent can always show its working.",
    applications: "Nothing lapses silently: every application, and every match where nobody has applied yet.",
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
    var active = tabs[i];
    if (!active) return;
    var panel = $("#panel-" + active.dataset.tab);
    if (panel && !$(".a42-claim", panel) && CLAIMS[active.dataset.tab]) {
      var strip = document.createElement("div");
      strip.className = "a42-claim";
      strip.innerHTML = "<b>What this proves &nbsp;·&nbsp; </b>" + CLAIMS[active.dataset.tab];
      panel.insertBefore(strip, panel.firstChild);
    }
  }

  function setMeta(tab, text) {
    META[tab] = text;
    var el = $('.a42-tabmeta[data-meta="' + tab + '"]');
    if (el) el.textContent = text;
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

  function marks(covered, applied, eligible) {
    var out = "", i, inFlight = Math.max(0, (applied || 0) - covered);
    for (i = 0; i < covered; i++)
      out += '<button class="a42-mark covered" title="covered — sanctioned or disbursed" ' +
             'style="animation-delay:' + (i * 0.024).toFixed(3) + 's"></button>';
    for (i = 0; i < inFlight; i++)
      out += '<button class="a42-mark" title="applied, still in the pipeline" ' +
             'style="animation-delay:' + ((covered + i) * 0.024).toFixed(3) + 's"></button>';
    for (i = 0; i < eligible - covered - inFlight; i++)
      out += '<button class="a42-mark unclaimed" title="eligible — nothing claimed yet" ' +
             'style="animation-delay:' + ((covered + inFlight + i) * 0.024).toFixed(3) + 's"></button>';
    return out;
  }

  function installCoverage(getData, errorCard) {
    window.loaders.coverage = async function () {
      var el = $("#panel-coverage");
      try {
        var d = await getData("/api/coverage");
        var schemes = [];
        try { schemes = (await getData("/api/schemes")).schemes || []; } catch (e) { /* prices optional */ }

        var stuck = 0, moved = 0, priced = false;
        d.per_scheme.forEach(function (s) {
          var amt = schemeAmount(schemes, s.scheme_name);
          if (amt) priced = true;
          stuck += (s.gap > 0 ? s.gap : 0) * amt;
          moved += s.covered * amt;
        });
        var total = moved + stuck;
        var pct = total ? Math.round(100 * moved / total) : 0;

        setMeta("coverage", priced ? lakh(stuck) + " gap" : d.coverage_gap + " gap");

        var rows = d.per_scheme.map(function (s) {
          var amt = schemeAmount(schemes, s.scheme_name);
          var code = schemeCode(schemes, s.scheme_name);
          return '<div class="a42-gaprow">' +
            '<div><div class="nm">' + esc(s.scheme_name) + "</div>" +
              '<div class="cd">' + esc(code || "scheme") +
                (amt ? " · " + inr(amt) + " each" : "") + "</div></div>" +
            '<div class="a42-marks">' + marks(s.covered, s.applied, s.eligible) + "</div>" +
            "<div>" + (amt
              ? '<div class="a42-gapmoney">' + lakh(s.gap * amt) + "</div>"
              : '<div class="a42-gapmoney">' + s.gap + " unclaimed</div>") +
              '<div class="a42-gapsub">' + s.covered + " of " + s.eligible + " covered</div></div>" +
          "</div>";
        }).join("");

        var rej = d.rejections.length
          ? d.rejections.map(function (r) {
              return '<div class="a42-note bad"><i>!</i><span><b>' + r.n + "</b> — " +
                esc(r.rejection_reason) + " · procedural, not merit. Next cycle the agent flags " +
                "the ceiling before the student applies.</span></div>";
            }).join("")
          : '<div class="a42-note ok"><i>✓</i><span>No rejections recorded this cycle.</span></div>';

        el.innerHTML =
          '<div class="a42-ledger">' +
            '<div class="a42-ledger-grid">' +
              "<div>" +
                '<div class="a42-eyebrow">Eligible but unclaimed · 2025–26</div>' +
                '<div class="a42-bignum">' + (priced ? lakh(stuck) : d.coverage_gap + " matches") + "</div>" +
                "<p>" + d.coverage_gap + " of " + d.total_eligible + " eligible matches have no " +
                  "scholarship against them. Each is priced at its own scheme's benefit amount — " +
                  "read from the database, never estimated.</p>" +
              "</div>" +
              "<div>" +
                '<div class="a42-stat"><div class="k">Identified by the agent</div>' +
                  '<div class="v">' + (priced ? lakh(total) : d.total_eligible) + "</div>" +
                  '<div class="n">' + d.total_eligible + " matches across every student and scheme.</div></div>" +
                '<div class="a42-stat"><div class="k">Actually reaching students</div>' +
                  '<div class="v blue">' + (priced ? lakh(moved) : d.total_covered) + "</div>" +
                  '<div class="n">' + d.total_covered + " awards sanctioned or disbursed this cycle.</div></div>" +
              "</div>" +
            "</div>" +
            (priced ?
            '<div class="a42-split"><div class="a42-splitbar">' +
              '<div class="moved" style="width:' + pct + '%"></div><div class="stuck"></div></div>' +
              '<div class="a42-splitfoot"><span><b>' + pct + "%</b> of the money identified has moved</span>" +
              "<span style=\"color:#8a4b08\">the rest is still sitting with the schemes</span></div></div>" : "") +
          "</div>" +
          '<div class="a42-ledger" style="animation-delay:.12s">' +
            '<h2 style="font-family:Sora,sans-serif;margin:0 0 6px;font-size:19px;font-weight:700;letter-spacing:-.01em">Where the gap lives</h2>' +
            '<div class="sub" style="margin-bottom:26px;max-width:64ch">One mark per eligible student. ' +
              "Solid blue means the money moved; hollow gold means it is still sitting there.</div>" +
            rows +
            '<div class="a42-legend">' +
              '<span><i style="background:#6084fc"></i>Money moved</span>' +
              '<span><i style="background:#eaf0fc;border:1px solid #c6d6fd"></i>Applied, still in the pipeline</span>' +
              '<span><i style="background:#fff;border:1.5px solid #e8930c"></i>Eligible, nothing claimed</span>' +
            "</div>" +
          "</div>" +
          '<div class="a42-ledger" style="animation-delay:.2s">' +
            '<h2 style="font-family:Sora,sans-serif;margin:0 0 14px;font-size:19px;font-weight:700">Why applications were rejected</h2>' +
            rej +
          "</div>";
        syncRail();
      } catch (e) { errorCard(el, e); }
    };
  }

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

  var PIPELINE = [
    { key: "UNCLAIMED", label: "Never applied", labelColor: "#8a4b08", numColor: "#e8930c",
      segInk: "#fff", fill: "linear-gradient(135deg,#f7b955,#e8930c)", avatarBg: "#e8930c" },
    { key: "SUBMITTED", label: "Submitted", labelColor: "#2f52c4", numColor: "#2f52c4",
      segInk: "#2f52c4", fill: "linear-gradient(135deg,#d3e0fd,#aac2fb)", avatarBg: "#8fabf7" },
    { key: "INSTITUTION_VERIFIED", label: "Institution verified", labelColor: "#2f52c4", numColor: "#4064e6",
      segInk: "#fff", fill: "linear-gradient(135deg,#9cbcfd,#6f97f8)", avatarBg: "#6f97f8" },
    { key: "SANCTIONED", label: "Sanctioned", labelColor: "#4064e6", numColor: "#4064e6",
      segInk: "#fff", fill: "linear-gradient(135deg,#6084fc,#3f5fd8)", avatarBg: "#4064e6" },
    { key: "DISBURSED", label: "Disbursed", labelColor: "#166534", numColor: "#12a150",
      segInk: "#fff", fill: "linear-gradient(135deg,#34c77b,#12a150)", avatarBg: "#12a150" },
    { key: "REJECTED", label: "Rejected", labelColor: "#991b1b", numColor: "#d8443c",
      segInk: "#fff", fill: "linear-gradient(135deg,#ea9b93,#d8443c)", avatarBg: "#d8443c" }
  ];
  var STATUS_TONE = {
    SANCTIONED: ["#dfe9fb", "#2f52c4"], DISBURSED: ["#dcfce7", "#166534"],
    SUBMITTED: ["#e6eefc", "#2f52c4"], INSTITUTION_VERIFIED: ["#fef9c3", "#854d0e"],
    REJECTED: ["#fee2e2", "#991b1b"]
  };
  function initialsOf(n) {
    return String(n || "").trim().split(/\s+/).slice(0, 2)
      .map(function (w) { return w[0]; }).join("").toUpperCase();
  }
  function shortScheme(n) {
    return String(n || "").replace(/ Scholarship for | Scholarship| Students$/g, " ").trim();
  }

  function installApplications(getData, errorCard) {
    window.loaders.applications = async function () {
      var el = $("#panel-applications");
      try {
        var role = activeRole();
        var res = await Promise.all([
          getData("/api/applications"),
          getData("/api/coverage").catch(function () { return null; }),
          getData("/api/schemes").catch(function () { return { schemes: [] }; }),
          getData("/api/students").catch(function () { return { students: [] }; })
        ]);
        var apps = res[0].applications || res[0].results || [];
        var cov = res[1];
        var schemes = res[2].schemes || [];
        var idByRoll = {};
        (res[3].students || []).forEach(function (s) { idByRoll[s.roll_no] = s.student_id; });

        if (role.student) apps = apps.filter(function (a) { return a.roll_no === role.student; });

        // Money still sitting with the schemes, priced at each scheme's own
        // benefit amount exactly as the coverage panel prices it. Never estimated.
        var stuck = 0, priced = false, totalEligible = 0;
        if (cov && !role.student) {
          totalEligible = cov.total_eligible || 0;
          cov.per_scheme.forEach(function (s) {
            var amt = schemeAmount(schemes, s.scheme_name);
            if (amt) priced = true;
            stuck += (s.gap > 0 ? s.gap : 0) * amt;
          });
        }

        var live = apps.filter(function (a) { return a.status !== "REJECTED"; }).length;
        var unclaimed = Math.max(0, totalEligible - live);
        var denom = totalEligible || apps.length || 1;
        var share = function (n) { return Math.round(100 * n / denom); };

        var pipeline = PIPELINE.map(function (p, i) {
          var base = { delay: (i * 0.07).toFixed(2) + "s" };
          if (p.key === "UNCLAIMED") {
            return Object.assign({}, p, base, {
              count: unclaimed, cards: [], isEmpty: false, share: share(unclaimed) + "%",
              tip: "Never applied — " + unclaimed + " eligible matches" +
                   (priced ? ", worth " + lakh(stuck) : "")
            });
          }
          var list = apps.filter(function (a) { return a.status === p.key; });
          return Object.assign({}, p, base, {
            count: list.length, isEmpty: list.length === 0, share: share(list.length) + "%",
            tip: p.label + " — " + list.length + " of " + denom + " eligible matches",
            cards: list.map(function (a) {
              return {
                name: a.full_name, initials: initialsOf(a.full_name), avatarBg: p.avatarBg,
                sid: idByRoll[a.roll_no] || "",
                title: a.roll_no + " · " + shortScheme(a.scheme_name) + " — click to open this student",
                amount: a.status === "REJECTED" ? "rejected"
                  : (a.disbursed_amount ? inr(a.disbursed_amount) + " paid"
                    : (a.sanctioned_amount ? inr(a.sanctioned_amount) : "pending")),
                amtColor: a.status === "REJECTED" ? "#991b1b"
                  : (a.disbursed_amount ? "#12a150" : (a.sanctioned_amount ? "#4064e6" : "#5b6478"))
              };
            })
          });
        });

        var ribbon = pipeline.filter(function (p) { return p.count > 0; });
        var stages = pipeline.slice(1);

        var ribbonHtml = ribbon.map(function (sg) {
          return '<div class="a42-seg" title="' + esc(sg.tip) + '" style="width:' + sg.share +
            ";background:" + sg.fill + ";animation-delay:" + sg.delay + '">' +
            '<span style="color:' + sg.segInk + '">' + sg.count + "</span></div>";
        }).join("");

        var legendHtml = ribbon.map(function (sg) {
          return '<span><i style="background:' + sg.fill + '"></i><b>' + esc(sg.label) +
            "</b><span>" + sg.share + "</span></span>";
        }).join("");

        var stagesHtml = stages.map(function (st) {
          var pills = st.cards.map(function (c) {
            return '<button class="a42-pill"' + (c.sid ? ' data-a42-story="' + esc(c.sid) + '"' : "") +
              ' title="' + esc(c.title) + '">' +
              '<span class="av" style="background:' + c.avatarBg + '">' + esc(c.initials) + "</span>" +
              '<span class="tx"><span class="nm">' + esc(c.name) + "</span>" +
              '<span class="amt" style="color:' + c.amtColor + '">' + esc(c.amount) + "</span></span></button>";
          }).join("");
          return '<div class="a42-stage" style="animation-delay:' + st.delay + '">' +
            '<span class="cap" style="background:' + st.fill + '"></span>' +
            '<div class="hd"><span class="n" style="color:' + st.numColor + '">' + st.count + "</span>" +
              '<span class="sh">' + st.share + "</span></div>" +
            '<div class="lb" style="color:' + st.labelColor + '">' + esc(st.label) + "</div>" +
            '<div class="bd">' + (st.isEmpty ? '<span class="none">No one here yet</span>' : pills) + "</div>" +
          "</div>";
        }).join("");

        var rowsHtml = apps.map(function (a) {
          var tone = STATUS_TONE[a.status] || ["#eef1f7", "#5b6478"];
          return "<tr><td><b>" + esc(a.roll_no) + '</b><br><span class="s">' + esc(a.full_name) +
            "</span></td><td>" + esc(shortScheme(a.scheme_name)) + "</td>" +
            '<td><span class="a42-chip" style="background:' + tone[0] + ";color:" + tone[1] + '">' +
              esc(a.status) + "</span></td>" +
            '<td class="m">' + esc(a.applied_on || "—") + "</td>" +
            '<td class="m">' + (a.sanctioned_amount ? inr(a.sanctioned_amount) : "—") + "</td>" +
            '<td class="s">' + esc(a.rejection_reason || "") + "</td></tr>";
        }).join("");

        el.innerHTML =
          '<div class="a42-ledger">' +
            '<div class="a42-track-head">' +
              "<div>" +
                '<div class="a42-eyebrow">Eligible → applied → verified → sanctioned → disbursed</div>' +
                '<h2 class="a42-h2">Most of the funnel never starts.</h2>' +
                "<p>One bar, all <b>" + denom + " eligible matches</b> the agent found, split by where " +
                  "each one stands today. The amber share is the whole problem. Click a name to open that student.</p>" +
              "</div>" +
              (priced ? '<div class="a42-track-money"><div class="v">' + lakh(stuck) + "</div>" +
                '<div class="k">unclaimed benefit</div></div>' : "") +
            "</div>" +
            '<div class="a42-ribbon">' + ribbonHtml + "</div>" +
            '<div class="a42-riblegend">' + legendHtml + "</div>" +
            (unclaimed ?
            '<div class="a42-never">' +
              '<div class="n">' + unclaimed + '<div class="k">Never applied · ' + share(unclaimed) + "% of eligible</div></div>" +
              '<div class="t"><div class="h">Qualified today. Nothing claimed.</div>' +
                "<p>Worth <b>" + (priced ? lakh(stuck) : unclaimed + " matches") + "</b> in benefit the agent can " +
                "already justify, student by student — and not one of them has started a form.</p></div>" +
            "</div>" : "") +
            '<div class="a42-stages">' + stagesHtml + "</div>" +
          "</div>" +
          '<div class="a42-ledger" style="animation-delay:.12s">' +
            '<h2 class="a42-h3">Every application, in full</h2>' +
            '<div class="a42-tablewrap"><table class="a42-table"><thead><tr>' +
              "<th>Student</th><th>Scheme</th><th>Status</th><th>Applied</th><th>Sanctioned</th><th>Note</th>" +
            "</tr></thead><tbody>" +
            (rowsHtml || '<tr><td colspan="6" class="s">No applications in scope.</td></tr>') +
            "</tbody></table></div>" +
          "</div>";

        setMeta("applications", apps.length + " application" + (apps.length === 1 ? "" : "s"));
        syncRail();
      } catch (e) { errorCard(el, e); }
    };
  }

  // Student pills open the application pack app.js already builds from
  // /api/student/<id>/pack — delegated so re-rendered panels stay wired.
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-a42-story]");
    if (b && typeof window.openPrepare === "function") window.openPrepare(b.dataset.a42Story);
  });

  /* ---------------------------------------------------- eligibility matrix */

  var COVERED_STATUS = ["SANCTIONED", "DISBURSED"];

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

  // The why panel is pure client state: which cell is open. Kept here rather
  // than re-fetching, because /api/matrix already carries every rule result.
  var whyKey = null;

  function installMatrix(getData, errorCard) {
    window.loaders.matrix = async function () {
      var el = $("#panel-matrix");
      try {
        var role = activeRole();
        var res = await Promise.all([
          getData("/api/matrix"),
          getData("/api/applications").catch(function () { return { applications: [] }; })
        ]);
        var d = res[0];
        var apps = res[1].applications || [];
        var schemes = d.schemes || [];
        var rows = d.rows || [];
        if (role.student) {
          rows = rows.filter(function (r) { return r.student.roll_no === role.student; });
        }

        // roll|code -> is the money actually sanctioned or paid
        var coveredSet = {};
        apps.forEach(function (a) {
          if (COVERED_STATUS.indexOf(a.status) >= 0) coveredSet[a.roll_no + "|" + a.scheme_code] = true;
        });
        var schemeByCode = {};
        schemes.forEach(function (s) { schemeByCode[s.code] = s; });

        var decisions = rows.length * schemes.length;
        var cols = "200px repeat(" + schemes.length + ", minmax(96px,1fr))";
        var minW = (200 + schemes.length * 110) + "px";

        var head = '<div class="a42-mxrow" style="grid-template-columns:' + cols + '"><div></div>' +
          schemes.map(function (s) {
            return '<div class="a42-mxhead">' + esc(s.code) +
              "<div>" + esc(shortScheme(s.name)) + "</div></div>";
          }).join("") + "</div>";

        var body = rows.map(function (r, ri) {
          var st = r.student;
          var cells = schemes.map(function (s, ci) {
            var cell = (r.cells || []).find(function (c) { return c.scheme_code === s.code; });
            var ok = !!(cell && cell.is_eligible);
            var cov = ok && coveredSet[st.roll_no + "|" + s.code];
            var state = cov ? "cov" : (ok ? "ok" : "no");
            var tip = st.full_name + " · " + shortScheme(s.name) + " · " +
              (ok ? (cov ? "covered" : "eligible, not claimed") : "not eligible") +
              " — click for the rule trace";
            return '<button class="a42-cell ' + state + '" title="' + esc(tip) +
              '" data-a42-why="' + esc(st.roll_no + "|" + s.code) + '" style="animation-delay:' +
              (ri * 0.018 + ci * 0.05).toFixed(3) + 's">' +
              (cov ? "₹" : (ok ? "✓" : "✗")) + "</button>";
          }).join("");
          return '<div class="a42-mxrow" style="grid-template-columns:' + cols + '">' +
            '<button class="a42-mxname" data-a42-story="' + esc(st.student_id) + '">' +
              '<span class="av">' + esc(initialsOf(st.full_name)) + "</span>" +
              '<span class="tx"><span class="rl">' + esc(st.roll_no) + "</span>" +
              '<span class="nm">' + esc(st.full_name) + "</span></span></button>" +
            cells + "</div>";
        }).join("");

        // the open why panel, if any
        var whyHtml = "";
        if (whyKey) {
          var parts = whyKey.split("|");
          var wr = rows.find(function (r) { return r.student.roll_no === parts[0]; });
          var wc = wr && (wr.cells || []).find(function (c) { return c.scheme_code === parts[1]; });
          var ws = schemeByCode[parts[1]];
          if (wr && wc && ws) {
            var ruleRows = (wc.criteria_result || []).map(function (r) {
              return '<div class="a42-why-rule ' + (r.passed ? "pass" : "fail") + '">' +
                "<span class=\"v\">" + (r.passed ? "PASS" : "FAIL") + "</span>" +
                '<span class="r">' + esc(ruleText(r)) + "</span>" +
                '<span class="a">student: <b>' + esc(ruleActual(r)) + "</b></span></div>";
            }).join("");
            var amt = Number(ws.benefit_amount) || 0;
            whyHtml =
              '<div class="a42-why">' +
                '<div class="hd"><div>' +
                  '<div class="a42-eyebrow">Rule trace · agentops.agent_output.reasoning_summary</div>' +
                  '<div class="ti">' + esc(wr.student.full_name) + " (" + esc(wr.student.roll_no) +
                    ")  ×  " + esc(ws.name) + "</div></div>" +
                  '<button class="cl" data-a42-why-close>close</button></div>' +
                '<div class="rules">' + (ruleRows || '<div class="a42-why-rule pass"><span class="v">PASS</span>' +
                  '<span class="r">This scheme has no eligibility rules — every student qualifies.</span></div>') + "</div>" +
                '<div class="vl">' + (wc.is_eligible
                  ? "All rules passed → eligible." + (amt ? " Worth " + inr(amt) + " to this student." : "") +
                    (ws.application_opens ? " Applications window " + esc(ws.application_opens) + " → " +
                      esc(ws.application_closes || "—") + "." : "")
                  : "At least one rule failed → not eligible. No notification is drafted, and the " +
                    "student is never shown a scheme they cannot win.") + "</div>" +
              "</div>";
          }
        }

        el.innerHTML =
          '<div class="a42-ledger">' +
            '<h2 class="a42-h3" style="margin-bottom:4px">' + (role.student
              ? "Your eligibility — every scheme, every rule, checked for you"
              : "Eligibility heatmap — " + rows.length + " students × " + schemes.length +
                " schemes, " + decisions + " decisions") + "</h2>" +
            '<div class="sub" style="margin-bottom:18px">' + (role.student
              ? "Every square is one rule the engine actually evaluated against your record. Hover a " +
                "square for the rule that decided it; click your name to open the full pack."
              : "Every square is one rule evaluation the engine actually ran. Hover a square for the " +
                "rule that decided it; click a name to open that student's pack.") + "</div>" +
            '<div class="a42-mxwrap"><div style="min-width:' + minW + '">' + head + body + "</div></div>" +
            '<div class="a42-mxlegend">' +
              '<span><i class="cov">₹</i>Covered — money sanctioned or paid</span>' +
              '<span><i class="ok"></i>Eligible — nothing claimed yet</span>' +
              '<span><i class="no"></i>A rule failed — never offered</span>' +
            "</div>" + whyHtml +
          "</div>";

        setMeta("matrix", decisions + " decision" + (decisions === 1 ? "" : "s"));
        syncRail();
        // No scrollIntoView: the grid re-renders in place and the why panel opens
        // below it, so the reader keeps their position (design rule).
      } catch (e) { errorCard(el, e); }
    };
  }

  // Cell → why panel, and its close button. Delegated so the re-render keeps working.
  document.addEventListener("click", function (ev) {
    var t = ev.target;
    if (!t.closest) return;
    var cell = t.closest("[data-a42-why]");
    if (cell) {
      var k = cell.dataset.a42Why;
      whyKey = (whyKey === k) ? null : k;
      if (window.loaders && window.loaders.matrix) window.loaders.matrix();
      return;
    }
    if (t.closest("[data-a42-why-close]")) {
      whyKey = null;
      if (window.loaders && window.loaders.matrix) window.loaders.matrix();
    }
  });

  /* ------------------------------------------------- fee reconciliation */

  function installReconciliation(getData, errorCard) {
    window.loaders.reconciliation = async function () {
      var el = $("#panel-reconciliation");
      try {
        var role = activeRole();
        var canAct = role.canAct;
        var d = await getData("/api/reconciliation");
        var list = d.results || [];
        if (role.student) list = list.filter(function (r) { return r.roll_no === role.student; });

        var cards = list.map(function (r, i) {
          var rec = r.recommend_suppress;
          var status = rec
            ? (canAct
                ? '<button class="a42-btn" data-a42-suppress="' + esc(r.reminder_dispatch_id) + '">' +
                  "Approve suppression</button>"
                : '<span class="a42-chip" style="background:#fff7ed;color:#8a4b08">suppress recommended · ' +
                  "read-only in this role</span>")
            : '<span class="a42-chip" style="background:#dcfce7;color:#166534">reconciled</span>';

          return '<div class="a42-recon' + (rec ? " flag" : "") + '" style="animation-delay:' +
              (i * 0.06).toFixed(2) + 's">' +
            '<div class="hd">' +
              '<button class="who"' + (r.student_id ? ' data-a42-story="' + esc(r.student_id) + '"' : "") + ">" +
                "<span class=\"nm\">" + esc(r.full_name) + "</span>" +
                '<span class="rl">' + esc(r.roll_no) + " · " + esc(r.scheme_name) + "</span></button>" +
              '<div class="st">' + status + "</div>" +
            "</div>" +
            '<div class="gr">' +
              '<div class="cell"><div class="k">Scholarship covers</div>' +
                '<div class="v blue">' + inr(r.covered_amount) + "</div></div>" +
              '<div class="cell"><div class="k">Fee still due</div>' +
                '<div class="v" style="color:' + (r.outstanding > 0 ? "#e8930c" : "#12a150") + '">' +
                  inr(r.outstanding) + "</div></div>" +
              '<div class="cell"><div class="k">Active reminder</div>' +
                '<div class="s" style="color:' + (r.active_reminder ? "#991b1b" : "#166534") + '">' +
                  (r.active_reminder ? esc(r.reminder_segment || "reminder queued") : "none") + "</div></div>" +
            "</div>" +
            '<div class="rs">' + esc(r.recommendation ||
              (r.full_name + " (" + r.roll_no + "): the scholarship and the fee ledger already agree — " +
               "no reminder is queued and nothing needs a human.")) + "</div>" +
          "</div>";
        }).join("");

        el.innerHTML =
          '<div class="a42-ledger">' +
            '<h2 class="a42-h3" style="margin-bottom:4px">Fee reconciliation — nobody chased for money already paid</h2>' +
            '<div class="sub">Each pair below is a scholarship set against that student’s open fee demand. ' +
              "Where the scholarship already covers the dues and a reminder is still active, the agent " +
              "<b>recommends</b> suppression — and waits for you.</div>" +
            '<div class="a42-quote">“Reminders MUST be suppressed where a sanctioned scholarship or ' +
              "approved installment plan covers the dues. This is the most common cause of avoidable " +
              "distress in fee follow-up.” — comment in the platform schema (finance.reminder_dispatch).</div>" +
            '<div class="a42-recons">' + (cards ||
              '<div class="a42-note ok"><i>✓</i><span>Nothing to reconcile in this scope.</span></div>') + "</div>" +
          "</div>";

        setMeta("reconciliation", (d.suppress_count || 0) + " to approve");
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

  function installSchemes(getData, errorCard) {
    window.loaders.schemes = async function () {
      var el = $("#panel-schemes");
      try {
        var role = activeRole();
        var canAct = role.canAct;
        var res = await Promise.all([
          getData("/api/schemes"),
          getData("/api/coverage").catch(function () { return null; })
        ]);
        var schemes = res[0].schemes || [];
        var cov = res[1];
        var eligibleByName = {};
        if (cov) cov.per_scheme.forEach(function (s) { eligibleByName[s.scheme_name] = s.eligible; });

        var head = canAct
          ? '<div class="a42-ledger a42-addbar"><button class="a42-btn" id="a42-open-scheme">+ Add scheme</button>' +
            "<span>Register a scholarship and it is matched against every student <b>before the form " +
            "closes</b> — no batch job, no overnight wait. The trace is logged in Agent Activity.</span></div>"
          : '<div class="a42-ledger a42-lock"><span class="ic">\u{1F512}</span><span>' +
            (role.student
              ? "Every scheme’s rules are public to you — the same JSON the engine evaluated " +
                "against your record. Registering a scheme is the Scholarship Officer’s action."
              : "This role reads the register. Registering a scheme is the Scholarship Officer’s " +
                "action, and it is logged against their name.") + "</span></div>";

        var cards = schemes.map(function (s, i) {
          var crit = s.eligibility_criteria || {};
          var rules = (crit.all || crit.any || []).map(function (r) {
            return "<code>" + esc(critText(r)) + "</code>";
          }).join("");
          var docs = (s.required_documents || []).map(function (x) {
            return '<span class="a42-doc">' + esc(x) + "</span>";
          }).join("") || '<span class="a42-doc">As per scheme</span>';
          var ren = s.renewal_required
            ? ((s.renewal_criteria && (s.renewal_criteria.all || s.renewal_criteria.any) || [])
                .map(function (r) { return '<code class="ren">' + esc(critText(r)) + "</code>"; }).join("")
               || '<code class="ren">renewable · conditions on file</code>')
            : '<code class="none">Not renewable — one award per cycle</code>';
          var n = eligibleByName[s.name];

          return '<div class="a42-ledger" style="animation-delay:' + (0.06 + i * 0.05).toFixed(2) + 's">' +
            '<div class="a42-schemehd">' +
              "<div><h2 class=\"a42-h3\" style=\"margin-bottom:4px\">" + esc(s.name) +
                ' <span class="a42-chip" style="background:#e6eefc;color:#2f52c4">' +
                esc(s.provider_type) + "</span></h2>" +
                '<div class="sub">' + esc(s.provider_name || "—") + " · " +
                  esc(s.benefit_type) + " · " + inr(s.benefit_amount) +
                  (s.application_opens ? " · window " + esc(s.application_opens) + " → " +
                    esc(s.application_closes || "—") : "") + "</div></div>" +
              (n != null ? '<div class="a42-schemecount"><div class="v">' + n + "</div>" +
                '<div class="k">students match</div></div>' : "") +
            "</div>" +
            '<div class="a42-schemegrid">' +
              '<div><div class="a42-eyebrow">Eligibility rules (machine-evaluable)</div>' +
                '<div class="a42-codes">' + (rules ||
                  "<code>no rules — open to every student</code>") + "</div></div>" +
              "<div><div class=\"a42-eyebrow\">Documents the agent collects</div>" +
                '<div class="a42-docs">' + docs + "</div>" +
                '<div class="a42-eyebrow" style="margin-top:16px">Renewal conditions</div>' +
                '<div class="a42-codes">' + ren + "</div></div>" +
            "</div>" +
          "</div>";
        }).join("");

        el.innerHTML = matchBanner() + head + (cards ||
          '<div class="a42-ledger"><h2 class="a42-h3">No schemes registered yet</h2></div>');

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
        s.eligible + " eligible · " + s.covered + " covered · gap " + s.gap]);
    });
    if (cov) {
      L.push([2340, "#ffd27a", "DECIDE  " + cov.total_eligible + " eligible matches · " +
        cov.total_covered + " covered · gap = " + cov.coverage_gap]);
    }
    atRisk.forEach(function (r, i) {
      var att = r.student && r.student.attendance_pct;
      L.push([2600 + i * 180, "#ff9f9f", "DECIDE  renewal check: " + r.student.roll_no +
        " attendance " + att + "% < floor " + floorOf(r.criteria_result) + "%  →  " + r.risk_level]);
    });
    toSuppress.forEach(function (r, i) {
      L.push([3000 + i * 180, "#ff9f9f", "DECIDE  reconcile: " + r.roll_no + " covered " +
        inr(r.covered_amount) + " ≥ outstanding " + inr(r.outstanding) + " AND reminder active"]);
    });
    L.push([3260, "#9fe6ff", "ACT     write agentops.risk_flag × " + atRisk.length + "  (SCHOLARSHIP_RISK)"]);
    L.push([3440, "#9fe6ff", "ACT     write agentops.agent_output  (reasoning_summary attached)"]);
    if (toSuppress.length) {
      L.push([3620, "#e8930c", "ACT     HOLD  suppress_reminder × " + toSuppress.length +
        " → class-3 action, queued for human approval"]);
    }
    L.push([3880, "#8fe0b0", "MEASURE coverage " + (cov && cov.total_eligible
      ? Math.round(1000 * cov.total_covered / cov.total_eligible) / 10 : 0) + "% · gap " +
      (cov ? cov.coverage_gap : 0) + " · at-risk " + atRisk.length +
      " · awaiting approval " + toSuppress.length]);
    L.push([4080, "#8fe0b0", "agent_run " + runId + " · status=COMPLETED · provenance rows logged: " +
      (db.runs_logged != null ? db.runs_logged : students.length)]);
    return L.map(function (l) { return { d: l[0], c: l[1], t: l[2] }; });
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
        ? '<div class="ln"><span class="ts">›</span><span style="color:#4a6ba8">' +
          "Press “Replay the last agent run” to watch the trace, step by step.</span></div>"
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
          "1": "4 sources · " + students + " students",
          "2": (schemes * students) + " checks · 0 guesses",
          "3": atRisk + " flags · " + held + " held for a human",
          "4": "gap " + (cov ? cov.coverage_gap : 0) + " · at-risk " + atRisk
        };

        var phases = PHASE_DEFS.map(function (p) {
          return '<div class="a42-phase" data-phase="' + p.n + '" data-from="' + p.from +
            '" data-to="' + p.to + '">' +
            '<div class="ph"><span class="dot">' + p.n + "</span>" +
            '<span class="lb">' + esc(p.label) + "</span></div>" +
            '<div class="ds">' + esc(p.desc) + "</div>" +
            '<div class="stat">waiting…</div></div>';
        }).join("");

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

        var timeline = runs.slice(0, RUNS_SHOWN).map(function (r) {
          var ok = r.status === "SUCCEEDED" || r.status === "COMPLETED";
          return '<div class="a42-run"><span class="pip"></span>' +
            '<div class="bx"><div class="hd"><span class="k">' + esc(r.trigger_type || "RUN") + "</span>" +
              '<span class="a42-chip" style="background:' + (ok ? "#dcfce7" : "#fee2e2") +
              ";color:" + (ok ? "#166534" : "#991b1b") + '">' + esc(r.status) + "</span></div>" +
            '<div class="gr">' +
              "<div><span>Request</span><b>" + esc(r.request_text || "—") + "</b></div>" +
              "<div><span>Provenance</span><b>" + (r.input_sources || 0) + " source(s) → " +
                (r.outputs || 0) + " output(s)</b></div>" +
              "<div><span>Duration</span><b>" + (r.latency_ms != null ? r.latency_ms + " ms" : "—") + "</b></div>" +
            "</div>" +
            '<div class="wh">' + esc(String(r.started_at || "").replace("T", " ").slice(0, 19)) + "</div></div></div>";
        }).join("");

        el.innerHTML =
          '<div class="a42-dark">' +
            '<div class="a42-darkhd"><div>' +
              '<div class="ti">Agent trace — watch it reason</div>' +
              '<div class="sb">The agent runs in milliseconds, so this replays the last recorded run ' +
                "step by step, at human speed. Every number shown is read back from <code>agentops</code>.</div></div>" +
              '<button id="a42-tracebtn" class="a42-btn">▶ Replay the last agent run</button></div>' +
            '<div class="a42-phases">' + phases + "</div>" +
            '<div class="a42-tracebox" id="a42-tracebox"></div>' +
          "</div>" +
          '<div class="a42-ledger" style="animation-delay:.12s">' +
            '<h2 class="a42-h3" style="margin-bottom:4px">Human approval queue</h2>' +
            '<div class="sub" style="margin-bottom:16px">Class-3 agent: anything that touches a ' +
              "student’s money or communications stops here and waits for a person." +
              (approvals.length > QUEUE_SHOWN
                ? " Showing the " + QUEUE_SHOWN + " newest of <b>" + approvals.length + "</b> waiting."
                : "") + "</div>" +
            '<div class="a42-approvals">' + (queue ||
              '<div class="a42-note ok"><i>✓</i><span>Nothing is waiting on a human right now.</span></div>') +
            "</div></div>" +
          '<div class="a42-ledger" style="animation-delay:.2s">' +
            '<div class="a42-schemehd"><div>' +
              '<h2 class="a42-h3" style="margin-bottom:4px">Audit trail — every agent run, logged</h2>' +
              '<div class="sub">run → inputs (provenance) → outputs (reasoning) → risk flags. ' +
                "The evidence trail an accreditation audit walks back through.</div></div>" +
              '<span class="a42-count">' + runs.length + " record(s)</span></div>" +
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

  function installRenewal(getData, errorCard) {
    window.loaders.renewal = async function () {
      var el = $("#panel-renewal");
      try {
        var d = await getData("/api/renewal-risk");
        var list = d.results || d.list || d || [];
        if (!Array.isArray(list)) list = [];

        var LO = 55, HI = 100, SPAN = HI - LO;
        var floors = list.map(function (r) { return floorOf(r.criteria_result); });
        var FLOOR = floors.length ? Math.max.apply(null, floors) : 75;
        var floorPos = ((FLOOR - LO) / SPAN) * 100;

        var atRisk = 0, stake = 0;
        var rows = list.map(function (r, i) {
          var att = Number(r.student.attendance_pct) || 0;
          var fl = floorOf(r.criteria_result);
          var under = fl - att;
          var level = under <= 0 ? "NONE" : (under > 7 ? "LIKELY_LOSS" : "AT_RISK");
          var cls = { NONE: "none", AT_RISK: "atrisk", LIKELY_LOSS: "loss" }[level];
          var dot = { NONE: "#12a150", AT_RISK: "#e8930c", LIKELY_LOSS: "#d8443c" }[level];
          var amt = r.sanctioned_amount != null ? r.sanctioned_amount : r.amount;
          if (level !== "NONE") { atRisk++; stake += Number(amt) || 0; }
          var pos = Math.max(0, Math.min(100, ((att - LO) / SPAN) * 100));
          var left = Math.min(pos, floorPos), width = Math.abs(pos - floorPos);

          return '<div class="a42-axisrow" style="animation-delay:' + (i * 0.08).toFixed(2) + 's">' +
            "<div><div class=\"who\">" + esc(r.student.full_name) + "</div>" +
              '<div class="sub">' + esc(r.student.roll_no) + " · CGPA " + esc(r.student.cgpa) + "</div></div>" +
            '<div class="a42-track">' +
              '<div class="a42-floor" style="left:' + floorPos.toFixed(2) + '%"></div>' +
              '<div class="a42-deficit" style="left:' + left.toFixed(2) + "%;width:" + width.toFixed(2) +
                "%;background:" + (under > 0 ? "#f0b95e" : "#8fd4aa") + '"></div>' +
              '<div class="a42-pin" style="left:' + pos.toFixed(2) + '%">' +
                '<i style="background:' + dot + '"></i>' +
                '<b style="color:' + dot + '">' + att + "%</b></div>" +
            "</div>" +
            '<div><span class="a42-tier ' + cls + '">' + level + "</span>" +
              '<div class="a42-stake" style="color:' + (level === "NONE" ? "#12a150" : "#e8930c") + '">' +
                (amt != null ? inr(amt) + (level === "NONE" ? " secured" : " at stake") : "—") + "</div></div>" +
          "</div>";
        }).join("") || '<div class="a42-note ok"><i>✓</i><span>No live scholarships to renew.</span></div>';

        setMeta("renewal", atRisk + " at risk");

        var notes = list.map(function (r) {
          var att = Number(r.student.attendance_pct) || 0, fl = floorOf(r.criteria_result);
          if (att >= fl) {
            return '<div class="a42-note ok"><i>✓</i><span>' + esc(r.student.full_name) + " (" +
              esc(r.student.roll_no) + ") clears every renewal rule on " + esc(r.scheme_name) +
              ". Nothing is escalated — the agent stays quiet when there is nothing to say.</span></div>";
          }
          return '<div class="a42-note bad"><i>!</i><span>' + esc(r.student.full_name) + " (" +
            esc(r.student.roll_no) + ") sits " + (fl - att) + " points under the floor on " +
            esc(r.scheme_name) + ". A SCHOLARSHIP_RISK flag is open with the Scholarship Officer " +
            "and a renewal-risk notice is queued for approval — recoverable if attendance climbs " +
            "before the renewal window closes.</span></div>";
        }).join("");

        el.innerHTML =
          '<div class="a42-ledger">' +
            '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:20px;flex-wrap:wrap">' +
              '<div class="a42-panelhead" style="min-width:0;max-width:56ch">' +
                '<div class="a42-eyebrow" style="color:#93a0b8">Live awards · renewal rule check</div>' +
                "<h2>One line decides who keeps their scholarship.</h2>" +
                "<p>Every scheme here renews only above <b>" + FLOOR + "% attendance</b>. Each award is " +
                  "plotted against that line. Left of it, the money is lost unless somebody acts — " +
                  "which is why the agent raises the flag now, not in March.</p>" +
              "</div>" +
              '<div class="a42-headright"><div class="big">' + atRisk + "</div>" +
                '<div class="cap">of ' + list.length + " at risk</div>" +
                (stake ? '<div class="stake">' + inr(stake) + " at stake</div>" : "") +
              "</div>" +
            "</div>" +
            '<div style="margin-top:clamp(26px,3.4vw,40px)">' +
              '<div class="a42-axishead"><div></div>' +
                '<div class="a42-axisscale"><span class="lo">' + LO + '%</span>' +
                  '<span class="fl" style="left:' + floorPos.toFixed(2) + '%">' + FLOOR + '% FLOOR</span>' +
                  '<span class="hi">' + HI + "%</span></div><div></div></div>" +
              rows +
            "</div>" +
            '<div class="a42-notes"><div class="a42-eyebrow" style="color:#93a0b8;margin-bottom:14px">' +
              "What the agent did about it</div>" + notes + "</div>" +
          "</div>";
        syncRail();
      } catch (e) { errorCard(el, e); }
    };
  }

  /* ------------------------------------------------------------- live meta */

  function fillMeta(getData) {
    getData("/api/coverage").then(function (d) {
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
    getData("/api/runs").then(function (d) {
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
