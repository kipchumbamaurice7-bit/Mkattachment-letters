/* Makes the portal installable: registers the app worker and shows an "Install app" button. */
(function () {
  if ("serviceWorker" in navigator) window.addEventListener("load", function () { navigator.serviceWorker.register("/sw.js").catch(function () {}); });
  var standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  if (standalone) return;
  var deferred = null, btn, panel;
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  function make() {
    if (btn) return;
    btn = document.createElement("button");
    btn.type = "button"; btn.id = "pwa-install"; btn.setAttribute("aria-label", "Install this app");
    btn.style.cssText = "position:fixed;right:14px;bottom:14px;z-index:9999;display:flex;align-items:center;gap:8px;padding:11px 16px;border:0;border-radius:999px;background:linear-gradient(135deg,#17803f,#0f6330);outline:3px solid #f28a1d;outline-offset:-3px;color:#fff;font:600 15px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3);cursor:pointer";
    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0l-4-4m4 4l4-4"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg><span>Install app</span>';
    btn.onclick = onTap;
    document.body.appendChild(btn);
  }
  function onTap() {
    if (deferred) {
      deferred.prompt();
      deferred.userChoice.then(function () { deferred = null; }).catch(function () {});
      return;
    }
    showHelp();
  }
  function showHelp() {
    if (panel) { panel.remove(); panel = null; return; }
    panel = document.createElement("div");
    panel.style.cssText = "position:fixed;left:12px;right:12px;bottom:70px;z-index:9999;max-width:420px;margin-left:auto;background:#fff;color:#12301f;border:1px solid #cfe0d4;border-radius:14px;padding:14px 16px;box-shadow:0 8px 28px rgba(0,0,0,.3);font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    var steps = ios
      ? "<b>Install on iPhone / iPad</b><ol style='margin:8px 0 0;padding-left:20px'><li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button (square with an arrow).</li><li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol>"
      : "<b>Install this app</b><ol style='margin:8px 0 0;padding-left:20px'><li>Open your browser menu (the <b>&#8942;</b> or <b>&#8801;</b> button).</li><li>Choose <b>Install app</b> or <b>Add to Home screen</b>.</li><li>Confirm. The RVNP icon then appears on your phone.</li></ol>";
    panel.innerHTML = steps + "<div style='text-align:right;margin-top:10px'><button type='button' style='border:0;background:#e3f3e8;color:#12301f;border-radius:8px;padding:8px 14px;font:600 14px system-ui;cursor:pointer'>Close</button></div>";
    panel.querySelector("button").onclick = function () { panel.remove(); panel = null; };
    document.body.appendChild(panel);
  }
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; make(); });
  window.addEventListener("appinstalled", function () { if (btn) btn.remove(); if (panel) panel.remove(); deferred = null; });
  function init() { make(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
