/* RVNP portal app shell. Turns an existing page into: sidebar (grouped navigation) + top bar + one section at a time.
   It only moves and shows/hides the page's own elements, so every existing button, id and handler keeps working. */
(function () {
  "use strict";
  var P = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.2c1.8.7 3 2.4 3 4.8"/>',
    shield: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
    inbox: '<path d="M4 13l2-8h12l2 8"/><path d="M4 13v6h16v-6h-5l-1 2h-4l-1-2z"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.4"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3 17.7 6.3 21l6.3-6.3a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
    db: '<ellipse cx="12" cy="5.5" rx="7" ry="2.8"/><path d="M5 5.5v13c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-13"/><path d="M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8"/>',
    pin: '<path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    chart: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 16v-5"/><path d="M12 16V8"/><path d="M16 16v-8"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>'
  };
  function svg(n, cls) { return '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[n] || P.grid) + "</svg>"; }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function tokenInfo() {
    try { var t = sessionStorage.getItem("rvnp_user") || ""; return JSON.parse(atob(t.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"))); } catch (e) { return {}; }
  }

  function mount(c) {
    var root = c.root || document.querySelector(".wrap");
    if (!root) return;
    document.body.classList.add("sh-on");
    (c.hide || []).forEach(function (sel) { Array.prototype.forEach.call(root.querySelectorAll(sel), function (n) { n.hidden = true; n.style.display = "none"; }); });

    var shell = el("div", "sh"), side = el("aside", "sh-side"), main = el("div", "sh-main"), top = el("div", "sh-top"), nav = el("nav", "sh-nav");
    side.setAttribute("aria-label", "Main menu"); nav.setAttribute("aria-label", c.brand.name + " sections");
    side.appendChild(el("div", "sh-brand", '<span class="sh-mark">' + esc(c.brand.letter) + "</span><span><b>" + esc(c.brand.name) + "</b><small>" + esc(c.brand.sub || "") + "</small></span>"));
    if (c.userLine) side.appendChild(el("div", "sh-user", c.userLine));
    side.appendChild(nav);
    side.appendChild(el("div", "sh-foot", "Rift Valley National Polytechnic<br>Industrial Linkages Office"));

    var titleSmall = el("small", "", esc(c.brand.name)), titleMain = el("b", "", esc(c.title || ""));
    top.setAttribute("role", "banner"); var tbox = el("div", "sh-title"); tbox.appendChild(titleSmall); tbox.appendChild(titleMain);
    var burger = el("button", "sh-ib sh-burger", svg("menu")); burger.type = "button"; burger.setAttribute("aria-label", "Open menu");
    top.appendChild(burger); top.appendChild(tbox);

    /* top-bar extras: pop-over panels (existing cards are moved in, so their ids and handlers stay) and links */
    (c.top || []).forEach(function (t) {
      if (t.href) { var a = el("a", "sh-ib", svg(t.icon)); a.href = t.href; a.title = t.label; a.setAttribute("aria-label", t.label); if (t.newtab) { a.target = "_blank"; a.rel = "noopener"; } top.appendChild(a); return; }
      if (t.panel) {
        var dd = el("div", "dd"), b = el("button", "sh-ib", svg(t.icon)), m = el("div", "menu");
        b.type = "button"; b.title = t.label; b.setAttribute("aria-label", t.label); b.setAttribute("aria-haspopup", "true");
        m.appendChild(t.panel); dd.appendChild(b); dd.appendChild(m); top.appendChild(dd);
        b.onclick = function (e) { e.stopPropagation(); dd.classList.toggle("open"); };
        document.addEventListener("click", function (e) { if (!dd.contains(e.target)) dd.classList.remove("open"); });
      }
    });
    var out = el("button", "sh-ib", svg("out")); out.type = "button"; out.title = "Sign out"; out.setAttribute("aria-label", "Sign out");
    out.onclick = function () { c.signOut ? c.signOut() : (sessionStorage.clear(), location.href = "/auth.html?role=staff"); };
    top.appendChild(out);

    var content = root; content.classList.add("sh-content");
    main.appendChild(top); main.appendChild(content);
    var scrim = el("div", "sh-scrim");
    shell.appendChild(side); shell.appendChild(scrim); shell.appendChild(main);
    document.body.insertBefore(shell, document.body.firstChild);

    function closeDrawer() { shell.classList.remove("sh-open"); }
    burger.onclick = function () { shell.classList.toggle("sh-open"); };
    scrim.onclick = closeDrawer;
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });

    /* navigation */
    var items = [];
    function setTitle(it) { titleMain.textContent = it.label; titleSmall.textContent = it.group || c.brand.name; }
    function select(it) {
      items.forEach(function (x) { if (x.view) { x.view.hidden = x !== it; (x.extra || []).forEach(function (e) { e.hidden = x !== it; }); } if (x.btn) x.btn.setAttribute("aria-selected", x === it ? "true" : "false"); });
      setTitle(it); closeDrawer();
      try { sessionStorage.setItem("sh_view_" + location.pathname, it.key); } catch (e) {}
      window.scrollTo(0, 0);
    }
    (c.groups || []).forEach(function (g) {
      nav.appendChild(el("div", "sh-grp", esc(g.label)));
      g.items.forEach(function (n, i) {
        var it = { key: n.key || (g.label + i), label: n.label, group: g.label, view: n.view || null, extra: n.extra || [] };
        if (n.tab) {   /* an existing tab button: keep its own click handler, just move and restyle it */
          it.btn = n.tab; it.btn.insertAdjacentHTML("afterbegin", svg(n.icon, "sh-ic")); nav.appendChild(it.btn);
          it.btn.addEventListener("click", function () { setTitle(it); closeDrawer(); window.scrollTo(0, 0); });
          new MutationObserver(function () { if (it.btn.getAttribute("aria-selected") === "true") setTitle(it); }).observe(it.btn, { attributes: true, attributeFilter: ["aria-selected"] });
          if (it.btn.getAttribute("aria-selected") === "true") setTitle(it);
        } else {
          it.btn = el("button", "sh-item", svg(n.icon) + "<span>" + esc(n.label) + "</span>"); it.btn.type = "button"; it.btn.setAttribute("aria-selected", "false");
          it.btn.onclick = function () { select(it); }; nav.appendChild(it.btn);
        }
        items.push(it);
      });
    });
    /* hide count badges that read 0 */
    function badges() { Array.prototype.forEach.call(nav.querySelectorAll(".badge"), function (b) { var z = !b.textContent.trim() || b.textContent.trim() === "0"; if (z) b.setAttribute("data-zero", ""); else b.removeAttribute("data-zero"); }); }
    badges(); new MutationObserver(badges).observe(nav, { childList: true, subtree: true, characterData: true });
    var viewItems = items.filter(function (x) { return x.view; });
    if (viewItems.length) {
      var want = ""; try { want = sessionStorage.getItem("sh_view_" + location.pathname) || ""; } catch (e) {}
      select(viewItems.filter(function (x) { return x.key === want; })[0] || viewItems[0]);
    }

    /* locked state: while the sign-in / access-code screen is showing, hide the sidebar and icons */
    if (c.unlockedWhen) {
      var w = document.querySelector(c.unlockedWhen);
      var sync = function () { shell.classList.toggle("sh-locked", !!(w && w.hidden)); };
      if (w) { new MutationObserver(sync).observe(w, { attributes: true, attributeFilter: ["hidden"] }); sync(); }
    }
    return { select: select, items: items };
  }
  window.RVShell = { mount: mount, tokenInfo: tokenInfo };
})();
