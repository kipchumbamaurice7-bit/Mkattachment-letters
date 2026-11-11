/* RVNP portal v2 panels: marks progress graph (screen + PDF), memos, attachment dates,
   emergency contacts, PIN reset, mark unlock and audit log. Used on the ILO, HOD and admin pages. */
(function () {
  "use strict";
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function when(t) { return t ? new Date(t).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""; }

  function mount(el, o) {
    var role = o.role, isHod = role === "hod" || role === "deputy" || role === "admin";
    el.innerHTML = '<div class="msg" data-m></div><div data-b></div>';
    var msg = el.querySelector("[data-m]"), box = el.querySelector("[data-b]");
    function say(c, t) { msg.className = "msg" + (c ? " " + c : ""); msg.textContent = t || ""; if (t) msg.scrollIntoView({ block: "nearest" }); }
    async function call(method, path, b) {
      var h = Object.assign({ "Content-Type": "application/json" }, o.headers ? o.headers() : {});
      var r = await fetch("/api/" + path, { method: method, headers: h, body: method === "GET" ? undefined : JSON.stringify(b || {}) });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) { var e = new Error(d.error || "Something went wrong."); e.status = r.status; throw e; }
      return d;
    }
    function fail(e) { if (e.status === 401 && o.onAuthFail) o.onAuthFail(e); say("err", e.message); }
    function sec(id, title, inner) { return '<details class="reqbox" data-sec="' + id + '"><summary style="cursor:pointer;font-weight:700">' + title + '</summary><div style="margin-top:10px" data-s="' + id + '">' + inner + "</div></details>"; }

    var html = sec("pg", "Marks progress (graph)", '<div class="hint">Loading...</div>') +
      sec("mm", "Memos", '<div class="hint">Loading...</div>') +
      (role === "rep" || role === "hod" || role === "deputy" ? sec("dt", "Attachment start and end dates", '<div class="hint">Type 2 or more letters of a name, admission number or class.</div><div style="display:flex;gap:8px"><input data-dq placeholder="Name, admission number or class" autocomplete="off"><button class="btn" data-dgo style="flex:none">Search</button></div><div data-dl></div>') : "") +
      (role !== "admin" ? sec("dr", "Dropouts (removal needs HOD / Deputy approval)", '<div class="hint">Loading...</div>') : "") +
      sec("em", "Next of kin and emergency contacts", '<div style="display:flex;gap:8px"><input data-eq placeholder="Name or admission number (3+ letters)" autocomplete="off"><button class="btn" data-ego style="flex:none">Search</button></div><div data-el></div>') +
      sec("pr", "Reset a student's PIN", '<div class="hint">Use this when a student forgets their PIN. Give the new PIN to the student in person.</div><div class="grid"><div><label>Admission number</label><input data-ra autocomplete="off"></div><div><label>New PIN (6-12 digits)</label><input data-rp inputmode="numeric" autocomplete="off"></div></div><div class="actions"><button class="btn" data-rgo>Reset PIN</button></div>') +
      (isHod ? sec("au", "Unlock a mark and audit log", (role !== "admin" ? '<div class="hint">Unlock one student\'s mark so the ILO Rep can correct it. The old value and your reason are kept in the audit log.</div><div class="grid"><div><label>Admission number</label><input data-ua autocomplete="off"></div><div class="full"><label>Reason for the correction</label><input data-ur autocomplete="off"></div></div><div class="actions"><button class="btn" data-ugo>Unlock mark</button></div><div class="grid" style="margin-top:12px"><div><label>Or unlock a whole class</label><input data-uc placeholder="Class, e.g. EPL6" autocomplete="off"></div><div><label>Reason</label><input data-ucr autocomplete="off"></div></div><div class="actions"><button class="btn" data-ucgo>Unlock class</button></div>' : '<div class="hint">Only the HOD or Deputy HOD can unlock a mark. You can read the audit log.</div>') + '<div class="actions"><button class="btn sec" data-ald>Show audit log</button></div><div data-al></div>') : "");
    box.innerHTML = html;
    var only = Array.isArray(o.only) ? o.only : null, has = function (id) { return !only || only.indexOf(id) >= 0; };
    if (only) Array.prototype.forEach.call(box.querySelectorAll("details[data-sec]"), function (d) {
      if (!has(d.getAttribute("data-sec"))) d.hidden = true; else if (o.flat) { d.open = true; d.classList.add("v2flat"); }
    });
    function S(id) { return box.querySelector('[data-s="' + id + '"]'); }
    function Q(sel) { return box.querySelector(sel); }

    /* ---------- progress graph ---------- */
    var PG = null, view = "dept";
    var labels = { dept: "Department", course: "Course", cls: "Class" };
    function drawPg() {
      var rows = PG[view] || [];
      var h = '<div class="grid"><div class="full"><label>Show progress per</label><select data-pv>' + Object.keys(labels).map(function (k) { return '<option value="' + k + '"' + (k === view ? " selected" : "") + ">" + labels[k] + "</option>"; }).join("") + "</select></div></div>";
      var tot = rows.reduce(function (a, r) { a.t += r.total; a.e += r.entered; return a; }, { t: 0, e: 0 });
      h += '<p style="margin:10px 0"><b>' + tot.e + "</b> of <b>" + tot.t + "</b> placed students have a mark" + (tot.t ? " (" + Math.round(tot.e / tot.t * 1000) / 10 + "%)" : "") + "</p>";
      rows.forEach(function (r) {
        h += '<div style="margin:8px 0"><div style="display:flex;justify-content:space-between;gap:8px;font-size:14px"><span>' + esc(r.k) + "</span><b>" + r.pct + '%</b></div><div style="height:12px;background:var(--soft);border-radius:6px"><div style="height:12px;width:' + r.pct + "%;background:" + (r.pct >= 100 ? "var(--ok)" : "var(--or)") + ';border-radius:6px"></div></div><div style="font-size:12px;color:var(--mut)">' + r.entered + " entered, " + (r.total - r.entered) + " pending, " + r.total + " placed</div></div>";
      });
      if (!rows.length) h += '<div class="hint">No placed students yet.</div>';
      h += '<div class="actions"><button class="btn" data-ppdf>Download PDF</button><button class="btn sec" data-prf>Refresh</button></div><div class="hint">In the print window choose "Save as PDF".</div>';
      S("pg").innerHTML = h;
      S("pg").querySelector("[data-pv]").onchange = function (e) { view = e.target.value; drawPg(); };
      S("pg").querySelector("[data-prf]").onclick = loadPg;
      S("pg").querySelector("[data-ppdf]").onclick = function () {
        var w = window.open("", "_blank"); if (!w) return say("err", "Allow pop-ups to download the PDF.");
        var rowsH = rows.map(function (r) { return "<tr><td>" + esc(r.k) + "</td><td>" + r.entered + "</td><td>" + (r.total - r.entered) + "</td><td>" + r.total + '</td><td style="width:38%"><div class="b"><div style="width:' + r.pct + '%"></div></div></td><td><b>' + r.pct + "%</b></td></tr>"; }).join("");
        w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Marks progress</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#111}img{width:100%;max-height:150px;object-fit:contain}h2{margin:14px 0 4px}table{width:100%;border-collapse:collapse;font-size:13px}td,th{border-bottom:1px solid #ccc;padding:6px;text-align:left}.b{height:12px;background:#e5e5e5;border-radius:6px}.b div{height:12px;background:#1b7f3b;border-radius:6px;-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body><img src="/letterhead.png" alt=""><h2>Attachment marks progress per ' + labels[view].toLowerCase() + "</h2><div>" + tot.e + " of " + tot.t + " placed students have a mark. Generated " + when(Date.now()) + "</div><br><table><thead><tr><th>" + labels[view] + "</th><th>Entered</th><th>Pending</th><th>Placed</th><th>Progress</th><th>%</th></tr></thead><tbody>" + rowsH + "</tbody></table><script>var i=document.querySelector('img');function go(){setTimeout(function(){print()},300)}if(i.complete)go();else{i.onload=go;i.onerror=go}<\/script></body></html>");
        w.document.close();
      };
    }
    async function loadPg() { try { var d = await call("POST", "marks/data", {}); PG = d.progress; drawPg(); } catch (e) { S("pg").innerHTML = ""; fail(e); } }

    /* ---------- memos ---------- */
    async function loadMemos() {
      try {
        var d = await call("POST", "memo/list", {}), h = "";
        if (d.canSend) h += '<div class="reqbox"><b>Send a memo to ILO representatives</b><div class="grid"><div class="full"><label>Title</label><input data-mt></div><div class="full"><label>Message</label><textarea data-mx rows="4"></textarea></div></div><div class="actions"><button class="btn" data-msend>Send memo</button></div></div>';
        if (!d.memos.length) h += '<div class="hint">No memos yet.</div>';
        d.memos.forEach(function (m) {
          h += '<div class="reqbox"><b>' + esc(m.title) + '</b><div style="font-size:12px;color:var(--mut)">' + esc(m.by) + " &middot; " + when(m.t) + '</div><div style="white-space:pre-wrap;margin:6px 0">' + esc(m.text) + "</div>";
          if (m.tracker) h += '<div style="margin:6px 0"><b>Responded: ' + m.tracker.responded + " of " + m.tracker.total + ' departments</b>' + (m.tracker.missing.length ? '<div style="font-size:13px;color:var(--ord)">Not yet replied: ' + m.tracker.missing.map(esc).join(", ") + "</div>" : "") + "</div>";
          m.replies.forEach(function (r) { h += '<div style="border-top:1px solid var(--bd);padding:6px 0"><b>' + esc(r.name) + "</b> &middot; " + esc(r.dept) + " &middot; " + when(r.t) + '<div style="white-space:pre-wrap">' + esc(r.text) + "</div>" + (r.file ? '<button class="btn sec" style="min-height:34px;padding:4px 10px;font-size:13px" data-mf="' + esc(r.id) + '">Download ' + esc(r.file) + "</button>" : "") + "</div>"; });
          if (d.canReply) h += '<div style="border-top:1px solid var(--bd);padding-top:8px"><label>Your reply (a sent reply cannot be edited; send a follow-up instead)</label><textarea data-rt="' + esc(m.id) + '" rows="3"></textarea><label>Attach a file (optional, up to 1 MB)</label><input type="file" data-rf="' + esc(m.id) + '"><div class="actions"><button class="btn" data-rs="' + esc(m.id) + '">Send reply</button></div></div>';
          h += "</div>";
        });
        S("mm").innerHTML = h;
        var sb = S("mm").querySelector("[data-msend]");
        if (sb) sb.onclick = async function () { try { await call("POST", "memo/create", { title: S("mm").querySelector("[data-mt]").value, text: S("mm").querySelector("[data-mx]").value }); say("ok", "Memo sent."); loadMemos(); } catch (e) { fail(e); } };
        S("mm").querySelectorAll("[data-rs]").forEach(function (b) {
          b.onclick = async function () {
            var id = b.getAttribute("data-rs"), f = S("mm").querySelector('[data-rf="' + id + '"]').files[0], file = null;
            try {
              if (f) { if (f.size > 1000000) throw new Error("The file is too big. Keep it under 1 MB."); file = { name: f.name, data: await new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = function () { rej(new Error("Could not read the file.")); }; fr.readAsDataURL(f); }) }; }
              await call("POST", "memo/reply", { memoId: id, text: S("mm").querySelector('[data-rt="' + id + '"]').value, file: file }); say("ok", "Reply sent."); loadMemos();
            } catch (e) { fail(e); }
          };
        });
        S("mm").querySelectorAll("[data-mf]").forEach(function (b) {
          b.onclick = async function () { try { var f = await call("GET", "memo/file/" + b.getAttribute("data-mf")); var a = document.createElement("a"); a.href = f.data; a.download = f.name || "attachment"; document.body.appendChild(a); a.click(); a.remove(); } catch (e) { fail(e); } };
        });
      } catch (e) { S("mm").innerHTML = ""; fail(e); }
    }

    /* ---------- attachment dates ---------- */
    var DL = null;
    async function dSearch() {
      var q = Q("[data-dq]").value.trim().toUpperCase(); if (q.replace(/[^A-Z0-9]/g, "").length < 2) return say("err", "Type at least 2 letters.");
      try {
        if (!DL) DL = (await call("POST", "attachment/list", {})).list;
        var f = DL.filter(function (x) { return (x.n + " " + x.a + " " + x.cls).toUpperCase().indexOf(q) >= 0; }).slice(0, 25);
        var h = f.length ? '<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr style="text-align:left;color:var(--mut)"><th style="padding:6px">Student</th><th style="padding:6px">Start</th><th style="padding:6px">End</th></tr></thead><tbody>' : '<div class="hint">No placed students found.</div>';
        f.forEach(function (x, i) { h += '<tr style="border-top:1px solid var(--bd)"><td style="padding:6px"><b>' + esc(x.n) + '</b><br><span style="color:var(--mut);font-size:12px">' + esc(x.a) + " &middot; " + esc(x.cls) + " &middot; " + esc(x.org) + '</span></td><td style="padding:6px"><input type="date" data-sd="' + i + '" value="' + esc(x.sd) + '"></td><td style="padding:6px"><input type="date" data-ed="' + i + '" value="' + esc(x.ed) + '"></td></tr>'; });
        if (f.length) h += '</tbody></table></div><div class="actions"><button class="btn" data-dsv>Save dates</button></div><div class="hint">Enter the dates from the trainer\'s paper feedback.</div>';
        var out = Q("[data-dl]"); out.innerHTML = h; say("", "");
        var sv = out.querySelector("[data-dsv]");
        if (sv) sv.onclick = async function () {
          var rows = f.map(function (x, i) { return { id: x.id, sd: out.querySelector('[data-sd="' + i + '"]').value, ed: out.querySelector('[data-ed="' + i + '"]').value }; });
          try { var r = await call("POST", "attachment/dates", { rows: rows }); DL = r.list; say("ok", "Saved dates for " + r.saved + " students."); } catch (e) { fail(e); }
        };
      } catch (e) { fail(e); }
    }
    var dgo = Q("[data-dgo]"); if (dgo) { dgo.onclick = dSearch; Q("[data-dq]").onkeydown = function (e) { if (e.key === "Enter") dSearch(); }; }

    /* ---------- emergency contacts ---------- */
    async function eSearch() {
      try {
        var d = await call("POST", "emergency/search", { q: Q("[data-eq]").value }), h = d.list.length ? "" : '<div class="hint">No students found.</div>';
        d.list.forEach(function (x) { h += '<div class="reqbox"><b>' + esc(x.n) + "</b> &middot; " + esc(x.a) + " &middot; " + esc(x.cls) + '<div>Student: <a href="tel:' + esc(x.tel) + '">' + esc(x.tel) + '</a></div><div>Next of kin: ' + esc(x.nokName || "not given") + (x.nokRel ? " (" + esc(x.nokRel) + ")" : "") + (x.nokTel ? ' <a href="tel:' + esc(x.nokTel) + '">' + esc(x.nokTel) + "</a>" : "") + '</div><div>Emergency contact: ' + esc(x.emName || "not given") + (x.emTel ? ' <a href="tel:' + esc(x.emTel) + '">' + esc(x.emTel) + "</a>" : "") + "</div></div>"; });
        Q("[data-el]").innerHTML = h; say("", "");
      } catch (e) { fail(e); }
    }
    Q("[data-ego]").onclick = eSearch; Q("[data-eq]").onkeydown = function (e) { if (e.key === "Enter") eSearch(); };

    /* ---------- PIN reset ---------- */
    Q("[data-rgo]").onclick = async function () {
      try { await call("POST", "auth/reset-pin", { adm: Q("[data-ra]").value, pin: Q("[data-rp]").value }); Q("[data-rp]").value = ""; say("ok", "PIN reset. Give the new PIN to the student."); } catch (e) { fail(e); }
    };

    /* ---------- unlock and audit ---------- */
    var ug = Q("[data-ugo]");
    if (ug) ug.onclick = async function () {
      try { await call("POST", "marks/unlock", { a: Q("[data-ua]").value, reason: Q("[data-ur]").value }); Q("[data-ur]").value = ""; say("ok", "Mark unlocked. The ILO Rep can now correct it."); if (o.onChange) o.onChange(); } catch (e) { fail(e); }
    };
    var ucg = Q("[data-ucgo]");
    if (ucg) ucg.onclick = async function () {
      try { await call("POST", "marks/unlockclass", { c: Q("[data-uc]").value, reason: Q("[data-ucr]").value }); Q("[data-ucr]").value = ""; say("ok", "Class unlocked."); if (o.onChange) o.onChange(); } catch (e) { fail(e); }
    };
    var ad = Q("[data-ald]");
    if (ad) ad.onclick = async function () {
      try {
        var d = await call("POST", "marks/audit", {}), h = d.audit.length ? '<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="text-align:left;color:var(--mut)"><th style="padding:5px">When</th><th style="padding:5px">What</th><th style="padding:5px">Who</th></tr></thead><tbody>' : '<div class="hint">Nothing recorded yet.</div>';
        d.audit.forEach(function (x) {
          var what = x.type === "mark" ? esc(x.adm) + ": " + (x.old == null ? "entered " : "changed " + x.old + " to ") + (x.nw == null ? "removed" : x.nw) : x.type === "unlock" ? esc(x.adm) + ": unlocked (was " + x.old + "). Reason: " + esc(x.reason) : x.type === "lock-class" ? "Class " + esc(x.adm) + ": all marks locked (" + x.old + " marks)" : x.type === "unlock-class" ? "Class " + esc(x.adm) + ": unlocked (" + x.old + " marks). Reason: " + esc(x.reason) : x.type === "pin-reset" ? esc(x.adm) + ": PIN reset" : esc(x.type);
          h += '<tr style="border-top:1px solid var(--bd)"><td style="padding:5px;white-space:nowrap">' + when(x.t) + '</td><td style="padding:5px">' + what + '</td><td style="padding:5px">' + esc(x.by) + "</td></tr>";
        });
        Q("[data-al]").innerHTML = h + (d.audit.length ? "</tbody></table></div>" : ""); say("", "");
      } catch (e) { fail(e); }
    };


    /* dropouts */
    async function loadDrop() {
      var el = Q('[data-s="dr"]'); if (!el) return;
      try {
        var d = await call("GET", "dropout/list"), h = "";
        if (role === "rep") h += '<div class="hint">A removed student cannot sign in and disappears from the lists. The HOD or Deputy must approve first.</div><div class="grid"><div><label>Admission number</label><input data-da autocapitalize="characters"></div><div><label>Reason</label><input data-dn placeholder="e.g. left the college"></div></div><button class="btn" data-dsend>Send removal request</button>';
        h += d.list.length ? "" : '<div class="hint" style="margin-top:8px">No requests yet.</div>';
        d.list.forEach(function (x) {
          h += '<div class="card2" style="margin-top:8px"><b>' + esc(x.name) + "</b> (" + esc(x.adm) + ") " + esc(x.cls) + '<div class="mut">' + esc(x.dept) + " - " + esc(x.reason) + " - by " + esc(x.by) + ", " + when(x.t) + '</div><div><b>' + esc(x.status) + "</b>" + (x.decidedBy ? " by " + esc(x.decidedBy) + (x.note ? ": " + esc(x.note) : "") : "") + "</div>" +
            (d.canDecide && x.status === "pending" ? '<button class="btn" data-dok="' + esc(x.id) + '">Approve removal</button> <button class="btn" data-dno="' + esc(x.id) + '">Reject</button>' : "") + "</div>";
        });
        el.innerHTML = h;
      } catch (e) { fail(e); }
    }
    async function decide(id, ok) {
      var note = prompt(ok ? "Approve removal. Add a note (optional):" : "Reject. Say why:", ""); if (note === null) return;
      try { await call("POST", "dropout/decide", { id: id, approve: ok, note: note }); say("ok", ok ? "Student removed." : "Request rejected."); loadDrop(); } catch (e) { fail(e); }
    }
    box.addEventListener("click", async function (ev) {
      var t = ev.target; if (!t.getAttribute) return;
      if (t.hasAttribute("data-dsend")) { try { await call("POST", "dropout/request", { adm: Q("[data-da]").value, reason: Q("[data-dn]").value }); say("ok", "Request sent to the HOD / Deputy."); loadDrop(); } catch (e) { fail(e); } }
      else if (t.getAttribute("data-dok")) decide(t.getAttribute("data-dok"), true);
      else if (t.getAttribute("data-dno")) decide(t.getAttribute("data-dno"), false);
    });
    function all() { if (has("pg")) loadPg(); if (has("mm")) loadMemos(); if (has("dr")) loadDrop(); }
    all();
    return { reload: all };
  }
  window.RVV2 = { mount: mount };
})();
