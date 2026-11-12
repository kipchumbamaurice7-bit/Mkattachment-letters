/* RVNP account separation. Every portal page asks this file for its sign-in and receives it only when the
   account type matches the page: students on student pages, ILO reps on the ILO page, HOD and Deputy on
   their own pages, Admin on the admin page. A sign-in of any other type is refused and never reused. */
(function () {
  "use strict";
  function info(t) { try { return JSON.parse(atob(String(t).split(".")[0].replace(/-/g, "+").replace(/_/g, "/"))); } catch (e) { return {}; } }
  function ok(t, roles) { var p = info(t); return !!t && p.typ === "user" && roles.indexOf(p.role) >= 0 && (!p.exp || p.exp > Date.now()); }
  function get(s, k) { try { return s.getItem(k) || ""; } catch (e) { return ""; } }
  window.RVGuard = {
    info: info,
    /* the token for this audience, or "" (staff tabs use the session; the student device login uses local storage) */
    token: function (roles) {
      var cand = roles.indexOf("student") >= 0 ? [get(sessionStorage, "rvnp_user"), get(localStorage, "rvnp_student")] : [get(sessionStorage, "rvnp_user")];
      for (var i = 0; i < cand.length; i++) if (ok(cand[i], roles)) return cand[i];
      return "";
    },
    admin: function () { return get(sessionStorage, "rvnp_admin"); }
  };
})();
