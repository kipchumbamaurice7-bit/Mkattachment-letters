/* RVNP workspace for the ILO HOD and the Deputy HOD.
   hod.html and deputy.html are two doors into this one workspace: each account opens only its own page, shows its own title, and its actions are recorded under its own role.
   Needs: rvu.js, directory.js, placements.js, marks.js, portal-v2.js, shell.js. The page sets window.LEADER_ROLE to "hod" or "deputy". */
(function () {
  "use strict";
  var ROLE = window.LEADER_ROLE === "deputy" ? "deputy" : "hod", U = window.RVU, esc = U.esc;
  var ME = { hod: { full: "ILO HOD", letter: "H", other: "/deputy.html" }, deputy: { full: "Deputy HOD", letter: "D", other: "/hod.html" } }[ROLE];
  var TOKEN = sessionStorage.getItem("rvnp_user"), info = RVShell.tokenInfo();
  var back = function () { try { sessionStorage.removeItem("rvnp_user"); sessionStorage.removeItem("rvnp_user_role"); } catch (e) {} location.replace("/auth.html?role=staff&as=" + ROLE); };

  if (!TOKEN) { back(); return; }
  if (info.role && info.role !== ROLE) {   /* signed in, but through the other door: send them to their own page */
    location.replace({ hod: "/hod.html", deputy: "/deputy.html", rep: "/ilo.html", student: "/student.html" }[info.role] || "/auth.html?role=staff"); return;
  }
  var headers = function () { return { Authorization: "Bearer " + TOKEN }; }, api = U.api(headers, back);

  var wrap = document.getElementById("wrap");
  wrap.innerHTML =
    '<section id="v-overview"><div class="lv-hello"><h2>Welcome</h2><p>Industrial Liaison Office \u00b7 ' + esc(ME.full) + '</p></div>' +
    '<div class="rv-stats" id="ov-stats"></div>' +
    '<div class="lv-quick"><button class="btn" data-go="students" type="button">Find a student</button><button class="btn" data-go="assign" type="button">Assign trainers</button><button class="btn sec" id="ov-xl" type="button">Download all placements (Excel)</button></div>' +
    '<div class="msg" id="ov-m" role="status"></div>' +
    '<div class="card"><h2>By department</h2><p class="lead">Tap Students to see a department\u2019s courses and classes, or Placements to give its waiting students a trainer.</p><div class="scroll"><table><thead><tr><th>Department</th><th>Students</th><th>Placed</th><th>With trainer</th><th>Placement rate</th><th></th></tr></thead><tbody id="ov-tb"></tbody></table></div></div></section>' +
    '<section id="v-students" hidden><div id="dir"></div></section>' +
    '<section id="v-assign" hidden><div id="pa"></div></section>' +
    '<section id="v-trainers" hidden><div id="pt"></div></section>' +
    '<section id="v-marks" hidden><div class="card"><h2>Marks</h2><p class="lead">Marks for all departments. Download one class, a whole department (sorted per class), or everything.</p><div id="mkbox"></div><div id="v2box" style="margin-top:14px"></div></div></section>';
  var $ = function (i) { return document.getElementById(i); };

  var shell, DS = null, PD = null;
  function go(key) { var it = shell.items.filter(function (x) { return x.key === key; })[0]; if (it) shell.select(it); }

  var dir = RVDir.mount($("dir"), { headers: headers, onAuthFail: back, onData: function (d) { DS = d; overview(); } });
  var pl = RVPlace.mount({ assign: $("pa"), trainers: $("pt") }, { headers: headers, onAuthFail: back, canAssign: true, onOpenAssign: function () { go("assign"); }, onData: function (d) { PD = d; overview(); } });

  function overview() {
    if (!DS && !PD) return;
    var S = DS ? DS.students : [], P = PD ? PD.placements : [], as = P.filter(function (p) { return p.tid; }).length;
    $("ov-stats").innerHTML =
      '<div class="rv-chip"><b>' + S.length + "</b><span>students registered</span></div>" +
      '<div class="rv-chip"><b>' + P.length + "</b><span>students placed</span></div>" +
      '<div class="rv-chip ok"><b>' + as + "</b><span>have a trainer</span></div>" +
      '<div class="rv-chip ' + (P.length - as ? "warn" : "ok") + '"><b>' + (P.length - as) + "</b><span>waiting for a trainer</span></div>" +
      (PD && PD.trainers.length ? '<div class="rv-chip ' + (PD.trainers.some(function (t) { return !t.det; }) ? "warn" : "ok") + '"><b>' + PD.trainers.filter(function (t) { return t.det; }).length + " / " + PD.trainers.length + "</b><span>trainers gave their details</span></div>" : "");
    var depts = (DS ? DS.departments : (PD ? PD.departments : [])).slice(), none = S.filter(function (r) { return !r.d; }).length;
    if (none) depts.push("");
    $("ov-tb").innerHTML = depts.map(function (d) {
      var n = S.filter(function (r) { return r.d === d; }).length, pp = P.filter(function (p) { return p.dept === d; }), a = pp.filter(function (p) { return p.tid; }).length;
      if (!n && !pp.length) return "";
      var pct = n ? Math.round(pp.length * 100 / n) : 0;
      return "<tr><td><b>" + esc(d || "Department not recorded") + "</b></td><td>" + n + "</td><td>" + pp.length + "</td><td>" + a + '</td><td><span class="lv-bar" title="' + pct + '% of students have sent a placement"><i style="width:' + Math.min(100, pct) + '%"></i></span></td>' +
        '<td><div class="lv-act"><button class="btn sec" data-dir="' + esc(d || "__none") + '" type="button">Students</button>' + (pp.length ? '<button class="btn sec" data-pl="' + esc(d) + '" type="button">Placements</button>' : "") + "</div></td></tr>";
    }).join("") || '<tr><td colspan="6">No students have registered yet.</td></tr>';
  }
  wrap.addEventListener("click", function (e) {
    var b = e.target.closest("[data-go],[data-dir],[data-pl],#ov-xl"); if (!b) return;
    if (b.id === "ov-xl") { if (!pl.exportAll()) U.say($("ov-m"), "err", "No placements have been sent yet."); return; }
    if (b.hasAttribute("data-go")) go(b.getAttribute("data-go"));
    else if (b.hasAttribute("data-dir")) { dir.show({ d: b.getAttribute("data-dir"), c: "", k: "", i: "", p: "", q: "" }); go("students"); }
    else { pl.show({ d: b.getAttribute("data-pl"), s: "all" }); go("assign"); }
  });

  /* marks and memos: unchanged panels */
  window.MKP = RVMarks.mount($("mkbox"), { role: "hod", headers: headers, onAuthFail: back });
  RVV2.mount($("v2box"), { role: "hod", headers: headers, onAuthFail: back, onChange: function () { window.MKP.reload(); } });

  shell = RVShell.mount({
    root: wrap, brand: { letter: ME.letter, name: ME.full, sub: "Industrial Liaison Office" }, title: "Overview",
    userLine: "<b>" + esc(ME.full) + "</b>Signed in", top: [{ href: "/feedback.html", icon: "inbox", label: "Student feedback" }], signOut: back,
    groups: [
      { label: "Dashboard", items: [{ view: $("v-overview"), key: "overview", icon: "home", label: "Overview" }] },
      { label: "Students", items: [{ view: $("v-students"), key: "students", icon: "users", label: "Student directory" }] },
      { label: "Placements", items: [{ view: $("v-assign"), key: "assign", icon: "pin", label: "Assign trainers" }, { view: $("v-trainers"), key: "trainers", icon: "wrench", label: "Trainers" }] },
      { label: "Results", items: [{ view: $("v-marks"), key: "marks", icon: "chart", label: "Marks" }] }
    ]
  });
  /* the person's name, for the greeting and the sidebar */
  api("GET", "me").then(function (m) {
    var first = String(m.name || "").split(" ")[0]; first = first ? first.charAt(0) + first.slice(1).toLowerCase() : "";
    wrap.querySelector(".lv-hello h2").textContent = "Welcome" + (first ? ", " + first : "");
    var u = document.querySelector(".sh-user"); if (u) u.innerHTML = "<b>" + esc(m.name || ME.full) + "</b>" + esc(ME.full);
  }).catch(function () {});
})();
