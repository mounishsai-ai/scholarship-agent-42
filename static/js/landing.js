"use strict";
/* ============================================================
   Agent 42 — Landing page motion + live coverage.
   Fail-safe design: the page is fully visible by default. The
   hidden-until-revealed state is only applied AFTER we add the
   `.js-motion` class from JS, and only when motion is allowed.
   If GSAP is missing / blocked / throws, nothing disappears.
   ============================================================ */
(function () {
  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hasGSAP = typeof window.gsap !== "undefined";
  var motionOn = !reduceMotion && hasGSAP;

  // ---- Intro gate: play the load animation only once the visitor can see it.
  //      First visit -> the cookie wall is up, so wait for the choice; a
  //      returning visitor (consent already stored) plays immediately. A 6s
  //      safety timer guarantees the intro is never left unplayed. ----
  var _readyCbs = [], _ready = false;
  function markReady() {
    if (_ready) return; _ready = true;
    _readyCbs.forEach(function (f) { try { f(); } catch (e) {} });
    _readyCbs = [];
  }
  function onReady(cb) { if (_ready) cb(); else _readyCbs.push(cb); }
  (function () {
    var has = false;
    try { has = !!localStorage.getItem("agent42-consent"); } catch (e) {}
    if (has) { markReady(); return; }        // returning visitor — no wall
    window.addEventListener("cc:consent", markReady, { once: true });
    setTimeout(markReady, 6000);             // safety net
  })();

  // ---- Hero video loop: at the end, 0.5s of dark, then restart (no fades) ----
  (function () {
    var v = document.getElementById("hero-video");
    var wrap = document.getElementById("hero-video-wrap");
    if (!v) return;
    // autoplay may start before this script runs, so also mark it on the first frame update
    function markPlaying() { if (wrap) wrap.classList.add("is-playing"); }
    if (!v.paused) markPlaying();
    v.addEventListener("playing", markPlaying);
    v.addEventListener("timeupdate", markPlaying);
    v.addEventListener("ended", function () {
      v.classList.add("is-dark");
      setTimeout(function () {
        v.currentTime = 0;
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
        v.classList.remove("is-dark");
      }, 500);
    });
  })();

  // ---- Nav shadow on scroll (cheap, no dependency) ----
  var nav = document.getElementById("nav");
  function onScrollNav() {
    if (nav) nav.classList.toggle("scrolled", window.scrollY > 8);
  }
  window.addEventListener("scroll", onScrollNav, { passive: true });
  onScrollNav();

  // ---- Coverage meter: draw immediately from the static numbers,
  //      then upgrade to live data if the API answers. ----
  function drawMeter(eligible, covered, live) {
    var gap = Math.max(eligible - covered, 0);
    setNum("stat-eligible", eligible);
    setNum("stat-covered", covered);
    setNum("stat-gap", gap);
    var pct = eligible > 0 ? Math.round((covered / eligible) * 100) : 0;
    var fill = document.getElementById("meter-fill");
    if (fill) {
      // rAF so the width transition actually runs from 0
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { fill.style.width = pct + "%"; });
      });
    }
    var gapLabel = document.getElementById("meter-gap-label");
    if (gapLabel) gapLabel.textContent = gap + " unclaimed";
    var bar = document.querySelector(".meter-bar");
    if (bar) bar.setAttribute("aria-label",
      "Coverage: " + covered + " of " + eligible + " eligible matches are covered; gap of " + gap);
    if (live) {
      var badge = document.getElementById("meter-source");
      if (badge) { badge.textContent = "live · platform DB"; badge.classList.add("live"); }
    }
  }
  function setNum(id, val) {
    var el = document.getElementById(id);
    if (!el) return;
    if (reduceMotion || !motionOn) { el.textContent = val; return; }
    countUp(el, val);
  }
  function countUp(el, target) {
    var start = 0, dur = 900, t0 = null;
    function step(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min((ts - t0) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(start + (target - start) * eased);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = target;
    }
    requestAnimationFrame(step);
  }

  // Live numbers only — the meter shows dashes until the database answers, so it
  // never flashes a figure that isn't true. Gated so the count-up is actually seen.
  function meterOffline() {
    var badge = document.getElementById("meter-source");
    if (badge) badge.textContent = "offline";
  }
  fetch("/api/coverage")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || d.error || typeof d.total_eligible !== "number") { meterOffline(); return; }
      onReady(function () {
        var k = document.getElementById("meter-kicker");
        if (k && d.students && d.students.total) {
          k.textContent = "Live coverage across " + d.students.total.toLocaleString("en-IN") + " CSE students";
        }
        drawMeter(d.total_eligible, d.total_claimed != null ? d.total_claimed : d.total_covered, true);
        renderCoverageRows(d.per_scheme);
      });
    })
    .catch(meterOffline);

  function renderCoverageRows(per) {
    if (!Array.isArray(per) || !per.length) return;
    var host = document.getElementById("coverage-cols");
    if (!host) return;
    var head = '<div class="cov-row cov-head"><span>Scheme</span><span>Eligible</span>' +
               '<span>Covered</span><span>Gap</span></div>';
    var rows = per.map(function (s) {
      return '<div class="cov-row"><span>' + escapeHtml(s.scheme_name) + '</span>' +
             '<span>' + s.eligible + '</span>' +
             '<span class="c-ok">' + (s.eligible_claimed != null ? s.eligible_claimed : s.covered) + '</span>' +
             '<span class="c-gap">' + s.gap + '</span></div>';
    }).join("");
    host.innerHTML = head + rows;
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // ---- Motion. Everything below is optional polish. ----
  if (!motionOn) return;

  var root = document.documentElement;
  root.classList.add("js-motion");   // NOW the reveal-hidden CSS applies

  try {
    gsap.registerPlugin(ScrollTrigger);

    // Lenis smooth scroll (landing only). Skip entirely if unavailable.
    var lenis = null;
    if (typeof window.Lenis !== "undefined") {
      lenis = new Lenis({ duration: 1.05, smoothWheel: true });
      root.classList.add("lenis-on");
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      gsap.ticker.lagSmoothing(0);
      // keep in-page anchors working with Lenis
      document.querySelectorAll('a[href^="#"]').forEach(function (a) {
        a.addEventListener("click", function (e) {
          var id = a.getAttribute("href");
          if (id.length < 2) return;
          var target = document.querySelector(id);
          if (target) { e.preventDefault(); lenis.scrollTo(target, { offset: -70 }); }
        });
      });
    }

    // Scroll reveals — motivated: content enters as its section arrives.
    // Hero elements are handled by the load stagger below, not here.
    gsap.utils.toArray("[data-reveal]").filter(function (el) {
      return !el.closest("#hero");
    }).forEach(function (el) {
      gsap.to(el, {
        opacity: 1, y: 0, duration: 0.8, ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 86%", once: true }
      });
    });

    // Hero: reveal on load in a short stagger (hierarchy). Hidden immediately,
    // then revealed once the visitor can see it (after the cookie choice).
    var heroBits = gsap.utils.toArray("#hero [data-reveal]");
    gsap.set(heroBits, { opacity: 0, y: 26 });
    onReady(function () {
      gsap.to(heroBits, {
        opacity: 1, y: 0, duration: 0.9, ease: "power3.out",
        stagger: 0.09, delay: 0.15
      });
    });

    ScrollTrigger.refresh();
  } catch (err) {
    // Any failure: reveal everything so nothing is stuck hidden.
    root.classList.remove("js-motion");
    document.querySelectorAll("[data-reveal]").forEach(function (el) {
      el.style.opacity = "1"; el.style.transform = "none";
    });
  }
})();

// ============================================================
// Sign-in modal + "signing you in" transition overlay.
// Separate IIFE so it always runs, regardless of motion settings.
// ============================================================
(function () {
  var modal = document.getElementById("signin-modal");
  var overlay = document.getElementById("signin-overlay");

  function openModal() {
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    var first = modal.querySelector('.method-form:not([hidden]) input');
    if (first) setTimeout(function () { first.focus(); }, 30);
  }
  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = "";
  }
  document.querySelectorAll("[data-open-signin]").forEach(function (b) {
    b.addEventListener("click", openModal);
  });

  // A failed register-number sign-in comes back as /?signin=regid&error=...:
  // reopen the modal on that tab with the number kept and a plain message.
  (function () {
    var q = new URLSearchParams(window.location.search);
    if (q.get("signin") !== "regid") return;
    var tab = document.querySelector('.method-tab[data-method="regid"]');
    if (tab) tab.click();
    var form = document.querySelector('[data-method-form="regid"]');
    var err = document.getElementById("regid-error");
    if (form && q.get("regno")) form.querySelector('[name="identifier"]').value = q.get("regno");
    if (err && q.get("error")) {
      err.textContent = q.get("error") === "unavailable"
        ? "Sign-in is unavailable right now — the database did not answer. Please try again."
        : "That register number and password don't match. First time? Your password is your register number.";
      err.hidden = false;
    }
    openModal();
    var pw = form && form.querySelector('[name="secret"]');
    if (pw) setTimeout(function () { pw.focus(); }, 60);
    if (window.history && history.replaceState) history.replaceState(null, "", window.location.pathname);
  })();
  document.querySelectorAll("[data-close-signin]").forEach(function (b) {
    b.addEventListener("click", closeModal);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeModal();
  });

  // method tabs inside the modal
  document.querySelectorAll(".method-tab").forEach(function (t) {
    t.addEventListener("click", function () {
      document.querySelectorAll(".method-tab").forEach(function (x) { x.classList.remove("active"); });
      t.classList.add("active");
      var m = t.dataset.method;
      document.querySelectorAll("[data-method-form]").forEach(function (f) {
        f.hidden = f.dataset.methodForm !== m;
      });
      var inp = document.querySelector('[data-method-form="' + m + '"] input');
      if (inp) inp.focus();
    });
  });

  function playOverlay(label, go) {
    if (overlay) {
      var t = overlay.querySelector(".overlay-text");
      if (t) t.textContent = label;
      overlay.hidden = false;
    }
    window.setTimeout(go, 700);
  }

  // Fake Google account-picker (no real OAuth). Each account signs in as ONE
  // role; guest is the only login that can preview every role.
  function googleBluff() {
    var ov = document.getElementById("google-overlay");
    if (!ov) return;
    ov.querySelector(".g-step-1").hidden = false;
    ov.querySelector(".g-step-2").hidden = true;
    ov.hidden = false;
  }
  function postLogin(mode, role, identifier) {
    var f = document.createElement("form");
    f.method = "post"; f.action = "/login";
    [["mode", mode], ["role", role || ""], ["identifier", identifier || ""]].forEach(function (kv) {
      var i = document.createElement("input"); i.type = "hidden"; i.name = kv[0]; i.value = kv[1]; f.appendChild(i);
    });
    document.body.appendChild(f); HTMLFormElement.prototype.submit.call(f);
  }
  document.querySelectorAll("#google-overlay .g-account").forEach(function (acc) {
    acc.addEventListener("click", function () {
      var ov = document.getElementById("google-overlay");
      ov.querySelector(".g-step-1").hidden = true;
      ov.querySelector(".g-step-2").hidden = false;
      window.setTimeout(function () { postLogin("google", acc.dataset.role, acc.dataset.email); }, 1100);
    });
  });
  document.querySelectorAll("[data-close-google]").forEach(function (b) {
    b.addEventListener("click", function () {
      var ov = document.getElementById("google-overlay"); if (ov) ov.hidden = true;
    });
  });

  // Every sign-in path plays a short overlay, then submits — a smooth hand-off.
  // Google mode shows the bluff account-picker; everything else the plain overlay.
  document.querySelectorAll('form[action$="/login"]').forEach(function (f) {
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var modeEl = f.querySelector('[name="mode"]');
      var submit = function () { HTMLFormElement.prototype.submit.call(f); };
      if (modeEl && modeEl.value === "google") googleBluff(submit);
      else playOverlay("Signing you in…", submit);
    });
  });

  // "Open dashboard" links (shown once signed in) — same smooth hand-off,
  // so entering the dashboard never jerks.
  document.querySelectorAll('a[href$="/dashboard"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      var href = a.getAttribute("href");
      playOverlay("Opening dashboard…", function () { window.location.href = href; });
    });
  });

  // Back/forward (Alt+←) restores the page from bfcache with the overlay still
  // showing — clear all overlays on show so it never gets stuck on "Opening…".
  window.addEventListener("pageshow", function () {
    if (overlay) overlay.hidden = true;
    var g = document.getElementById("google-overlay");
    if (g) g.hidden = true;
    document.body.style.overflow = "";
  });
})();
