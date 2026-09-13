/* Production-grade cookie consent: Allow all / Allow selected / Deny all,
   with per-category toggles. Self-injects its markup so it works on any page.
   Choices are enforced: denying "Preferences" forgets the saved theme, and
   denying "AI features" makes the chat answer without sending data to Google. */
(function () {
  "use strict";
  var KEY = "agent42-consent";

  function get() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } }
  function persist(c) {
    c.ts = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {}
    window.__consent = c;
    if (c.preferences === false) { try { localStorage.removeItem("agent42-theme"); } catch (e) {} }
  }
  // Chat reads this before contacting Gemini. Default allow until a choice is made.
  window.aiConsent = function () { var c = get(); return c ? c.ai !== false : true; };

  var markup =
    '<div id="cc-banner" class="cc-banner" hidden>' +
      '<div class="cc-text"><b>Cookies &amp; privacy.</b> We use essential cookies to sign you in, ' +
        'plus optional cookies for preferences and AI features. ' +
        '<a href="/cookies">Learn more</a>.</div>' +
      '<div class="cc-actions">' +
        '<button class="cc-btn" data-cc="deny">Deny all</button>' +
        '<button class="cc-btn" data-cc="custom">Allow selected</button>' +
        '<button class="cc-btn primary" data-cc="allow">Allow all</button>' +
      '</div>' +
    '</div>' +
    '<div id="cc-modal" class="cc-modal" hidden>' +
      '<div class="cc-backdrop" data-cc="close"></div>' +
      '<div class="cc-card" role="dialog" aria-modal="true" aria-label="Cookie preferences">' +
        '<h3>Cookie preferences</h3>' +
        '<p>Choose which cookies to allow. You can change this anytime from “Cookie settings” in the footer.</p>' +
        '<label class="cc-row"><span><b>Strictly necessary</b>' +
          '<small>Keeps you signed in. Always active.</small></span>' +
          '<span class="cc-switch"><input type="checkbox" checked disabled><span class="cc-slider"></span></span></label>' +
        '<label class="cc-row"><span><b>Preferences</b>' +
          '<small>Remembers your theme (light / dark) on this device.</small></span>' +
          '<span class="cc-switch"><input type="checkbox" id="cc-pref"><span class="cc-slider"></span></span></label>' +
        '<label class="cc-row"><span><b>AI features</b>' +
          '<small>The chat assistant sends your question and relevant figures to Google (Gemini) ' +
          'to phrase a reply. Off = the assistant answers from built-in templates, no data leaves the service.</small></span>' +
          '<span class="cc-switch"><input type="checkbox" id="cc-ai"><span class="cc-slider"></span></span></label>' +
        '<div class="cc-modal-actions">' +
          '<button class="cc-btn" data-cc="deny">Deny all</button>' +
          '<button class="cc-btn primary" data-cc="save">Save choices</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  var host = document.createElement("div");
  host.innerHTML = markup;
  document.body.appendChild(host);

  var banner = document.getElementById("cc-banner");
  var modal = document.getElementById("cc-modal");
  var prefBox = document.getElementById("cc-pref");
  var aiBox = document.getElementById("cc-ai");

  function openModal() {
    var c = get() || {};
    prefBox.checked = c.preferences !== false && !!c.preferences || c.choice === "all";
    aiBox.checked = c.ai !== false && !!c.ai || c.choice === "all";
    if (!c.choice) { prefBox.checked = true; aiBox.checked = true; }
    modal.hidden = false;
  }
  function closeModal() { modal.hidden = true; }
  function decide(pref, ai, choice) {
    persist({ necessary: true, preferences: pref, ai: ai, choice: choice });
    banner.hidden = true; closeModal();
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-cc]");
    if (t) {
      var a = t.getAttribute("data-cc");
      if (a === "allow") decide(true, true, "all");
      else if (a === "deny") decide(false, false, "deny");
      else if (a === "custom") openModal();
      else if (a === "close") closeModal();
      else if (a === "save") decide(prefBox.checked, aiBox.checked, "selected");
      return;
    }
    if (e.target.closest("[data-cb-settings]")) { e.preventDefault(); openModal(); }
  });

  var existing = get();
  if (!existing) banner.hidden = false;
  else { window.__consent = existing; if (existing.preferences === false) { try { localStorage.removeItem("agent42-theme"); } catch (e) {} } }
})();
