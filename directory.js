/* RVNP student directory (Admin, HOD, Deputy HOD).
   Search by name, admission number or phone. Narrow by Department, then Course, then Class, with every list showing what is inside it.
   RVDir.mount(root, { headers: fn, onAuthFail: fn, canRemove: bool, onData: fn }) */
(function () {
  "use strict";
  var U = window.RVU, esc = U.esc, NONE = "__none";

  function mount(root, o) {
    o = o || {};
    var api = U.api(o.headers, o.onAuthFail), S = null, F = { q: "", d: "", c: "", k: "", i: "", p: "" }, limit = 100, view = [];
    root.classList.add("rv");
    root.innerHTML =
      '<div class="rv-stats"></div>' +
      '<div class="card rv-filters">' +
      '<div class="rv-fgrid">' +
      '<div class="rv-f rv-wide"><label>Find a student</label><input data-f="q" type="search" autocomplete="off" placeholder="Name, admission number or phone number"></div>' +
      '<div class="rv-f rv-s3"><label>Department</label><select data-f="d"></select></div>' +
      '<div class="rv-f rv-s3"><label>Course</label><select data-f="c"></select></div>' +
      '<div class="rv-f rv-s2"><label>Class</label><select data-f="k"></select></div>' +
      '<div class="rv-f rv-s2"><label>Intake</label><select data-f="i"></select></div>' +
      '<div class="rv-f rv-s2"><label>Status</label><select data-f="p"></select></div>' +
      '</div>' +
      '<div class="rv-crumbs"></div>' +
      '<div class="rv-bar"><span class="rv-count"></span><span class="rv-btns"><button class="btn sec" data-a="xl" type="button">Download Excel</button><button class="btn sec" data-a="csv" type="button">CSV</button><button class="btn sec" data-a="rf" type="button">Refresh</button></span></div>' +
      '</div>' +
      '<div class="msg" role="status"></div>' +
      '<div class="rv-list"></div>' +
      '<dialog class="rv-dlg"></dialog>';
    var q = function (s) { return root.querySelector(s); }, sel = {};
    ["q", "d", "c", "k", "i", "p"].forEach(function (k) { sel[k] = q('[data-f="' + k + '"]'); });
    var msg = q(".msg"), list = q(".rv-list"), dlg = q(".rv-dlg");

    var STATUS = [
      { v: "placed", t: "Placed for attachment" }, { v: "notplaced", t: "Not yet placed" },
      { v: "waiting", t: "Placed, waiting for a trainer" }, { v: "assigned", t: "Placed, trainer assigned" },
      { v: "cover", t: "Has insurance cover" }, { v: "nocover", t: "No insurance cover yet" }
    ];

    async function load() {
      U.say(msg, "info", "Loading students\u2026");
      try { S = await api("GET", "hod/directory"); U.say(msg, "", ""); sync(); if (o.onData) o.onData(S); }
      catch (e) { U.say(msg, "err", e.message); }
    }

    /* ---- filtering ---- */
    function deptOf(r) { return r.d || NONE; }
    function inDept(r) { return !F.d || deptOf(r) === F.d; }
    function inCourse(r) { return !F.c || U.key(r.co) === F.c; }
    function inClass(r) { return !F.k || r.c === F.k; }
    function inIntake(r) { return !F.i || r.it === F.i; }
    function inStatus(r) {
      switch (F.p) {
        case "placed": return !!r.pl; case "notplaced": return !r.pl;
        case "waiting": return !!r.pl && !r.tr; case "assigned": return !!r.pl && !!r.tr;
        case "cover": return r.cv; case "nocover": return !r.cv;
      } return true;
    }
    function inSearch(r) {
      var t = F.q.trim(); if (!t) return true;
      var up = t.toUpperCase(), words = up.replace(/[^A-Z0-9\s]/g, " ").split(/\s+/).filter(Boolean), nm = r.n.toUpperCase().replace(/[^A-Z0-9\s]/g, " ");
      if (words.every(function (w) { return nm.indexOf(w) >= 0; })) return true;
      var kq = U.key(t); if (kq.length >= 3 && U.key(r.a).indexOf(kq) >= 0) return true;
      var nat = function (x) { return U.digits(x).replace(/^254/, "0"); }, dq = nat(t);   /* 0712..., 712... and +254712... all find the same number */
      if (U.digits(t).length >= 4 && (nat(r.ph).indexOf(dq) >= 0 || (r.ph2 && nat(r.ph2).indexOf(dq) >= 0))) return true;
      return false;
    }
    function rowsFor(skip) {
      return S.students.filter(function (r) {
        return (skip === "d" || inDept(r)) && (skip === "c" || inCourse(r)) && (skip === "k" || inClass(r)) && (skip === "i" || inIntake(r)) && inStatus(r) && inSearch(r);
      });
    }

    /* Each drop-down lists what is in it, narrowed by the choices above it. Choosing a department shows ALL its courses. */
    function sync() {
      if (!S) return;
      var all = S.students, depts = S.departments.map(function (d) { return { v: d, t: d, n: all.filter(function (r) { return r.d === d; }).length }; });
      var none = all.filter(function (r) { return !r.d; }).length; if (none) depts.push({ v: NONE, t: "Department not recorded", n: none });
      F.d = U.fill(sel.d, depts, "All departments", { alwaysOn: true });

      var scopeD = all.filter(inDept), seen = {}, courses = [];
      if (F.d && F.d !== NONE) S.courses.filter(function (c) { return c.dept === F.d; }).forEach(function (c) { var k = U.key(c.title); seen[k] = 1; courses.push({ v: k, t: c.title, n: scopeD.filter(function (r) { return U.key(r.co) === k; }).length }); });
      scopeD.forEach(function (r) { var k = U.key(r.co); if (k && !seen[k]) { seen[k] = 1; courses.push({ v: k, t: r.co, n: scopeD.filter(function (x) { return U.key(x.co) === k; }).length }); } });
      courses.sort(function (a, b) { return a.t.localeCompare(b.t); });
      F.c = U.fill(sel.c, courses, F.d ? "All courses in this department" : "All courses", { alwaysOn: true });

      var scopeC = scopeD.filter(inCourse), classes = U.tally(scopeC, function (r) { return r.c; });
      F.k = U.fill(sel.k, classes, "All classes", { alwaysOn: true });
      var scopeK = scopeC.filter(inClass), intakes = U.tally(scopeK, function (r) { return r.it; });
      F.i = U.fill(sel.i, intakes, "All intakes", { alwaysOn: true });
      F.p = U.fill(sel.p, STATUS, "Any status", { alwaysOn: true });
      draw();
    }

    function chips(rows) {
      var placed = rows.filter(function (r) { return r.pl; }).length, tr = rows.filter(function (r) { return r.tr; }).length, cv = rows.filter(function (r) { return r.cv; }).length, n = rows.length;
      var pc = function (x) { return n ? Math.round(x * 100 / n) + "%" : "0%"; };
      q(".rv-stats").innerHTML =
        '<div class="rv-chip"><b>' + n + '</b><span>students shown</span></div>' +
        '<div class="rv-chip"><b>' + placed + '</b><span>placed (' + pc(placed) + ')</span></div>' +
        '<div class="rv-chip"><b>' + tr + '</b><span>with a trainer</span></div>' +
        '<div class="rv-chip"><b>' + cv + '</b><span>with insurance cover</span></div>';
    }
    function crumbs() {
      var c = [];
      if (F.d) c.push([F.d === NONE ? "Department not recorded" : F.d, "d"]);
      if (F.c) c.push([sel.c.options[sel.c.selectedIndex].text.replace(/ \(\d+\)$/, ""), "c"]);
      if (F.k) c.push([F.k, "k"]);
      if (F.i) c.push([F.i + " intake", "i"]);
      if (F.p) c.push([sel.p.options[sel.p.selectedIndex].text, "p"]);
      if (F.q.trim()) c.push(["\u201c" + F.q.trim() + "\u201d", "q"]);
      q(".rv-crumbs").innerHTML = c.map(function (x) { return '<button type="button" class="rv-tag" data-x="' + x[1] + '">' + esc(x[0]) + ' <span aria-hidden="true">\u00d7</span></button>'; }).join("") + (c.length > 1 ? '<button type="button" class="rv-clear" data-x="all">Clear all</button>' : "");
    }

    function chipsRow(r) {
      return (r.pl ? (r.tr ? '<span class="rv-pill ok">Trainer: ' + esc(r.tr) + "</span>" : '<span class="rv-pill warn">Waiting for trainer</span>') : '<span class="rv-pill">Not placed</span>') + (r.cv ? '<span class="rv-pill ok">Cover</span>' : "");
    }
    function draw() {
      view = rowsFor();
      chips(view); crumbs();
      q(".rv-count").textContent = U.plural(view.length, "student") + (S.students.length !== view.length ? " of " + S.students.length : "");
      if (!view.length) { list.innerHTML = '<p class="rv-empty">No students match. Try clearing a filter.</p>'; return; }
      var groups = [], idx = {}, shownN = 0, html = "";
      view.forEach(function (r, i) { var g = r.c || "No class yet"; if (!(g in idx)) { idx[g] = groups.length; groups.push({ t: g, rows: [] }); } groups[idx[g]].rows.push(i); });
      groups.sort(function (a, b) { return a.t.localeCompare(b.t); });
      var byGroup = !F.k && groups.length > 1;
      for (var gi = 0; gi < groups.length && shownN < limit; gi++) {
        var g = groups[gi];
        if (byGroup) html += '<div class="rv-gh"><b>' + esc(g.t) + "</b><span>" + U.plural(g.rows.length, "student") + "</span></div>";
        for (var j = 0; j < g.rows.length && shownN < limit; j++, shownN++) {
          var r = view[g.rows[j]];
          html += '<button type="button" class="rv-row" data-i="' + g.rows[j] + '"><span class="rv-nm"><b>' + esc(r.n) + "</b><small>" + esc(r.a) + "</small></span>" +
            '<span class="rv-mid">' + esc(r.co || "Course not recorded") + (byGroup ? "" : "<small>" + esc(r.c || "No class yet") + "</small>") + "</span>" +
            '<span class="rv-ph">' + esc(r.ph) + '</span><span class="rv-st">' + chipsRow(r) + "</span></button>";
        }
      }
      if (shownN < view.length) html += '<div class="rv-more"><button type="button" class="btn sec" data-a="more">Show 100 more (' + (view.length - shownN) + " left)</button><span class=\"hint\">Or narrow the list with the drop-downs above.</span></div>";
      list.innerHTML = html;
    }

    /* ---- events ---- */
    Object.keys(sel).forEach(function (k) {
      var h = function () { F[k] = sel[k].value; limit = 100; if (k === "q") { draw(); } else sync(); };
      sel[k].addEventListener(k === "q" ? "input" : "change", k === "q" ? U.debounce(h, 150) : h);
    });
    root.addEventListener("click", function (e) {
      var t = e.target.closest("[data-x],[data-a],[data-i]"); if (!t || !root.contains(t)) return;
      if (t.hasAttribute("data-x")) {
        var x = t.getAttribute("data-x"), ks = x === "all" ? ["q", "d", "c", "k", "i", "p"] : [x];
        ks.forEach(function (k) { sel[k].value = ""; F[k] = ""; }); limit = 100; sync(); return;
      }
      var a = t.getAttribute("data-a");
      if (a === "more") { limit += 100; draw(); }
      else if (a === "rf") load();
      else if (a === "xl" || a === "csv") exportView(a);
      else if (t.hasAttribute("data-i")) detail(view[+t.getAttribute("data-i")]);
    });

    /* ---- one student ---- */
    function detail(r) {
      if (!r) return;
      var line = function (k, v) { return v ? '<div class="rv-kv"><span>' + esc(k) + "</span><b>" + v + "</b></div>" : ""; };
      var place = r.pl ? line("Organization", esc(r.org)) + line("Where", esc(r.loc)) + line("Region / county", esc((U.regionOf(r.county) ? U.regionOf(r.county) + " / " : "") + (r.county || "County not given"))) + line("Town", esc(r.town)) + line("Supervisor", esc(r.sup) + (r.supTel ? " \u00b7 " + U.tel(r.supTel) : "")) +
        line("College trainer", r.tr ? esc(r.tr) + (r.trTel ? " \u00b7 " + U.tel(r.trTel) : "") + (r.tby ? ' <small>(assigned by ' + esc(r.tby === "deputy" ? "Deputy HOD" : r.tby === "hod" ? "HOD" : "Admin") + ")</small>" : "") : "<i>Waiting for a trainer</i>") : '<p class="hint">This student has not sent a placement yet.</p>';
      dlg.innerHTML = '<div class="rv-dh"><div><h3>' + esc(r.n) + "</h3><div class=\"hint\">" + esc(r.a) + '</div></div><button type="button" class="btn sec" data-close>Close</button></div>' +
        '<div class="rv-dsec"><h4>Student</h4>' + line("Department", esc(r.d || "Not recorded")) + line("Course", esc(r.co || "Not recorded")) + line("Class", esc(r.c || "No class yet") + (r.cp ? " <small>(temporary until the code is added)</small>" : "")) + line("Intake", esc(r.it)) + line("Gender", esc(r.g)) +
        line("Phone", U.tel(r.ph)) + line("Other phone", U.tel(r.ph2)) + line("Email", r.em ? '<a href="mailto:' + esc(r.em) + '">' + esc(r.em) + "</a>" : "") + line("Insurance cover", r.cv ? "Yes" : "Not yet") + "</div>" +
        '<div class="rv-dsec"><h4>Attachment placement</h4>' + place + "</div>" +
        (o.canRemove ? '<div class="rv-dsec"><button type="button" class="btn del" data-rm>Remove from the student register</button><div class="msg"></div></div>' : "");
      dlg.onclick = async function (e) {
        if (e.target === dlg || e.target.hasAttribute("data-close")) { dlg.close(); return; }
        if (e.target.hasAttribute("data-rm")) {
          if (!confirm("Remove " + r.n + " from the student register? Use this only for entries made by mistake.")) return;
          try { await api("DELETE", "admin/register/" + encodeURIComponent(r.rid)); S.students = S.students.filter(function (x) { return x.rid !== r.rid; }); dlg.close(); sync(); if (o.onData) o.onData(S); }
          catch (x) { U.say(dlg.querySelector(".msg"), "err", x.message); }
        }
      };
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
    }

    /* ---- downloads (what is on screen) ---- */
    var HEAD = ["Class", "Student name", "Admission number", "Department", "Course", "Intake", "Gender", "Phone", "Other phone", "Email", "Insurance cover", "Placed", "Organization", "Region", "County", "Town", "College trainer"];
    function line(r) { return [r.c, r.n, r.a, r.d, r.co, r.it, r.g, r.ph, r.ph2, r.em, r.cv ? "Yes" : "No", r.pl ? "Yes" : "No", r.org || "", U.regionOf(r.county), r.county || "", r.town || "", r.tr || ""]; }
    function exportView(kind) {
      if (!view.length) { U.say(msg, "err", "There are no students in this list to download."); return; }
      var rows = view.slice().sort(function (a, b) { return (a.c + "|" + a.n).localeCompare(b.c + "|" + b.n); }), name = "RVNP_students" + (F.k ? "_" + F.k : "");
      if (kind === "csv") { U.csv(name, HEAD, rows.map(line)); return; }
      var by = {}; rows.forEach(function (r) { (by[r.c || "No class"] = by[r.c || "No class"] || []).push(r); });
      var cl = Object.keys(by).sort(), sum = cl.map(function (c) { return [c, by[c].length, by[c].filter(function (r) { return r.pl; }).length, by[c].filter(function (r) { return r.cv; }).length]; });
      sum.push(["TOTAL", rows.length, rows.filter(function (r) { return r.pl; }).length, rows.filter(function (r) { return r.cv; }).length]);
      var sheets = [{ name: "Summary", head: ["Class", "Students", "Placed", "With cover"], rows: sum, widths: [28, 10, 10, 12] }, { name: "All students", head: HEAD, rows: rows.map(line), widths: [22, 30, 20, 30, 34, 10, 8, 14, 14, 26, 10, 8, 26, 14, 14, 16, 22] }];
      if (cl.length > 1 && cl.length <= 60) cl.forEach(function (c) { sheets.push({ name: c, head: HEAD, rows: by[c].map(line), widths: [22, 30, 20, 30, 34, 10, 8, 14, 14, 26, 10, 8, 26, 14, 14, 16, 22] }); });
      if (U.xlsx(name, sheets) === "csv") U.say(msg, "info", "The Excel tool did not load, so a CSV file was downloaded instead.");
    }

    load();
    return {
      reload: load, data: function () { return S; },
      show: function (f) { Object.keys(f || {}).forEach(function (k) { F[k] = f[k]; sel[k].value = f[k]; }); sync(); }
    };
  }
  window.RVDir = { mount: mount };
})();
