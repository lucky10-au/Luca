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
})();
