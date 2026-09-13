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
      if (badge) { badge.textContent = "live · seeded DB"; badge.classList.add("live"); }
    }
  }
  function setNum(id, val) {
    var el = document.getElementById(id);
    if (!el) return;
    if (reduceMotion || !motionOn) { el.textContent = val; return; }
    countUp(el, val);
  }
  function countUp(el, target) {
    var start = 0, dur = 1350, t0 = null;
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

  // Static baseline (matches seeded DB); upgrade if fetch succeeds.
  drawMeter(29, 4, false);

  fetch("/api/coverage")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || d.error || typeof d.total_eligible !== "number") return;
      drawMeter(d.total_eligible, d.total_covered, true);
      renderCoverageRows(d.per_scheme);
    })
    .catch(function () { /* offline / no DB: keep static numbers */ });

  function renderCoverageRows(per) {
    if (!Array.isArray(per) || !per.length) return;
    var host = document.getElementById("coverage-cols");
    if (!host) return;
    var head = '<div class="cov-row cov-head"><span>Scheme</span><span>Eligible</span>' +
               '<span>Covered</span><span>Gap</span></div>';
    var rows = per.map(function (s) {
      return '<div class="cov-row"><span>' + escapeHtml(s.scheme_name) + '</span>' +
             '<span>' + s.eligible + '</span>' +
             '<span class="c-ok">' + s.covered + '</span>' +
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
        opacity: 1, y: 0, duration: 1.2, ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 86%", once: true }
      });
    });

    // Hero: reveal on load in a short stagger (hierarchy).
    var heroBits = gsap.utils.toArray("#hero [data-reveal]");
    gsap.set(heroBits, { opacity: 0, y: 26 });
    gsap.to(heroBits, {
      opacity: 1, y: 0, duration: 1.35, ease: "power3.out",
      stagger: 0.135, delay: 0.22
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
