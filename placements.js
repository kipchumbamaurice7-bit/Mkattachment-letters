/* RVNP placements and trainers (HOD, Deputy HOD; Admin can view and remove).
   Filters go from the widest to the narrowest: Department > Region > County > Town > Place (the organization).
   Students are grouped by town and place, so a whole place or town can be given to one trainer in one tap.
   RVPlace.mount(roots, { headers, onAuthFail, canAssign, canRemove, onData, onOpenAssign })
   roots: one element (shows an Assign / Trainers switch inside it) or { assign: el, trainers: el }. */
(function () {
  "use strict";
  var U = window.RVU, esc = U.esc, NC = "__nc", PAGE = 150;

  function mount(roots, o) {
    o = o || {};
    var canAssign = o.canAssign !== false, canNotify = o.canNotify != null ? !!o.canNotify : canAssign, api = U.api(o.headers, o.onAuthFail);
    var D = null, SEL = {}, F = { q: "", d: "", r: "", c: "", t: "", o: "", s: "none" }, limit = PAGE, GROUPS = [], view = [];
    var elA, elT, tabs = null;

    if (roots && roots.nodeType) {
      roots.classList.add("rv");
      roots.innerHTML = '<div class="rp-tabs" role="tablist"><button type="button" class="on" data-tab="a">Assign students</button><button type="button" data-tab="t">Trainers</button></div><div data-pane="a"></div><div data-pane="t" hidden></div>';
      elA = roots.querySelector('[data-pane="a"]'); elT = roots.querySelector('[data-pane="t"]'); tabs = roots;
      roots.querySelector(".rp-tabs").addEventListener("click", function (e) { var b = e.target.closest("[data-tab]"); if (b) openTab(b.getAttribute("data-tab")); });
    } else { elA = roots.assign; elT = roots.trainers; elA.classList.add("rv"); elT.classList.add("rv"); }
    function openTab(w) {
      if (!tabs) return;
      elA.hidden = w !== "a"; elT.hidden = w !== "t";
      Array.prototype.forEach.call(tabs.querySelectorAll("[data-tab]"), function (b) { b.classList.toggle("on", b.getAttribute("data-tab") === w); });
    }

    /* ------------------------------ assign view ------------------------------ */
    elA.innerHTML =
      '<div class="rv-stats rp-stats"></div>' +
      '<div class="card rv-filters">' +
      '<div class="rv-fgrid">' +
      '<div class="rv-f rv-s3"><label>Department</label><select data-f="d"></select></div>' +
      '<div class="rv-f rv-s3"><label>Region</label><select data-f="r"></select></div>' +
      '<div class="rv-f rv-s2"><label>County</label><select data-f="c"></select></div>' +
      '<div class="rv-f rv-s2"><label>Town</label><select data-f="t"></select></div>' +
      '<div class="rv-f rv-s2"><label>Place (organization)</label><select data-f="o"></select></div>' +
      '<div class="rv-f rv-s3"><label>Show</label><select data-f="s"></select></div>' +
      '<div class="rv-f rv-s3"><label>Search</label><input data-f="q" type="search" autocomplete="off" placeholder="Student, admission number, organization, supervisor"></div>' +
      '</div>' +
      '<div class="rv-crumbs"></div>' +
      '<div class="rv-bar"><span class="rv-count"></span><span class="rv-btns"></span></div>' +
      '</div>' +
      '<div class="msg" data-m="a" role="status"></div>' +
      '<div class="rp-list"></div>' +
      (canAssign ? '<div class="rp-bar" hidden><b class="rp-n"></b><select class="rp-tr" aria-label="Trainer"></select><button type="button" class="btn" data-a="go">Assign</button><button type="button" class="btn sec" data-a="clr">Clear</button></div>' : "");
    var qa = function (s) { return elA.querySelector(s); }, sel = {};
    ["d", "r", "c", "t", "o", "s", "q"].forEach(function (k) { sel[k] = qa('[data-f="' + k + '"]'); });
    var list = qa(".rp-list"), msgA = qa('[data-m="a"]'), bar = qa(".rp-bar");
    qa(".rv-btns").innerHTML = (canAssign ? '<button class="btn sec" data-a="selall" type="button">Select all shown</button>' : "") + '<button class="btn sec" data-a="xl" type="button">Download Excel</button><button class="btn sec" data-a="csv" type="button">CSV</button><button class="btn sec" data-a="rf" type="button">Refresh</button>';

    async function load() {
      U.say(msgA, "info", "Loading placements\u2026");
      try { D = await api("GET", "hod/data"); U.say(msgA, "", ""); SEL = {}; sync(); drawTrainers(); if (o.onData) o.onData(D); }
      catch (e) { U.say(msgA, "err", e.message); }
    }

    /* ---- filters ---- */
    function trainer(id) { return D.trainers.filter(function (t) { return t.id === id; })[0]; }
    function region(p) { return p.county ? (U.regionOf(p.county) || "Other") : NC; }
    function county(p) { return p.county || NC; }
    function place(p) { return U.key(p.org); }
    function inStatus(p) { return F.s === "all" || (F.s === "none" ? !p.tid : p.tid === F.s); }
    function inSearch(p) { var t = F.q.trim().toUpperCase(); return !t || (p.n + " " + p.a + " " + p.org + " " + p.sup + " " + p.town + " " + p.course).toUpperCase().indexOf(t) >= 0; }
    var level = {
      d: function (p) { return !F.d || p.dept === F.d; }, r: function (p) { return !F.r || region(p) === F.r; }, c: function (p) { return !F.c || county(p) === F.c; },
      t: function (p) { return !F.t || p.town === F.t; }, o: function (p) { return !F.o || place(p) === F.o; }
    };
    function rows(upTo) {   /* placements that pass the filters above `upTo` (and the Show and Search filters) */
      var order = ["d", "r", "c", "t", "o"], n = order.indexOf(upTo);
      return D.placements.filter(function (p) { if (!inStatus(p) || !inSearch(p)) return false; for (var i = 0; i < (n < 0 ? 5 : n); i++) if (!level[order[i]](p)) return false; return true; });
    }
    function sync() {
      if (!D) return;
      var T = D.trainers.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
      F.s = U.fill(sel.s, [{ v: "none", t: "Waiting for a trainer", n: D.placements.filter(function (p) { return !p.tid; }).length }, { v: "all", t: "All students", n: D.placements.length }].concat(T.map(function (t) { return { v: t.id, t: "Assigned to " + t.name, n: t.count }; })), null, { first: true, alwaysOn: true });
      F.d = U.fill(sel.d, U.tally(rows("d"), function (p) { return p.dept; }), "All departments", { alwaysOn: true });
      F.r = U.fill(sel.r, U.tally(rows("r"), region, function (p) { return region(p) === NC ? "Region not known" : region(p); }), "All regions", { alwaysOn: true });
      F.c = U.fill(sel.c, U.tally(rows("c"), county, function (p) { return p.county || "County not given"; }), "All counties", { alwaysOn: true });
      F.t = U.fill(sel.t, U.tally(rows("t"), function (p) { return p.town; }), "All towns", { alwaysOn: true });
      F.o = U.fill(sel.o, U.tally(rows("o"), place, function (p) { return p.org.toUpperCase(); }), "All places in this town", { alwaysOn: true });
      fillTrainerSelect(); draw();
    }
    function fillTrainerSelect() {
      if (!bar) return;
      var s = bar.querySelector(".rp-tr"), keep = s.value;
      s.innerHTML = '<option value="">Choose a trainer</option>' + D.trainers.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.name) + " \u2013 now " + t.count + "</option>"; }).join("") + '<option value="__none">Remove trainer (back to waiting)</option>';
      s.value = keep;
    }
    function trainerOpts(cur) {
      return '<option value="">' + (cur ? "Change trainer\u2026" : "Assign to\u2026") + "</option>" + D.trainers.map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === cur ? " disabled" : "") + ">" + esc(t.name) + " (" + t.count + ")</option>"; }).join("");
    }

    function stats() {
      var n = D.placements.length, as = D.placements.filter(function (p) { return p.tid; }).length, left = n - as;
      qa(".rp-stats").innerHTML = '<div class="rv-chip"><b>' + n + "</b><span>students placed</span></div>" + '<div class="rv-chip"><b>' + as + "</b><span>have a trainer</span></div>" + '<div class="rv-chip ' + (left ? "warn" : "ok") + '"><b>' + left + "</b><span>waiting for a trainer</span></div>" + '<div class="rv-chip"><b>' + D.trainers.length + "</b><span>trainers</span></div>";
    }
    function crumbs() {
      var c = [], t = function (k, text) { c.push('<button type="button" class="rv-tag" data-x="' + k + '">' + esc(text) + ' <span aria-hidden="true">\u00d7</span></button>'); };
      var txt = function (k) { return sel[k].options[sel[k].selectedIndex].text.replace(/ \(\d+\)$/, ""); };
      if (F.d) t("d", F.d); if (F.r) t("r", txt("r") + " region"); if (F.c) t("c", txt("c") + (F.c === NC ? "" : " county")); if (F.t) t("t", F.t); if (F.o) t("o", txt("o"));
      if (F.q.trim()) t("q", "\u201c" + F.q.trim() + "\u201d");
      qa(".rv-crumbs").innerHTML = c.join("") + (c.length > 1 ? '<button type="button" class="rv-clear" data-x="all">Clear all</button>' : "");
    }

    /* ---- the list, grouped by town and place ---- */
    function draw() {
      if (!D) return;
      stats(); crumbs();
      view = D.placements.filter(function (p) { return inStatus(p) && inSearch(p) && level.d(p) && level.r(p) && level.c(p) && level.t(p) && level.o(p); })
        .sort(function (a, b) { return (a.town + "|" + a.org + "|" + a.n).localeCompare(b.town + "|" + b.org + "|" + b.n); });
      qa(".rv-count").textContent = U.plural(view.length, "student") + (view.length !== D.placements.length ? " of " + D.placements.length : "");
      GROUPS = [];
      if (!view.length) { list.innerHTML = '<p class="rv-empty">' + (F.s === "none" && !F.q && !F.d && !F.t ? "Every placed student has a trainer. Well done." : "No students match these filters.") + "</p>"; updateBar(); return; }
      var towns = [], ti = {};
      view.forEach(function (p) { var k = p.town || "Town not given"; if (!(k in ti)) { ti[k] = towns.length; towns.push({ t: k, places: [], pi: {}, ids: [] }); } var T = towns[ti[k]], pk = place(p); if (!(pk in T.pi)) { T.pi[pk] = T.places.length; T.places.push({ t: p.org, rows: [] }); } T.places[T.pi[pk]].rows.push(p); T.ids.push(p.id); });
      var html = "", shown = 0, flatPlace = !!F.o;
      for (var a = 0; a < towns.length && shown < limit; a++) {
        var T = towns[a], gT = GROUPS.push({ ids: T.ids, name: T.t }) - 1;
        if (!F.t || towns.length > 1) html += head("rp-town", gT, T.t, T.ids.length, "Town");
        for (var b = 0; b < T.places.length && shown < limit; b++) {
          var P = T.places[b], gP = GROUPS.push({ ids: P.rows.map(function (r) { return r.id; }), name: P.t }) - 1;
          if (!flatPlace) html += head("rp-place", gP, P.t, P.rows.length, "Place");
          for (var c = 0; c < P.rows.length && shown < limit; c++, shown++) html += rowHtml(P.rows[c]);
        }
      }
      if (shown < view.length) html += '<div class="rv-more"><button type="button" class="btn sec" data-a="more">Show more (' + (view.length - shown) + ' left)</button><span class="hint">Or narrow the list with the drop-downs above. \u201cSelect all shown\u201d picks every student in the list, even those not on screen.</span></div>';
      list.innerHTML = html; updateBar();
    }
    function head(cls, g, title, n, kind) {
      var ids = GROUPS[g].ids, all = ids.every(function (id) { return SEL[id]; });
      return '<div class="rp-gh ' + cls + '">' + (canAssign ? '<label class="rp-ck" title="Select everyone here"><input type="checkbox" data-g="' + g + '"' + (all ? " checked" : "") + "></label>" : "") +
        '<span class="rp-gt"><b>' + esc(title) + "</b><small>" + kind + " \u00b7 " + U.plural(n, "student") + "</small></span>" +
        (canAssign ? '<select class="rp-gs" data-gs="' + g + '" aria-label="Assign everyone at ' + esc(title) + '">' + trainerOpts("").replace("Assign to\u2026", "Assign all to\u2026") + "</select>" : "") + "</div>";
    }
    function rowHtml(p) {
      var t = p.tid ? trainer(p.tid) : null;
      return '<div class="rp-row' + (SEL[p.id] ? " sel" : "") + '">' + (canAssign ? '<label class="rp-ck"><input type="checkbox" data-s="' + esc(p.id) + '"' + (SEL[p.id] ? " checked" : "") + "></label>" : "") +
        '<div class="rp-main"><b>' + esc(p.n) + "</b> <small>" + esc(p.a) + (p.cls ? " \u00b7 " + esc(p.cls) : "") + "</small>" +
        '<div class="rp-sub">' + esc(p.course) + (p.dept ? " \u00b7 " + esc(p.dept) : "") + "</div>" +
        '<div class="rp-sub">' + esc(p.org) + " \u00b7 " + esc(p.loc) + "</div>" +
        '<div class="rp-sub">Supervisor: ' + esc(p.sup) + (p.supTel ? " " + U.tel(p.supTel) : "") + " \u00b7 Student: " + U.tel(p.tel1) + "</div></div>" +
        '<div class="rp-side">' + (t ? '<span class="rv-pill ok">' + esc(t.name) + "</span>" : '<span class="rv-pill warn">Waiting</span>') +
        (canAssign ? '<select class="rp-one" data-one="' + esc(p.id) + '" aria-label="Assign ' + esc(p.n) + '">' + trainerOpts(p.tid) + "</select>" : "") +
        (o.canRemove ? '<button type="button" class="btn del rp-rm" data-rm="' + esc(p.id) + '">Remove</button>' : "") + "</div></div>";
    }
    function updateBar() {
      if (!bar) return; var n = Object.keys(SEL).length; bar.hidden = !n; bar.querySelector(".rp-n").textContent = U.plural(n, "student") + " selected";
    }

    /* ---- assigning ---- */
    async function assign(ids, tid, label) {
      if (!ids.length) { U.say(msgA, "err", "Tick at least one student."); return; }
      if (!tid) { U.say(msgA, "err", "Choose a trainer."); return; }
      U.say(msgA, "info", "Saving\u2026");
      try {
        var real = tid === "__none" ? "" : tid, d = await api("POST", "hod/assign", { ids: ids, tid: real });
        setD(d);
        ids.forEach(function (id) { delete SEL[id]; });
        var t = real && trainer(real);
        U.say(msgA, "ok", real ? U.plural(d.assigned, "student") + " assigned to " + t.name + (label ? " (" + label + ")" : "") + ". " + t.name + " now has " + U.plural(t.count, "student") + ". " + notifyText(d.notify, t) : U.plural(d.assigned, "student") + " now wait for a trainer.");
        sync(); drawTrainers(); if (o.onData) o.onData(D);
      } catch (e) { U.say(msgA, "err", e.message); }
    }

    sel.q.addEventListener("input", U.debounce(function () { F.q = sel.q.value; limit = PAGE; sync(); }, 160));
    ["d", "r", "c", "t", "o", "s"].forEach(function (k) { sel[k].addEventListener("change", function () { F[k] = sel[k].value; limit = PAGE; sync(); }); });
    elA.addEventListener("change", function (e) {
      var t = e.target, id = t.getAttribute("data-s"), g = t.getAttribute("data-g"), one = t.getAttribute("data-one"), gs = t.getAttribute("data-gs");
      if (id) { if (t.checked) SEL[id] = 1; else delete SEL[id]; draw(); return; }
      if (g != null) { GROUPS[+g].ids.forEach(function (x) { if (t.checked) SEL[x] = 1; else delete SEL[x]; }); draw(); return; }
      if (one && t.value) { var tr = trainer(t.value); assign([one], t.value); return; }
      if (gs != null && t.value) { var G = GROUPS[+gs], tt = trainer(t.value); if (confirm("Give all " + G.ids.length + " student(s) at " + G.name + " to " + tt.name + "?")) assign(G.ids.slice(), t.value, G.name); else t.value = ""; }
    });
    elA.addEventListener("click", function (e) {
      var b = e.target.closest("[data-a],[data-x],[data-rm]"); if (!b || !elA.contains(b)) return;
      if (b.hasAttribute("data-x")) { var x = b.getAttribute("data-x"); (x === "all" ? ["q", "d", "r", "c", "t", "o"] : [x]).forEach(function (k) { sel[k].value = ""; F[k] = ""; }); limit = PAGE; sync(); return; }
      if (b.hasAttribute("data-rm")) {
        var id = b.getAttribute("data-rm"); if (!confirm("Remove this placement? The student will have to send it again.")) return;
        api("DELETE", "admin/placements/" + encodeURIComponent(id)).then(function () { D.placements = D.placements.filter(function (p) { return p.id !== id; }); delete SEL[id]; sync(); drawTrainers(); if (o.onData) o.onData(D); }).catch(function (x) { U.say(msgA, "err", x.message); });
        return;
      }
      var a = b.getAttribute("data-a");
      if (a === "more") { limit += PAGE; draw(); }
      else if (a === "rf") load();
      else if (a === "selall") { view.forEach(function (p) { SEL[p.id] = 1; }); draw(); }
      else if (a === "clr") { SEL = {}; draw(); }
      else if (a === "go") assign(Object.keys(SEL), bar.querySelector(".rp-tr").value);
      else if (a === "xl" || a === "csv") exportRows(view, "RVNP_placements_view", a);
    });

    /* ------------------------------ trainers view ------------------------------ */
    var CN = { email: "email", whatsapp: "WhatsApp", sms: "SMS" }, EDIT = "";
    function setD(d) { D = { placements: d.placements, trainers: d.trainers, departments: d.departments, channels: d.channels || (D && D.channels) || {} }; }
    function stamp(ts) { return ts ? new Date(ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""; }
    /* one sentence on what happened to the message, from the server's result for the channels */
    function sayRes(res) {
      var ok = [], bad = [], none = [];
      Object.keys(res || {}).forEach(function (c) { var v = res[c]; if (v === "sent") ok.push(CN[c]); else if (v === "failed") bad.push(CN[c]); else if (v === "nocontact") none.push(CN[c]); });
      var out = []; if (ok.length) out.push("Sent by " + ok.join(" and ") + ".");
      if (bad.length) out.push(bad.join(" and ") + " did not go through. Try again or use Open WhatsApp.");
      if (none.length && !ok.length) out.push("No " + none.join("/") + " contact on file.");
      if (!out.length) out.push("No message channel is set up yet, so nothing was sent. Use Open WhatsApp or Copy message on the Trainers page.");
      return out.join(" ");
    }
    function notifyText(n, t) {
      if (!n) return "";
      if (n.held) return "The link was sent to " + n.name + " a few minutes ago and always shows the live list, so no new message was sent.";
      return n.name + ": " + sayRes(n.res);
    }
    function statusOf(t) {
      if (t.det) return { c: "ok", t: "Details received" };
      if (t.openedAt) return { c: "warn", t: "Opened the link, no details yet" };
      if (t.sentAt) return { c: "warn", t: "Message sent, waiting for details" };
      return { c: "", t: "Not yet contacted" };
    }
    function chips(t) {
      var n = t.notif || {}, on = (D && D.channels) || {}, out = [];
      ["email", "whatsapp", "sms"].forEach(function (c) {
        if (n[c]) out.push('<span class="rv-pill ' + (n[c].ok ? "ok" : "warn") + '" title="' + esc(n[c].ok ? "" : n[c].err || "") + '">' + CN[c] + (n[c].ok ? " \u2713 " : " \u2717 ") + stamp(n[c].at) + "</span>");
        else if (on[c]) out.push('<span class="rv-pill">' + CN[c] + " not sent</span>");
      });
      if (n.letter) out.push('<span class="rv-pill ok">Letter \u2713 ' + stamp(n.letter.at) + "</span>");
      return out.join("");
    }
    function detailsHtml(t) {
      var d = t.det; if (!d) return "";
      var rows = [["Name", d.name], ["PF number", d.pf], ["ID number", d.idno], ["Bank", d.bank], ["Branch", d.branch], ["Account number", d.acct || "Not given"], ["Email", t.email || "Not given"], ["Received", stamp(d.at)]];
      return '<details class="rp-det"><summary>Trainer details</summary><dl>' + rows.map(function (r) { return "<dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd>"; }).join("") + "</dl></details>";
    }
    elT.innerHTML =
      '<div class="rp-chan"></div><div class="rv-stats rp-tstats"></div>' +
      (canAssign ? '<div class="card"><h2>Add a trainer</h2><p class="lead">Trainers are the college supervisors who visit students on attachment. When you assign students, the trainer is sent a message (WhatsApp and email) asking for their details and giving a link to download their list.</p><div class="grid"><div><label>Trainer\u2019s name</label><input data-t="n" placeholder="e.g. Mr. John Otieno"></div><div><label>Phone number (WhatsApp)</label><input data-t="p" type="tel" inputmode="tel" placeholder="07XX XXX XXX"></div><div><label>Email (optional)</label><input data-t="e" type="email" inputmode="email" placeholder="name@example.com"></div></div><div class="row"><button class="btn" data-ta="add" type="button">Add trainer</button></div></div>' : "") +
      '<div class="msg" data-m="t" role="status"></div><div class="rp-trs"></div>' +
      '<div class="row">' + (canNotify ? '<button class="btn" data-ta="remind" type="button">Remind everyone who has not given details</button>' : "") + '<button class="btn sec" data-ta="det" type="button">Download trainer details (Excel)</button><button class="btn sec" data-ta="xl" type="button">Download Excel (one sheet per trainer)</button></div>';
    var qt = function (s) { return elT.querySelector(s); }, msgT = qt('[data-m="t"]');
    function drawTrainers() {
      if (!D) return;
      var on = D.channels || {}, live = ["email", "whatsapp", "sms"].filter(function (c) { return on[c]; }).map(function (c) { return CN[c]; });
      qt(".rp-chan").innerHTML = canNotify ? (live.length ? '<div class="msg ok" style="margin:0 0 12px">Messages go out automatically by ' + esc(live.join(", ")) + (on.whatsapp ? "" : ". WhatsApp is not connected: use Open WhatsApp on a trainer.") + "</div>" : '<div class="msg info" style="margin:0 0 12px">No automatic channel is connected yet (see the setup steps in the README). Until then, use <b>Open WhatsApp</b>, <b>Copy message</b> or <b>Letter</b> on each trainer.</div>') : "";
      var T = D.trainers, got = T.filter(function (t) { return t.det; }).length;
      qt(".rp-tstats").innerHTML = '<div class="rv-chip"><b>' + T.length + "</b><span>trainers</span></div>" + '<div class="rv-chip ok"><b>' + got + "</b><span>gave their details</span></div>" + '<div class="rv-chip ' + (T.length - got ? "warn" : "ok") + '"><b>' + (T.length - got) + "</b><span>still to give details</span></div>";
      var max = Math.max.apply(null, [1].concat(T.map(function (t) { return t.count; })));
      qt(".rp-trs").innerHTML = T.map(function (t) {
        var mine = D.placements.filter(function (p) { return p.tid === t.id; }), towns = U.tally(mine, function (p) { return p.town; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 5), st = statusOf(t);
        var stale = t.sentAt && t.count !== (t.sentCount || 0) ? '<div class="hint rp-warn">The list changed since the last message (' + (t.sentCount || 0) + " \u2192 " + t.count + "). The link already shows the latest list; send again to tell them.</div>" : (!t.sentAt && t.count ? '<div class="hint rp-warn">Has students but no message has been sent yet.</div>' : "");
        if (EDIT === t.id) return '<div class="card rp-tcard"><b>Edit contact</b><div class="grid" style="margin-top:8px"><div><label>Name</label><input data-e="n" value="' + esc(t.name) + '"></div><div><label>Phone</label><input data-e="p" type="tel" value="' + esc(t.tel) + '"></div><div><label>Email</label><input data-e="e" type="email" value="' + esc(t.email || "") + '"></div></div><div class="row"><button class="btn" data-ts="' + esc(t.id) + '" type="button">Save</button><button class="btn sec" data-tc="1" type="button">Cancel</button></div></div>';
        var wa = t.wnum && t.wnum.length >= 11 ? '<a class="btn sec rp-sm" target="_blank" rel="noopener" href="https://wa.me/' + esc(t.wnum) + "?text=" + encodeURIComponent(t.text) + '">Open WhatsApp</a>' : "";
        return '<div class="card rp-tcard"><div class="rp-th"><div><b>' + esc(t.det ? t.det.name : t.name) + '</b><div class="hint">' + U.tel(t.tel) + (t.email ? " \u00b7 " + esc(t.email) : "") + '</div></div><span class="rv-pill ok">' + U.plural(t.count, "student") + "</span></div>" +
          '<div style="margin:8px 0"><span class="rv-pill ' + st.c + '">' + esc(st.t) + "</span>" + chips(t) + "</div>" + stale + detailsHtml(t) +
          '<div class="rp-load"><i style="width:' + Math.round(t.count * 100 / max) + '%"></i></div>' +
          (towns.length ? '<div class="rp-towns">' + towns.map(function (x) { return "<span>" + esc(x.t) + " \u00b7 " + x.n + "</span>"; }).join("") + "</div>" : '<div class="hint">No students yet.</div>') +
          '<div class="row">' + (canNotify ? '<button class="btn rp-sm" data-tn="' + esc(t.id) + '" type="button">' + (t.sentAt ? "Send again" : "Send now") + "</button>" + wa + '<button class="btn sec rp-sm" data-tp="' + esc(t.id) + '" type="button">Copy message</button><button class="btn sec rp-sm" data-tl="' + esc(t.id) + '" type="button">Letter</button>' : "") +
          '<button class="btn sec rp-sm" data-tv="' + esc(t.id) + '" type="button">View students</button>' + (canAssign ? '<button class="btn sec rp-sm" data-te="' + esc(t.id) + '" type="button">Edit</button><button class="btn del" data-tx="' + esc(t.id) + '" type="button">Remove</button>' : "") + "</div></div>";
      }).join("") || '<p class="rv-empty">No trainers yet.' + (canAssign ? " Add the first one above." : "") + "</p>";
    }
    function letter(t) {
      var w = window.open("", "_blank"); if (!w) { U.say(msgT, "err", "Allow pop-ups to print the letter."); return; }
      var d = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), page = t.link.replace(/\?.*$/, ""), n = t.count;
      w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Letter to ' + esc(t.name) + '</title><style>body{font-family:Arial,sans-serif;margin:28px 40px;color:#111;line-height:1.55;font-size:14px}img{width:100%;max-height:150px;object-fit:contain}h3{margin:18px 0 8px;text-transform:uppercase;font-size:14px}.box{border:2px solid #123b31;border-radius:8px;padding:12px 16px;margin:14px 0;text-align:center}.box b{font:700 26px ui-monospace,Menlo,Consolas,monospace;letter-spacing:.16em}ol{padding-left:20px}li{margin:5px 0}</style></head><body><img src="/letterhead.png" alt="">' +
        "<p>" + esc(d) + "</p><p>To: <b>" + esc(t.det ? t.det.name : t.name) + "</b><br>Trainer, Rift Valley National Polytechnic</p><h3>Industrial attachment: supervision of students</h3>" +
        "<p>The Industrial Liaison Office " + (n ? "has assigned you <b>" + U.plural(n, "student") + "</b> on industrial attachment for supervision." : "has registered you as a trainer for industrial attachment supervision. Students will be assigned to you.") + "</p>" +
        "<p>Please <b>respond by giving your details</b> (full name, PF number, ID number, bank and bank branch), then download your list of students with their phone numbers and workplaces:</p>" +
        "<ol><li>On a phone or computer, open <b>" + esc(page) + "</b></li><li>Type your access code:</li></ol><div class=\"box\"><b>" + esc(t.code) + "</b></div>" +
        "<ol start=\"3\"><li>Fill in your details and press <b>Send my details</b>.</li><li>Press <b>Download my list</b>. Your list updates by itself when more students are assigned to you.</li></ol>" +
        "<p>Keep the access code private; it opens your details.</p><p>Thank you for your support.</p><p><br>Industrial Liaison Office<br>Rift Valley National Polytechnic</p>" +
        "<script>var i=document.querySelector('img');function go(){setTimeout(function(){print()},300)}if(i.complete)go();else{i.onload=go;i.onerror=go}<\/script></body></html>");
      w.document.close();
      api("POST", "hod/trainers/letter", { id: t.id }).then(function (d) { setD(d); drawTrainers(); }).catch(function () {});
    }
    async function notify(ids, label) {
      U.say(msgT, "info", "Sending\u2026");
      try {
        var d = await api("POST", "hod/trainers/notify", { ids: ids }); setD(d); drawTrainers(); if (o.onData) o.onData(D);
        U.say(msgT, d.results.some(function (r) { return Object.keys(r.res).some(function (c) { return r.res[c] === "sent"; }); }) ? "ok" : "err", d.results.length === 1 ? d.results[0].name + ": " + sayRes(d.results[0].res) : label + " " + d.results.filter(function (r) { return Object.keys(r.res).some(function (c) { return r.res[c] === "sent"; }); }).length + " of " + d.results.length + " trainers were sent a message.");
      } catch (x) { U.say(msgT, "err", x.message); }
    }
    elT.addEventListener("click", async function (e) {
      var b = e.target.closest("[data-ta],[data-tv],[data-tx],[data-tn],[data-tp],[data-tl],[data-te],[data-ts],[data-tc]"); if (!b) return;
      if (b.hasAttribute("data-tv")) { F = { q: "", d: "", r: "", c: "", t: "", o: "", s: b.getAttribute("data-tv") }; sel.q.value = ""; sync(); openTab("a"); if (o.onOpenAssign) o.onOpenAssign(); return; }
      if (b.hasAttribute("data-tn")) { notify([b.getAttribute("data-tn")]); return; }
      if (b.hasAttribute("data-tp")) {
        var tt = trainer(b.getAttribute("data-tp"));
        try { await navigator.clipboard.writeText(tt.text); U.say(msgT, "ok", "Message for " + tt.name + " copied. Paste it into WhatsApp, SMS or anywhere else."); } catch (x) { window.prompt("Copy this message:", tt.text); }
        return;
      }
      if (b.hasAttribute("data-tl")) { letter(trainer(b.getAttribute("data-tl"))); return; }
      if (b.hasAttribute("data-te")) { EDIT = b.getAttribute("data-te"); drawTrainers(); return; }
      if (b.hasAttribute("data-tc")) { EDIT = ""; drawTrainers(); return; }
      if (b.hasAttribute("data-ts")) {
        var card = b.closest(".rp-tcard"), id = b.getAttribute("data-ts"), g = function (k) { return card.querySelector('[data-e="' + k + '"]').value; };
        try { setD(await api("PUT", "hod/trainers/" + id, { name: g("n"), tel: g("p"), email: g("e") })); EDIT = ""; sync(); drawTrainers(); U.say(msgT, "ok", "Saved."); if (o.onData) o.onData(D); } catch (x) { U.say(msgT, "err", x.message); }
        return;
      }
      if (b.hasAttribute("data-tx")) {
        var t = trainer(b.getAttribute("data-tx")); if (!confirm("Remove " + t.name + "? " + U.plural(t.count, "student") + " assigned to them will be waiting for a trainer again. Their link will stop working.")) return;
        try { setD(await api("DELETE", "hod/trainers/" + t.id)); sync(); drawTrainers(); U.say(msgT, "ok", "Removed."); if (o.onData) o.onData(D); } catch (x) { U.say(msgT, "err", x.message); }
        return;
      }
      var a = b.getAttribute("data-ta");
      if (a === "add") {
        try { setD(await api("POST", "hod/trainers", { name: qt('[data-t="n"]').value, tel: qt('[data-t="p"]').value, email: qt('[data-t="e"]').value })); qt('[data-t="n"]').value = qt('[data-t="p"]').value = qt('[data-t="e"]').value = ""; sync(); drawTrainers(); U.say(msgT, "ok", "Trainer added. Assign students to them and the message goes out by itself, or press Send now."); if (o.onData) o.onData(D); } catch (x) { U.say(msgT, "err", x.message); }
      } else if (a === "remind") {
        var todo = D.trainers.filter(function (t) { return !t.det; }).map(function (t) { return t.id; });
        if (!todo.length) { U.say(msgT, "ok", "Every trainer has given their details."); return; }
        if (!confirm("Send a reminder to " + U.plural(todo.length, "trainer") + " who have not given their details?")) return;
        var sentN = 0, all = todo.length;
        for (var k = 0; k < todo.length; k += 10) {
          U.say(msgT, "info", "Sending\u2026 " + Math.min(k + 10, all) + " of " + all);
          try { var d = await api("POST", "hod/trainers/notify", { ids: todo.slice(k, k + 10) }); setD(d); sentN += d.results.filter(function (r) { return Object.keys(r.res).some(function (c) { return r.res[c] === "sent"; }); }).length; } catch (x) { U.say(msgT, "err", x.message); drawTrainers(); return; }
        }
        drawTrainers(); if (o.onData) o.onData(D);
        U.say(msgT, sentN ? "ok" : "err", sentN + " of " + all + " reminders were sent." + (sentN < all ? " The others have no working contact or channel; use Open WhatsApp or Letter on their card." : ""));
      } else if (a === "xl") exportByTrainer();
      else if (a === "det") exportTrainerDetails();
    });

    /* ------------------------------ downloads ------------------------------ */
    var HEAD = ["Student name", "Admission number", "Class", "Department", "Course", "Organization", "Where (landmark)", "Region", "County", "Town", "Supervisor at organization", "Supervisor phone", "Student phone 1", "Student phone 2", "College trainer", "Trainer phone", "Submitted"];
    var W = [30, 20, 18, 28, 34, 28, 36, 14, 16, 16, 24, 14, 14, 14, 24, 14, 12];
    function line(p) { var t = p.tid && trainer(p.tid) || { name: "", tel: "" }; return [p.n, p.a, p.cls || "", p.dept, p.course, p.org, p.loc, p.county ? (U.regionOf(p.county) || "Other") : "", p.county || "", p.town, p.sup, p.supTel || "", p.tel1, p.tel2 || "", t.name, t.tel, p.t ? new Date(p.t).toLocaleDateString("en-GB") : ""]; }
    function exportRows(rs, name, kind) {
      if (!rs.length) { U.say(msgA, "err", "Nothing to download yet."); return; }
      if (kind === "csv") { U.csv(name, HEAD, rs.map(line)); return; }
      if (U.xlsx(name, [{ name: "Placements", head: HEAD, rows: rs.map(line), widths: W }]) === "csv") U.say(msgA, "info", "The Excel tool did not load, so a CSV file was downloaded instead.");
    }
    function exportAll() {
      if (!D || !D.placements.length) return false;
      var P = D.placements.slice().sort(function (a, b) { return (a.cls || "").localeCompare(b.cls || "") || a.n.localeCompare(b.n); }), by = {};
      P.forEach(function (p) { (by[p.dept] = by[p.dept] || []).push(p); });
      var sum = Object.keys(by).sort().map(function (d) { return [d, by[d].length, by[d].filter(function (p) { return p.tid; }).length]; });
      sum.push(["TOTAL", P.length, P.filter(function (p) { return p.tid; }).length]);
      var sheets = [{ name: "Summary", head: ["Department", "Placed", "Assigned to a trainer"], rows: sum, widths: [40, 10, 22] }, { name: "All placements", head: HEAD, rows: P.map(line), widths: W }];
      Object.keys(by).sort().forEach(function (d) { sheets.push({ name: d, head: HEAD, rows: by[d].map(line), widths: W }); });
      U.xlsx("RVNP_placements", sheets); return true;
    }
    var THEAD = ["Name given by trainer", "Name on HOD list", "Phone", "Email", "PF number", "ID number", "Bank", "Bank branch", "Account number", "Students", "Details received"];
    function trow(t) { var d = t.det || {}; return [d.name || "", t.name, t.tel, t.email || "", d.pf || "", d.idno || "", d.bank || "", d.branch || "", d.acct || "", t.count, d.at ? new Date(d.at).toLocaleDateString("en-GB") : "Not yet"]; }
    var TW = [30, 30, 16, 28, 14, 14, 24, 20, 20, 10, 16];
    function exportTrainerDetails() {
      if (!D.trainers.length) { U.say(msgT, "err", "No trainers yet."); return; }
      if (U.xlsx("RVNP_trainer_details", [{ name: "Trainer details", head: THEAD, rows: D.trainers.map(trow), widths: TW }]) === "csv") U.say(msgT, "info", "The Excel tool did not load, so a CSV file was downloaded instead.");
    }
    function exportByTrainer() {
      if (!D.placements.length) { U.say(msgT, "err", "Nothing to download yet."); return; }
      var by = {}, none = [];
      D.placements.forEach(function (p) { if (p.tid) (by[p.tid] = by[p.tid] || []).push(p); else none.push(p); });
      var sum = D.trainers.map(function (t) { return [t.name, t.tel, t.count]; }); sum.push(["Waiting for a trainer", "", none.length]); sum.push(["TOTAL", "", D.placements.length]);
      var sheets = [{ name: "Summary", head: ["Trainer", "Phone", "Students"], rows: sum, widths: [30, 16, 10] }, { name: "Trainer details", head: THEAD, rows: D.trainers.map(trow), widths: TW }];
      D.trainers.forEach(function (t) { sheets.push({ name: t.name, head: HEAD, rows: (by[t.id] || []).map(line), widths: W }); });
      if (none.length) sheets.push({ name: "Waiting", head: HEAD, rows: none.map(line), widths: W });
      if (U.xlsx("RVNP_students_by_trainer", sheets) === "csv") U.say(msgT, "info", "The Excel tool did not load, so a CSV file was downloaded instead.");
    }

    load();
    return {
      reload: load, data: function () { return D; }, exportAll: exportAll, exportByTrainer: exportByTrainer, exportTrainerDetails: exportTrainerDetails,
      show: function (f) { F = Object.assign({ q: "", d: "", r: "", c: "", t: "", o: "", s: "all" }, f || {}); sel.q.value = F.q; sync(); openTab("a"); },
      tab: openTab
    };
  }
  window.RVPlace = { mount: mount };
})();
