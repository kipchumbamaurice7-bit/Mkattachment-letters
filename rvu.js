/* RVNP shared helpers: one copy of the small tools the staff pages all need (escaping, API calls, drop-downs, downloads, regions). */
(function () {
  "use strict";
  var U = {};

  U.esc = function (v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  U.$ = function (root, sel) { return root.querySelector(sel); };
  U.key = function (v) { return String(v == null ? "" : v).toUpperCase().replace(/[^A-Z0-9]/g, ""); };
  U.digits = function (v) { return String(v || "").replace(/\D/g, ""); };
  U.plural = function (n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); };
  U.tel = function (v) { if (!v) return ""; var h = String(v).replace(/[^\d+]/g, ""); if (h.charAt(0) !== "+") h = h.indexOf("254") === 0 ? "+" + h : h.charAt(0) === "0" ? "+254" + h.slice(1) : "+254" + h; return '<a class="tel" href="tel:' + U.esc(h) + '" style="text-decoration:underline">' + U.esc(v) + "</a>"; };
  U.debounce = function (fn, ms) { var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms || 160); }; };

  /* API caller: api(method, path, body) */
  U.api = function (headers, onAuthFail) {
    return async function (method, path, body) {
      var r = await fetch("/api/" + path, { method: method, headers: Object.assign({ "Content-Type": "application/json" }, headers()), body: body ? JSON.stringify(body) : undefined });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) { if (r.status === 401 && onAuthFail) onAuthFail(); var e = new Error(d.error || "Something went wrong."); e.status = r.status; throw e; }
      return d;
    };
  };

  /* fill a drop-down. items: [{v, t, n}] (value, text, count). Keeps the old choice when it is still on the list. */
  U.fill = function (sel, items, allLabel, opts) {
    opts = opts || {};
    var keep = sel.value;
    sel.innerHTML = (allLabel == null ? "" : '<option value="">' + U.esc(allLabel) + "</option>") + items.map(function (i) {
      return '<option value="' + U.esc(i.v) + '">' + U.esc(i.t) + (i.n != null ? " (" + i.n + ")" : "") + "</option>";
    }).join("");
    var ok = items.some(function (i) { return i.v === keep; });
    sel.value = ok ? keep : (opts.first && items.length ? items[0].v : "");
    sel.disabled = !items.length && !opts.alwaysOn;
    return sel.value;
  };

  /* group rows by a key and return [{v, t, n}] sorted by text */
  U.tally = function (rows, getV, getT) {
    var m = {}, out = [];
    rows.forEach(function (r) { var v = getV(r); if (!v) return; if (!m[v]) { m[v] = { v: v, t: getT ? getT(r) : v, n: 0 }; out.push(m[v]); } m[v].n++; });
    return out.sort(function (a, b) { return a.t.localeCompare(b.t); });
  };

  /* Kenya: the eight regions (the former provinces) and their counties */
  var REG = {
    "Nairobi": ["Nairobi"],
    "Central": ["Kiambu", "Kirinyaga", "Murang\u2019a", "Nyandarua", "Nyeri"],
    "Coast": ["Kilifi", "Kwale", "Lamu", "Mombasa", "Taita-Taveta", "Tana River"],
    "Eastern": ["Embu", "Isiolo", "Kitui", "Machakos", "Makueni", "Marsabit", "Meru", "Tharaka-Nithi"],
    "North Eastern": ["Garissa", "Mandera", "Wajir"],
    "Nyanza": ["Homa Bay", "Kisii", "Kisumu", "Migori", "Nyamira", "Siaya"],
    "Rift Valley": ["Baringo", "Bomet", "Elgeyo-Marakwet", "Kajiado", "Kericho", "Laikipia", "Nakuru", "Nandi", "Narok", "Samburu", "Trans Nzoia", "Turkana", "Uasin Gishu", "West Pokot"],
    "Western": ["Bungoma", "Busia", "Kakamega", "Vihiga"]
  }, R2 = {};
  Object.keys(REG).forEach(function (r) { REG[r].forEach(function (c) { R2[U.key(c)] = r; }); });
  U.regionOf = function (county) { return R2[U.key(county)] || ""; };

  /* downloads */
  function save(blob, name) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function csvLine(r) { return r.map(function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }).join(","); }
  U.csv = function (name, head, rows) { save(new Blob(["\ufeff" + [csvLine(head)].concat(rows.map(csvLine)).join("\n")], { type: "text/csv" }), name + ".csv"); };
  /* sheets: [{name, head, rows, widths}]. Falls back to CSV of the biggest sheet when the Excel tool did not load. Returns "xlsx" or "csv". */
  U.xlsx = function (name, sheets) {
    if (!window.XLSX) {
      var b = sheets.slice().sort(function (x, y) { return y.rows.length - x.rows.length; })[0];
      U.csv(name, b.head, b.rows); return "csv";
    }
    var wb = XLSX.utils.book_new(), used = {};
    sheets.forEach(function (sh) {
      var nm = String(sh.name).replace(/[\\\/\?\*\[\]:]/g, "-").slice(0, 28) || "Sheet", k = nm, i = 2;
      while (used[k.toLowerCase()]) k = nm.slice(0, 26) + "-" + i++;
      used[k.toLowerCase()] = 1;
      var ws = XLSX.utils.aoa_to_sheet([sh.head].concat(sh.rows));
      ws["!cols"] = (sh.widths || sh.head.map(function () { return 20; })).map(function (w) { return { wch: w }; });
      XLSX.utils.book_append_sheet(wb, ws, k);
    });
    XLSX.writeFile(wb, name + ".xlsx"); return "xlsx";
  };

  U.say = function (el, cls, text) { if (!el) return; el.className = "msg" + (cls ? " " + cls : ""); el.textContent = text || ""; };

  window.RVU = U;
})();
