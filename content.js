/* Content loader: every visible string on this site lives in content.json.
   Edit the JSON, refresh, done. The HTML text is fallback-only (no-JS). */
(function () {
  var base = location.pathname.indexOf("/posts/") !== -1 ? "../" : "";
  function flat(o, p, out) {
    out = out || {};
    for (var k in o) {
      var v = o[k], key = p ? p + "." + k : k;
      if (v && typeof v === "object") flat(v, key, out);
      else out[key] = v;
    }
    return out;
  }
  fetch(base + "content.json").then(function (r) { return r.json(); }).then(function (j) {
    var m = flat(j);
    document.querySelectorAll("[data-content]").forEach(function (el) {
      var v = m[el.getAttribute("data-content")];
      if (v === undefined) return;
      if (el.tagName === "META") el.setAttribute("content", v);
      else if (el.tagName === "TITLE") document.title = v;
      else el.innerHTML = v;
    });
  }).catch(function () { /* fallback text stays */ });

  /* Deep-link highlight: page.html#hl=some.key scrolls that string into
     view and flashes it. Used by the admin panel's key links. */
  window.addEventListener("load", function () {
    setTimeout(function () {
      var m = location.hash.match(/hl=([^&]+)/);
      if (!m) return;
      var key = decodeURIComponent(m[1]);
      if (/["\\]/.test(key)) return;
      var el = document.querySelector('[data-content="' + key + '"]');
      if (!el || el.tagName === "TITLE" || el.tagName === "META") {
        el = document.querySelector("article h1, .page-head h1, .hero h1");
      }
      if (!el) return;
      var st = document.createElement("style");
      st.textContent = ".hl-flash{outline:3px solid #000 !important;outline-offset:5px;}";
      document.head.appendChild(st);
      try { el.scrollIntoView({ block: "center" }); } catch (e) {}
      el.classList.add("hl-flash");
      setTimeout(function () {
        el.classList.remove("hl-flash");
        if (st.parentNode) st.parentNode.removeChild(st);
      }, 2800);
    }, 150);
  });
})();
