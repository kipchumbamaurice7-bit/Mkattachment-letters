/* RVNP marks panel: view, upload (admin/HOD) and download marks per class, per department, or everything.
   RVMarks.mount(el, {headers:fn, role:"admin"|"hod"|"rep", dept:"", onAuthFail:fn}) */
(function () {
  var NOTE = "Not yet submitted";
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function stats(g) {
    var n = g.students.length, got = g.students.filter(function (s) { return s.m != null; });
    var p = got.map(function (s) { return s.pct; });
    return { n: n, got: got.length, miss: n - got.length, rate: n ? Math.round(got.length / n * 1000) / 10 : 0,
      avg: p.length ? Math.round(p.reduce(function (a, b) { return a + b; }, 0) / p.length * 10) / 10 : null,
      hi: p.length ? Math.max.apply(null, p) : null, lo: p.length ? Math.min.apply(null, p) : null };
  }
  function sheetName(used, t) {
    var b = String(t).replace(/[\[\]\*\?\/\\:]/g, "-").slice(0, 28) || "Class", n = b, i = 2;
    while (used[n.toLowerCase()]) n = b.slice(0, 26) + "-" + (i++);
    used[n.toLowerCase()] = 1; return n;
  }
  function sumRows(classes) {
    return classes.map(function (g) { var s = stats(g); return [g.dept, g.c, s.n, s.got, s.miss, s.rate / 100, s.avg == null ? "" : s.avg / 100, s.hi == null ? "" : s.hi / 100, s.lo == null ? "" : s.lo / 100]; });
  }
  var SUMHEAD = ["Department", "Class", "Students in database", "Marks received", "Marks missing", "% of class with marks", "Average %", "Highest %", "Lowest %"];
  function pctFmt(ws, cols, from, to) {
    for (var r = from; r <= to; r++) cols.forEach(function (c) { var a = XLSX.utils.encode_cell({ r: r, c: c }); if (ws[a] && typeof ws[a].v === "number") ws[a].z = "0.0%"; });
  }
  function classSheet(g) {
    var s = stats(g), rows = [
      ["Class", g.c], ["Department", g.dept],
      ["Students in database", s.n], ["Marks received", s.got + " of " + s.n + " (" + s.rate + "%)"], ["Marks missing", s.miss],
      ["Class average %", s.avg == null ? "" : s.avg / 100], [],
      ["No.", "Student name", "Admission number", "Marks", "Out of", "Percentage", "Status"]];
    g.students.forEach(function (x, i) { rows.push([i + 1, x.n, x.a, x.m == null ? "" : x.m, x.o == null ? "" : x.o, x.pct == null ? "" : x.pct / 100, x.m == null ? NOTE.toUpperCase() : "Marked"]); });
    var ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 20 }, { wch: 34 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 22 }];
    pctFmt(ws, [5], 5, rows.length); ws["B6"] && (ws["B6"].z = "0.0%");
    return ws;
  }
  function flatSheet(classes) {
    var rows = [["Department", "Class", "Student name", "Admission number", "Marks", "Out of", "Percentage", "Status"]];
    classes.forEach(function (g) { g.students.forEach(function (x) { rows.push([g.dept, g.c, x.n, x.a, x.m == null ? "" : x.m, x.o == null ? "" : x.o, x.pct == null ? "" : x.pct / 100, x.m == null ? NOTE.toUpperCase() : "Marked"]); }); });
    var ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 36 }, { wch: 18 }, { wch: 34 }, { wch: 20 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 22 }];
    pctFmt(ws, [6], 1, rows.length); return ws;
  }
  function workbook(classes, flat) {
    var wb = XLSX.utils.book_new(), used = { summary: 1, "all students": 1 };
    var tot = classes.reduce(function (a, g) { var s = stats(g); a.n += s.n; a.got += s.got; return a; }, { n: 0, got: 0 });
    var rows = [SUMHEAD].concat(sumRows(classes));
    rows.push(["TOTAL", "", tot.n, tot.got, tot.n - tot.got, tot.n ? tot.got / tot.n : 0, "", "", ""]);
    var ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 38 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 11 }, { wch: 11 }, { wch: 11 }];
    pctFmt(ws, [5, 6, 7, 8], 1, rows.length); XLSX.utils.book_append_sheet(wb, ws, "Summary");
    if (flat) XLSX.utils.book_append_sheet(wb, flatSheet(classes), "All students");
    classes.forEach(function (g) { XLSX.utils.book_append_sheet(wb, classSheet(g), sheetName(used, g.c)); });
    return wb;
  }
  function safe(t) { return String(t).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 50) || "marks"; }


  function normAdm(a) { return String(a == null ? "" : a).toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^L4EI/, "EIL4"); }
  function colNum(t) { t = String(t || "").trim().toUpperCase(); if (!/^[A-Z]{1,2}$/.test(t)) return 0; var n = 0; for (var i = 0; i < t.length; i++) n = n * 26 + t.charCodeAt(i) - 64; return n; }
  function colName(n) { var s = ""; while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }
  function loadExcelJS() {
    return new Promise(function (res, rej) {
      if (window.ExcelJS) return res();
      var s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js";
      s.onload = function () { res(); }; s.onerror = function () { rej(new Error("The Excel tool did not load. Check your connection and try again.")); };
      document.head.appendChild(s);
    });
  }
  function b64ToBuf(b) { var bin = atob(b), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
  function cellText(c) { var v = c.value; if (v == null) return ""; if (typeof v === "object") { if (v.richText) return v.richText.map(function (t) { return t.text; }).join(""); if (v.result != null) return String(v.result); if (v.text != null) return String(v.text); } return String(v); }
  /* put the portal's marks into an uploaded standard marksheet, keeping its order and layout */
  async function fillSheet(buf, students, opt) {
    await loadExcelJS();
    var wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
    var map = {}; students.forEach(function (x) { map[normAdm(x.a)] = x; });
    var rep = { filled: 0, noMarks: [], notInDb: [], sheets: [], skippedFormula: 0 }, seen = {};
    wb.worksheets.forEach(function (ws) {
      var hr = 0, ac = 0, mc = 0, pc = 0, lim = Math.min(ws.rowCount, 60);
      for (var r = 1; r <= lim && !hr; r++) {
        var row = ws.getRow(r);
        row.eachCell({ includeEmpty: false }, function (c, n) { if (!ac && /adm|reg\.?\s*no|registration/i.test(cellText(c))) { ac = n; hr = r; } });
      }
      if (!hr) { rep.sheets.push(ws.name + ": no Admission column found, skipped"); return; }
      ws.getRow(hr).eachCell({ includeEmpty: false }, function (c, n) {
        var t = cellText(c);
        if (!mc && /mark|score|total|overall|attachment/i.test(t) && !/%|percent|out of/i.test(t)) mc = n;
        if (!pc && /%|percent/i.test(t)) pc = n;
      });
      if (opt.marksCol) mc = opt.marksCol; if (opt.pctCol) pc = opt.pctCol;
      if (!mc) { rep.sheets.push(ws.name + ": no Marks column found. Type the column letter in the Marks column box."); return; }
      var n0 = rep.filled;
      for (var r2 = hr + 1; r2 <= ws.rowCount; r2++) {
        var adm = cellText(ws.getCell(r2, ac)).trim(), key = normAdm(adm);
        if (key.length < 4) continue;
        var st = map[key];
        if (!st) { rep.notInDb.push(adm); continue; }
        seen[key] = 1;
        if (st.m == null) { rep.noMarks.push(st.n + " (" + st.a + ")"); continue; }
        var mcell = ws.getCell(r2, mc);
        if (mcell.formula || (mcell.value && mcell.value.formula)) { rep.skippedFormula++; continue; }
        mcell.value = st.m; rep.filled++;
        if (pc) { var pcell = ws.getCell(r2, pc); if (!(pcell.value && pcell.value.formula)) { pcell.value = st.pct / 100; pcell.numFmt = "0.0%"; } }
      }
      rep.sheets.push(ws.name + ": header row " + hr + ", admission column " + colName(ac) + ", marks column " + colName(mc) + (pc ? ", percentage column " + colName(pc) : "") + " - " + (rep.filled - n0) + " filled");
    });
    rep.missingFromSheet = students.filter(function (x) { return x.m != null && !seen[normAdm(x.a)]; }).map(function (x) { return x.n + " (" + x.a + ")"; });
    rep.buffer = await wb.xlsx.writeBuffer();
    return rep;
  }

  function mount(el, o) {
    var D = null, role = o.role, dept = o.dept || "";
    el.innerHTML = '<div class="msg" data-m></div><div data-body></div>';
    var msg = el.querySelector("[data-m]"), body = el.querySelector("[data-body]");
    function say(c, t) { msg.className = "msg" + (c ? " " + c : ""); msg.textContent = t || ""; }
    async function call(method, path, b) {
      var h = Object.assign({ "Content-Type": "application/json" }, o.headers ? o.headers() : {});
      var r = await fetch("/api/" + path, { method: method, headers: h, body: JSON.stringify(Object.assign({}, b || {}, o.role === "rep" ? { dept: o.dept } : {})) });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) { var e = new Error(d.error || "Something went wrong."); e.status = r.status; throw e; }
      return d;
    }
    function inScope() { return D.classes.filter(function (g) { return !dept || g.dept === dept; }); }
    function render() {
      var cl = inScope(), canAll = role !== "rep", h = "";
      if (canAll) {
        h += '<div class="grid"><div><label>Department</label><select data-d><option value="">All departments</option>' +
          D.departments.map(function (d) { return '<option' + (d === dept ? " selected" : "") + ">" + esc(d) + "</option>"; }).join("") + "</select></div>" +
          '<div><label>Class</label><select data-c><option value="">Whole selection</option>' +
          cl.map(function (g) { return '<option value="' + esc(g.c) + '">' + esc(g.c) + "</option>"; }).join("") + "</select></div></div>";
      } else {
        h += '<div class="grid"><div class="full"><label>Class</label><select data-c><option value="">Whole department</option>' +
          cl.map(function (g) { return '<option value="' + esc(g.c) + '">' + esc(g.c) + "</option>"; }).join("") + "</select></div></div>";
      }
      var t = cl.reduce(function (a, g) { var s = stats(g); a.n += s.n; a.got += s.got; return a; }, { n: 0, got: 0 });
      h += '<p style="margin:14px 0 6px;font-size:17px"><b>' + t.got + "</b> of <b>" + t.n + "</b> students have marks" + (t.n ? " (" + Math.round(t.got / t.n * 100) + "%)" : "") + "</p>";
      h += '<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr style="text-align:left;color:var(--mut)"><th style="padding:6px">Class</th>' + (canAll ? '<th style="padding:6px">Department</th>' : "") + '<th style="padding:6px">With marks</th><th style="padding:6px">Missing</th><th style="padding:6px">Average</th>' + (canAll ? '<th></th>' : "") + "</tr></thead><tbody>";
      cl.forEach(function (g) {
        var s = stats(g), w = Math.round(s.rate);
        h += '<tr style="border-top:1px solid var(--bd)"><td style="padding:8px 6px"><b>' + esc(g.c) + "</b></td>" + (canAll ? '<td style="padding:8px 6px">' + esc(g.dept) + "</td>" : "") +
          '<td style="padding:8px 6px;min-width:150px"><b>' + s.got + " of " + s.n + "</b> (" + w + '%)<div style="height:6px;background:var(--soft);border-radius:4px;margin-top:4px"><div style="height:6px;width:' + w + '%;background:' + (w === 100 ? "var(--ok)" : "var(--or)") + ';border-radius:4px"></div></div></td>' +
          '<td style="padding:8px 6px;color:' + (s.miss ? "var(--ord)" : "var(--ok)") + '"><b>' + s.miss + "</b></td><td style=\"padding:8px 6px\">" + (s.avg == null ? "-" : s.avg + "%") + "</td>" +
          (canAll ? '<td style="padding:8px 6px"><button class="btn sec" style="min-height:34px;padding:4px 10px;font-size:13px" data-set="' + esc(g.c) + '">Change</button></td>' : "") + "</tr>";
      });
      if (!cl.length) h += '<tr><td colspan="6" style="padding:12px;color:var(--mut)">No classes found.</td></tr>';
      h += "</tbody></table></div>";
      h += '<div class="actions"><button class="btn" data-dl="sel">Download selected class</button><button class="btn" data-dl="all">Download ' + (canAll && !dept ? "everything" : "whole department") + '</button>' +
        (canAll ? '<button class="btn sec" data-dl="bulk">Bulk download (one list)</button>' : "") + '<button class="btn sec" data-rf>Refresh</button></div>';
      h += '<div class="hint">Every class sheet lists all students in the database. Students without marks are marked "' + NOTE.toUpperCase() + '". Percentage = marks / out of.</div>';
      h += '<div class="reqbox"><b>Upload marks</b><div class="hint" style="margin-bottom:8px">Excel or CSV with columns: <b>Admission number</b>, <b>Marks</b> and optionally <b>Out of</b> (default 100). Students are matched by admission number' + (role === "rep" ? ". You can only upload marks for students in your own department." : ".") + ' Uploading again updates marks already saved.</div><input type="file" data-f accept=".xlsx,.xls,.csv"></div>';
      h += '<div class="reqbox"><b>Enter or edit marks</b><div class="hint" style="margin-bottom:8px">Search for one student by name or admission number, or edit a whole class. Clear a box to remove a mark.</div><label>Search a student</label><div style="display:flex;gap:8px"><input data-eq placeholder="Name or admission number" autocomplete="off"><button class="btn" data-es0 style="flex:none">Search</button></div><div class="actions"><button class="btn sec" data-ed>Edit whole class (choose it in the Class box above)</button></div><div data-edbox style="margin-top:12px"></div></div>';
      h += '<div class="reqbox"><button class="btn" data-ms type="button" style="width:100%;justify-content:flex-start;gap:14px;padding:14px 18px;background:linear-gradient(135deg,var(--or),var(--ord))"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/><path d="M8 13h8M8 17h8M11 10v10"/></svg><span style="text-align:left"><b style="display:block;font-size:17px">Standard marksheets</b><span style="font-weight:400;font-size:13px">Upload your marksheet, then transfer the marks into it</span></span></button><div data-msbox hidden style="margin-top:14px"></div></div>';
      if (canAll) {
        h += '<div class="reqbox" data-cdbox hidden><b data-cdt></b><div class="grid" style="margin-top:8px"><div class="full"><select data-cd><option value="">Work it out from placements</option>' + D.departments.filter(function (d) { return d !== "Not yet assigned"; }).map(function (d) { return "<option>" + esc(d) + "</option>"; }).join("") + '</select></div></div><div class="actions"><button class="btn" data-cds>Save department</button></div></div>';
      }
      if (role === "admin") {
        h += '<div class="reqbox"><b>Department codes for ILO representatives</b><div class="hint" style="margin-bottom:8px">Each representative opens the ILO page, picks the department and types its code. Leave the code empty and save to remove it.</div><div class="grid"><div><select data-kd>' +
          D.departments.filter(function (d) { return d !== "Not yet assigned"; }).map(function (d) { return "<option>" + esc(d) + (D.codes && D.codes.indexOf(d) >= 0 ? " (code set)" : "") + "</option>"; }).join("") + '</select></div><div><input data-kc placeholder="New code (6+ characters)" autocomplete="off"></div></div><div class="actions"><button class="btn sec" data-ks>Save code</button></div></div>';
      }
      body.innerHTML = h; wire();
    }
    function pick() {
      var c = (body.querySelector("[data-c]") || {}).value;
      return c ? inScope().filter(function (g) { return g.c === c; }) : inScope();
    }
    function wire() {
      var sd = body.querySelector("[data-d]"); if (sd) sd.onchange = function () { dept = sd.value; render(); };
      body.querySelector("[data-rf]").onclick = load;
      body.querySelectorAll("[data-dl]").forEach(function (b) {
        b.onclick = function () {
          var k = b.getAttribute("data-dl"), cl = k === "sel" ? pick() : inScope();
          if (k === "sel" && !(body.querySelector("[data-c]") || {}).value) return say("err", "Choose a class first, or use the Download whole department button.");
          if (!cl.length) return say("err", "Nothing to download.");
          if (!window.XLSX) return say("err", "The Excel tool did not load. Check your connection and try again.");
          var name = k === "sel" ? cl[0].c : (dept || "ALL_DEPARTMENTS");
          XLSX.writeFile(workbook(cl, k === "bulk" || (k === "all" && cl.length > 1 && role !== "rep")), "RVNP_marks_" + safe(name) + ".xlsx");
          say("ok", "Downloaded.");
        };
      });
      body.querySelectorAll("[data-set]").forEach(function (b) {
        b.onclick = function () { var box = body.querySelector("[data-cdbox]"); box.hidden = false; box.setAttribute("data-c", b.getAttribute("data-set")); box.querySelector("[data-cdt]").textContent = "Department for class " + b.getAttribute("data-set"); box.scrollIntoView({ behavior: "smooth", block: "center" }); };
      });
      var cds = body.querySelector("[data-cds]");
      if (cds) cds.onclick = async function () {
        var box = body.querySelector("[data-cdbox]");
        try { D = await call("POST", "marks/classdept", { c: box.getAttribute("data-c"), dept: box.querySelector("[data-cd]").value }); render(); say("ok", "Saved."); } catch (e) { fail(e); }
      };
      var ks = body.querySelector("[data-ks]");
      if (ks) ks.onclick = async function () {
        try { D = await call("POST", "marks/ilocode", { dept: body.querySelector("[data-kd]").value.replace(" (code set)", ""), code: body.querySelector("[data-kc]").value }); render(); say("ok", "Code saved."); } catch (e) { fail(e); }
      };
      function editor(list, title) {
        var box = body.querySelector("[data-edbox]");
        if (!list.length) { box.innerHTML = '<div class="hint">No students found.</div>'; return; }
        var h = '<b>' + esc(title) + '</b><div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr style="text-align:left;color:var(--mut)"><th style="padding:6px">Student</th><th style="padding:6px">Marks</th><th style="padding:6px">Out of</th></tr></thead><tbody>';
        list.forEach(function (it, i) {
          var x = it.x;
          h += '<tr style="border-top:1px solid var(--bd)"><td style="padding:6px"><b>' + esc(x.n) + '</b><br><span style="color:var(--mut);font-size:12px">' + esc(x.a) + " &middot; " + esc(it.c) + '</span></td><td style="padding:6px"><input data-em="' + i + '" type="number" inputmode="decimal" min="0" step="any" value="' + (x.m == null ? "" : x.m) + '" style="width:90px;min-height:38px"></td><td style="padding:6px"><input data-eo="' + i + '" type="number" inputmode="decimal" min="1" step="any" value="' + (x.o == null ? "" : x.o) + '" placeholder="100" style="width:80px;min-height:38px"></td></tr>';
        });
        box.innerHTML = h + '</tbody></table></div><div class="actions"><button class="btn" data-es>Save changes</button></div>';
        box.scrollIntoView({ behavior: "smooth", block: "start" });
        box.querySelector("[data-es]").onclick = async function () {
          var rows = [];
          list.forEach(function (it, i) {
            var x = it.x, mv = box.querySelector('[data-em="' + i + '"]').value.trim(), ov = box.querySelector('[data-eo="' + i + '"]').value.trim();
            var oldm = x.m == null ? "" : String(x.m), oldo = x.o == null ? "" : String(x.o);
            if (mv !== oldm || (mv !== "" && ov !== oldo)) rows.push({ a: x.a, m: mv, o: ov, clear: true });
          });
          if (!rows.length) return say("info", "No changes to save.");
          try { say("", "Saving..."); var res = await call("POST", "marks/upload", { rows: rows }); D = res; var q = (body.querySelector("[data-eq]") || {}).value; render(); say(res.invalidCount ? "err" : "ok", "Saved " + res.saved + " marks" + (res.cleared ? ", removed " + res.cleared : "") + "." + (res.invalidCount ? " " + res.invalidCount + " were not saved: marks must be a number not above the total." : "")); } catch (e) { fail(e); }
        };
      }
      body.querySelector("[data-ed]").onclick = function () {
        var cv = (body.querySelector("[data-c]") || {}).value;
        if (!cv) return say("err", "Choose a class in the Class box first, or search for a student below.");
        var g = inScope().filter(function (x) { return x.c === cv; })[0]; if (!g) return;
        editor(g.students.map(function (x) { return { x: x, c: g.c }; }), "Whole class: " + g.c);
      };
      var eq = body.querySelector("[data-eq]");
      function doSearch() {
        var q = eq.value.trim().toUpperCase().replace(/[^A-Z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
        if (q.join("").length < 2) return say("err", "Type at least 2 letters of the name or admission number.");
        var found = [];
        inScope().forEach(function (g) { g.students.forEach(function (x) { var hay = (x.n + " " + x.a).toUpperCase().replace(/[^A-Z0-9\s]/g, " "); if (q.every(function (w) { return hay.indexOf(w) >= 0; })) found.push({ x: x, c: g.c }); }); });
        say("", ""); editor(found.slice(0, 25), found.length > 25 ? "First 25 of " + found.length + " students found. Type more to narrow." : found.length + " student(s) found");
      }
      body.querySelector("[data-es0]").onclick = doSearch;
      eq.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); doSearch(); } };

      var msb = body.querySelector("[data-ms]"), msx = body.querySelector("[data-msbox]");
      async function drawTemplates(list) {
        var h = '<div class="hint" style="margin-bottom:10px">Upload the standard marksheet your department uses (Excel .xlsx) with the students already arranged in the order you want. Marks are matched by <b>admission number</b>, so the order and layout stay exactly as you made them.</div><input type="file" data-tf accept=".xlsx">';
        h += '<div class="hint" style="margin:8px 0 0">Your sheet needs a header row with an <b>Admission</b> column and a <b>Marks</b> column. Optional: a <b>%</b> column.</div>';
        h += '<div style="margin-top:14px"><b>Saved marksheets</b></div>';
        if (!list.length) h += '<div class="hint">None yet.</div>';
        list.forEach(function (t) { h += '<div class="card2" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><div style="flex:1;min-width:150px"><b>' + esc(t.name) + '</b><span class="mut">' + Math.round(t.size / 1024) + ' KB</span></div><button class="btn" style="min-height:40px;padding:6px 14px" data-fill="' + esc(t.id) + '">Transfer marks</button><button class="btn sec" style="min-height:40px;padding:6px 14px" data-tdel="' + esc(t.id) + '">Remove</button></div>'; });
        if (list.length) h += '<div class="grid" style="margin-top:12px"><div><label>Marks column (optional)</label><input data-mcol maxlength="2" placeholder="e.g. F" autocapitalize="characters"></div><div><label>Percentage column (optional)</label><input data-pcol maxlength="2" placeholder="e.g. G" autocapitalize="characters"></div></div><div class="hint">Leave blank and the system finds them from your header names.</div>';
        h += '<div data-msr style="margin-top:12px"></div>';
        msx.innerHTML = h; wireTemplates();
      }
      function needDept() { if (role !== "rep" && !dept) { say("err", "Choose a department in the Department box above first."); return false; } return true; }
      async function tcall(path, b) { return call("POST", path, Object.assign({ dept: dept }, b || {})); }
      function wireTemplates() {
        var tf = msx.querySelector("[data-tf]");
        tf.onchange = function () {
          var f = tf.files[0]; if (!f) return;
          if (f.size > 4e6) return say("err", "The file is larger than 4 MB.");
          var fr = new FileReader();
          fr.onload = async function () {
            try { say("", "Saving marksheet..."); var r = await tcall("marks/template-add", { name: f.name, data: String(fr.result).split(",")[1] }); say("ok", "Marksheet saved."); drawTemplates(r.templates); } catch (e) { fail(e); }
          };
          fr.readAsDataURL(f);
        };
        msx.querySelectorAll("[data-tdel]").forEach(function (b) { b.onclick = async function () { if (!confirm("Remove this marksheet?")) return; try { var r = await tcall("marks/template-del", { id: b.getAttribute("data-tdel") }); drawTemplates(r.templates); say("ok", "Removed."); } catch (e) { fail(e); } }; });
        msx.querySelectorAll("[data-fill]").forEach(function (b) {
          b.onclick = async function () {
            var out = msx.querySelector("[data-msr]"); b.disabled = true;
            try {
              say("", "Transferring marks...");
              var t = await tcall("marks/template-get", { id: b.getAttribute("data-fill") });
              var students = []; inScope().forEach(function (g) { g.students.forEach(function (x) { students.push(x); }); });
              var mcEl = msx.querySelector("[data-mcol]"), pcEl = msx.querySelector("[data-pcol]");
              var rep = await fillSheet(b64ToBuf(t.data), students, { marksCol: colNum(mcEl && mcEl.value), pctCol: colNum(pcEl && pcEl.value) });
              var blob = new Blob([rep.buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), a = document.createElement("a");
              a.href = URL.createObjectURL(blob); a.download = t.name.replace(/\.xlsx$/i, "") + "_with_marks.xlsx"; document.body.appendChild(a); a.click(); a.remove();
              var h = "<b>" + rep.filled + " marks transferred.</b>";
              h += "<ul style='margin:6px 0 0;padding-left:18px;font-size:14px'>" + rep.sheets.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
              if (rep.noMarks.length) h += "<div style='margin-top:8px;color:var(--ord)'><b>" + rep.noMarks.length + " students in your sheet have no marks yet:</b> " + esc(rep.noMarks.slice(0, 8).join(", ")) + (rep.noMarks.length > 8 ? "..." : "") + "</div>";
              if (rep.notInDb.length) h += "<div style='margin-top:8px'><b>" + rep.notInDb.length + " admission numbers in your sheet were not found in the database:</b> " + esc(rep.notInDb.slice(0, 8).join(", ")) + (rep.notInDb.length > 8 ? "..." : "") + "</div>";
              if (rep.missingFromSheet.length) h += "<div style='margin-top:8px'><b>" + rep.missingFromSheet.length + " students with marks are not on your sheet:</b> " + esc(rep.missingFromSheet.slice(0, 8).join(", ")) + (rep.missingFromSheet.length > 8 ? "..." : "") + "</div>";
              if (rep.skippedFormula) h += "<div style='margin-top:8px'>" + rep.skippedFormula + " marks cells contain formulas and were left as they are.</div>";
              out.innerHTML = '<div class="card2">' + h + "</div>"; say("ok", "Done. Your filled marksheet was downloaded.");
            } catch (e) { fail(e); }
            b.disabled = false;
          };
        });
      }
      msb.onclick = async function () {
        if (!needDept()) return;
        if (!msx.hidden) { msx.hidden = true; return; }
        try { say("", "Loading..."); var r = await tcall("marks/templates"); msx.hidden = false; await drawTemplates(r.templates); say("", ""); } catch (e) { fail(e); }
      };
      var f = body.querySelector("[data-f]");
      if (f) f.onchange = async function () {
        var file = f.files[0]; if (!file) return;
        try {
          if (!window.XLSX) throw new Error("The Excel tool did not load. Try again.");
          var wb = XLSX.read(await file.arrayBuffer(), { type: "array" }), data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
          var rows = data.map(function (r) {
            var k = {}; Object.keys(r).forEach(function (x) { k[x.toLowerCase().replace(/[^a-z]/g, "")] = r[x]; });
            return { a: k.admissionnumber || k.admno || k.admission || k.adm || k.regno || "", m: k.marks != null && k.marks !== "" ? k.marks : (k.mark != null ? k.mark : (k.score != null ? k.score : "")), o: k.outof != null ? k.outof : (k.total != null ? k.total : "") };
          });
          if (!rows.length) throw new Error("The file has no rows.");
          say("", "Uploading...");
          var res = await call("POST", "marks/upload", { rows: rows }); D = res; render();
          say(res.invalidCount || res.unmatchedCount || res.otherDeptCount ? "info" : "ok", "Saved " + res.saved + " marks." + (res.unmatchedCount ? " " + res.unmatchedCount + " admission numbers were not in the database (" + res.unmatched.slice(0, 5).join(", ") + (res.unmatchedCount > 5 ? "..." : "") + ")." : "") + (res.otherDeptCount ? " " + res.otherDeptCount + " students are not in your department and were skipped." : "") + (res.invalidCount ? " " + res.invalidCount + " rows had marks above the total or not a number." : ""));
        } catch (e) { fail(e); }
      };
    }
    function fail(e) { if (e.status === 401 && o.onAuthFail) o.onAuthFail(e); say("err", e.message); }
    async function load() {
      try { say("", "Loading..."); D = await call("POST", "marks/data", { dept: o.dept }); if (role === "rep") dept = o.dept; render(); say("", ""); }
      catch (e) { body.innerHTML = ""; fail(e); }
    }
    load();
    return { reload: load };
  }
  window.RVMarks = { mount: mount };
})();
