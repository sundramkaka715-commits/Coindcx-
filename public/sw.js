const CACHE="coindcx-scanner-v7";
self.addEventListener("install",e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(["/","/index.html","/style.css","/app.js?v=7","/manifest.json"])));
});
self.addEventListener("activate",e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});
self.addEventListener("fetch",e=>{
  if(e.request.method==="GET") e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
});
