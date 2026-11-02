/* RVNP portal service worker: lets the portal install as an app and open quickly.
   Pages are always fetched fresh when online, and kept for when the connection drops.
   Data (/api) is never stored. Bump VERSION when you change this file. */
var VERSION = "rvnp-v12";
var SHELL = ["/", "/index.html", "/student.html", "/placement.html", "/register.html", "/auth.html", "/ilo.html", "/hod.html", "/marks.js", "/manifest-ilo.webmanifest", "/manifest-hod.webmanifest", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest"];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL).catch(function () {}); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin || u.pathname.indexOf("/api/") === 0 || u.pathname.indexOf("/.netlify/") === 0) return;
  if (r.mode === "navigate" || /\.html$/.test(u.pathname)) {
    e.respondWith(fetch(r).then(function (res) { var cp = res.clone(); caches.open(VERSION).then(function (c) { c.put(r, cp); }); return res; })
      .catch(function () { return caches.match(r).then(function (m) { return m || caches.match("/index.html"); }); }));
    return;
  }
  e.respondWith(caches.match(r).then(function (m) {
    var net = fetch(r).then(function (res) { if (res.ok) { var cp = res.clone(); caches.open(VERSION).then(function (c) { c.put(r, cp); }); } return res; }).catch(function () { return m; });
    return m || net;
  }));
});
