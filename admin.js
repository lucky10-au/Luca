/* Site admin: edits content.json, publishes projects + posts straight to
   GitHub via the Contents API. Token lives in this browser only. */
(function () {
"use strict";
var OWNER = "lucky10-au", REPO = "Luca", BRANCH = "main";
var API = "https://api.github.com/repos/" + OWNER + "/" + REPO + "/contents/";
var RAW = "https://raw.githubusercontent.com/" + OWNER + "/" + REPO + "/" + BRANCH + "/";
var CAROUSEL_END = "      <!-- ADMIN:CAROUSEL-END -->";
var GRID_END = "      <!-- ADMIN:GRID-END -->";
var WRITING_END = "    <!-- ADMIN:WRITING-END -->";

function $(id) { return document.getElementById(id); }
function log(m) { $("log").textContent += m + "\n"; }
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;")
          .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function b64e(s) { return btoa(unescape(encodeURIComponent(s))); }
function b64d(b) {
  b = b.replace(/\s/g, "");
  return decodeURIComponent(Array.prototype.map.call(atob(b), function (c) {
    return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(""));
}
function flat(o, p, out) {
  out = out || {};
  for (var k in o) {
    var v = o[k], key = p ? p + "." + k : k;
    if (v && typeof v === "object") flat(v, key, out);
    else out[key] = v;
  }
  return out;
}
function mergeInto(orig, m) {
  // Write every edited leaf back into a deep clone, preserving the file's
  // key order so saves produce minimal diffs.
  var o = JSON.parse(JSON.stringify(orig));
  Object.keys(m).forEach(function (path) {
    var parts = path.split("."), cur = o;
    for (var i = 0; i < parts.length - 1; i++) {
      var p = (cur instanceof Array) ? +parts[i] : parts[i];
      cur = cur[p];
    }
    var last = parts[parts.length - 1];
    cur[(cur instanceof Array) ? +last : last] = m[path];
  });
  return o;
}
function token() { return localStorage.getItem("blog-admin-token") || ""; }
async function api(method, path, body) {
  var opt = { method: method,
    headers: { "Accept": "application/vnd.github+json",
               "Authorization": "Bearer " + token() } };
  if (body !== undefined) opt.body = JSON.stringify(body);
  var r = await fetch(API + path, opt);
  if (!r.ok) {
    var t = await r.text();
    var e = new Error(method + " " + path + " -> " + r.status + " " + t.slice(0, 160));
    e.status = r.status;
    throw e;
  }
  return r.json();
}
async function getFile(path) {
  var j = await api("GET", path + "?ref=" + BRANCH);
  return { sha: j.sha, text: b64d(j.content || "") };
}
async function putFile(path, text, sha, message) {
  var body = { message: message, content: b64e(text), branch: BRANCH };
  if (sha) body.sha = sha; // new files (images, posts) are created without a sha
  await api("PUT", path, body);
  log("saved " + path);
}
function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled";
}
async function readUpload(input) {
  if (!input.files || !input.files[0]) return null;
  var f = input.files[0];
  if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(f.name)) throw new Error("image must be png/jpg/gif/webp/svg");
  var name = f.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
  var dataUrl = await new Promise(function (res, rej) {
    var r = new FileReader();
    r.onload = function () { res(r.result); };
    r.onerror = rej;
    r.readAsDataURL(f);
  });
  return { name: name, b64: dataUrl.split(",", 2)[1] };
}
function postPage(o) {
  // o: {slug,title,meta,img,paras[],tabTitle}
  var body = o.paras.map(function (p, i) {
    return "    <p data-content=\"posts." + o.slug + ".body" + (i + 1) + "\">" + esc(p) + "</p>";
  }).join("\n");
  return "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n" +
    "<title data-content=\"tabs." + o.slug + "\">" + esc(o.title) + " — Luca</title>\n" +
    "<meta name=\"description\" content=\"" + esc(o.title) + " by Luca.\">\n" +
    "<link rel=\"icon\" href=\"data:,\">\n" +
    "<link rel=\"stylesheet\" href=\"../style.css?v=12\">\n</head>\n<body>\n<main>\n" +
    "  <header class=\"site-head\">\n    <a class=\"brand\" href=\"../\" data-content=\"site.brand\">Luca</a>\n" +
    "    <nav>\n      <a href=\"../projects.html\" data-content=\"site.nav.work\">Work</a>\n" +
    "      <a href=\"../about.html\" data-content=\"site.nav.about\">About</a>\n" +
    "      <a href=\"../writing.html\" data-content=\"site.nav.writing\">Writing</a>\n    </nav>\n  </header>\n" +
    "  <article>\n    <img class=\"hero-img\" src=\"../img/" + o.img + "\" alt=\"\">\n" +
    "    <h1 data-content=\"posts." + o.slug + ".title\">" + esc(o.title) + "</h1>\n" +
    "    <time data-content=\"posts." + o.slug + ".meta\">" + esc(o.meta) + "</time>\n" + body + "\n" +
    "  </article>\n</main>\n<script src=\"../content.js\" defer><\/script>\n</body>\n</html>\n";
}
function carouselFigure(o, i) {
  return "      <figure>\n" +
    "        <a href=\"posts/" + o.slug + ".html\"><img src=\"img/" + o.img + "\" alt=\"" + esc(o.name) + "\" loading=\"lazy\"></a>\n" +
    "        <figcaption><span class=\"name\" data-content=\"projects.items." + i + ".name\">" + esc(o.name) +
    "</span><span class=\"desc\" data-content=\"projects.items." + i + ".meta\">" + esc(o.meta) + "</span></figcaption>\n" +
    "      </figure>";
}
function gridTile(o, i) {
  return "      <figure><a href=\"posts/" + o.slug + ".html\"><img src=\"img/" + o.img + "\" alt=\"" + esc(o.name) +
    "\" loading=\"lazy\"></a><figcaption><span class=\"name\" data-content=\"projects.items." + i + ".name\">" + esc(o.name) +
    "</span><span class=\"desc\" data-content=\"projects.items." + i + ".meta\">" + esc(o.meta) + "</span></figcaption></figure>";
}
function writingRow(o) {
  return "    <a class=\"row\" href=\"posts/" + o.slug + ".html\"><span class=\"name\">" + esc(o.title) +
    "</span><span class=\"desc\">" + esc(o.meta) + "</span><span class=\"go\">&rarr;</span></a>";
}
function needToken() {
  if (!token()) { log("no token saved — add one above first"); return false; }
  return true;
}

// ---- auth UI ----
function refreshAuth() {
  var has = !!token();
  $("token-status").textContent = has ? "token saved in this browser" : "no token";
  ["save-text", "save-project", "save-post"].forEach(function (id) { $(id).disabled = !has; });
}
$("token-save").onclick = function () {
  var v = $("token").value.trim();
  if (!v) return;
  localStorage.setItem("blog-admin-token", v);
  $("token").value = "";
  refreshAuth();
  log("token saved");
};
$("token-clear").onclick = function () {
  localStorage.removeItem("blog-admin-token");
  refreshAuth();
  log("token forgotten");
};

// ---- text tab ----
var contentCache = null;
async function loadText() {
  var r = await fetch(RAW + "content.json");
  if (!r.ok) throw new Error("could not load content.json: " + r.status);
  contentCache = await r.json();
  var m = flat(contentCache), box = $("fields");
  box.textContent = "";
  Object.keys(m).sort().forEach(function (k) {
    var lab = document.createElement("label");
    lab.textContent = k;
    lab.setAttribute("for", "f-" + k);
    var inp = (String(m[k]).length > 100 || String(m[k]).indexOf("\n") !== -1)
      ? document.createElement("textarea") : document.createElement("input");
    if (inp.tagName === "INPUT") inp.type = "text";
    inp.id = "f-" + k;
    inp.value = m[k];
    box.appendChild(lab);
    box.appendChild(inp);
  });
  log("loaded " + Object.keys(m).length + " strings");
}
$("save-text").onclick = async function () {
  if (!needToken()) return;
  try {
    var m = {};
    $("fields").querySelectorAll("input,textarea").forEach(function (el) {
      m[el.id.slice(2)] = el.value;
    });
    var cur = await getFile("content.json");
    await putFile("content.json",
      JSON.stringify(mergeInto(JSON.parse(cur.text), m), null, 2) + "\n",
      cur.sha, "Update site text via admin");
    log("text saved — live in a minute or two");
  } catch (e) { log("ERROR: " + e.message); }
};

// ---- images select ----
async function loadImages() {
  var names = ["about-hero.svg", "post-hero.svg", "project-1.svg",
    "project-2.svg", "project-3.svg", "project-4.svg", "project-5.svg",
    "project-6.svg", "project-7.svg"];
  try {
    var j = await api("GET", "img?ref=" + BRANCH);
    var live = j.filter(function (f) { return f.type === "file"; }).map(function (f) { return f.name; });
    if (live.length) names = live;
  } catch (e) { log("image list: using built-in set (" + e.message.slice(0, 60) + ")"); }
  ["p-img", "w-hero"].forEach(function (id) {
    var sel = $(id);
    sel.textContent = "";
    names.forEach(function (n) {
      var o = document.createElement("option");
      o.value = n; o.textContent = n;
      sel.appendChild(o);
    });
  });
}

// ---- new project ----
$("save-project").onclick = async function () {
  if (!needToken()) return;
  try {
    var name = $("p-name").value.trim(), meta = $("p-meta").value.trim();
    if (!name || !meta) throw new Error("name and meta are required");
    var slug = slugify(name);
    var up = await readUpload($("p-upload"));
    var img = up ? up.name : $("p-img").value;
    var paras = [$("p-body1").value.trim(), $("p-body2").value.trim()].filter(Boolean);
    if (!paras.length) throw new Error("at least one paragraph is required");
    // slug must be free (post file + content.json entry)
    try { await api("GET", "posts/" + slug + ".html?ref=" + BRANCH); throw new Error("slug posts/" + slug + ".html already exists"); }
    catch (e) { if (e.status !== 404) throw e; }
    if (up) {
      await putFile("img/" + img, up.b64, null, "Add image " + img + " via admin");
    }
    var cj = await getFile("content.json");
    var j = JSON.parse(cj.text);
    if (j.posts[slug]) throw new Error("content.json already has posts." + slug);
    var idx = j.projects.items.length;
    j.projects.items.push({ name: name, meta: meta });
    var entry = { title: name, meta: meta };
    paras.forEach(function (p, i) { entry["body" + (i + 1)] = p; });
    j.posts[slug] = entry;
    j.tabs[slug] = name + " — Luca";
    var o = { slug: slug, img: img, name: name, meta: meta,
              title: name, paras: paras };
    await putFile("posts/" + slug + ".html", postPage(o), null,
      "Add project page " + slug + " via admin");
    await putFile("content.json", JSON.stringify(j, null, 2) + "\n",
      cj.sha, "Add project " + slug + " via admin");
    var ix = await getFile("index.html");
    if (ix.text.indexOf(CAROUSEL_END) === -1) throw new Error("carousel marker missing in index.html");
    await putFile("index.html",
      ix.text.replace(CAROUSEL_END, carouselFigure(o, idx) + "\n" + CAROUSEL_END),
      ix.sha, "Add project " + slug + " to carousel via admin");
    var px = await getFile("projects.html");
    if (px.text.indexOf(GRID_END) === -1) throw new Error("grid marker missing in projects.html");
    await putFile("projects.html",
      px.text.replace(GRID_END, gridTile(o, idx) + "\n" + GRID_END),
      px.sha, "Add project " + slug + " to grid via admin");
    log("project published: posts/" + slug + ".html");
  } catch (e) { log("ERROR: " + e.message); }
};

// ---- new post ----
$("save-post").onclick = async function () {
  if (!needToken()) return;
  try {
    var title = $("w-title").value.trim(), meta = $("w-meta").value.trim();
    if (!title || !meta) throw new Error("title and meta are required");
    var slug = slugify(title);
    var up = await readUpload($("w-upload"));
    var img = up ? up.name : $("w-hero").value;
    var paras = $("w-body").value.split(/\n\s*\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!paras.length) throw new Error("at least one paragraph is required");
    try { await api("GET", "posts/" + slug + ".html?ref=" + BRANCH); throw new Error("slug posts/" + slug + ".html already exists"); }
    catch (e) { if (e.status !== 404) throw e; }
    if (up) {
      await putFile("img/" + img, up.b64, null, "Add image " + img + " via admin");
    }
    var cj = await getFile("content.json");
    var j = JSON.parse(cj.text);
    if (j.posts[slug]) throw new Error("content.json already has posts." + slug);
    var entry = { title: title, meta: meta };
    paras.forEach(function (p, i) { entry["body" + (i + 1)] = p; });
    j.posts[slug] = entry;
    j.tabs[slug] = title + " — Luca";
    var o = { slug: slug, img: img, title: title, meta: meta, paras: paras };
    await putFile("posts/" + slug + ".html", postPage(o), null,
      "Add post " + slug + " via admin");
    await putFile("content.json", JSON.stringify(j, null, 2) + "\n",
      cj.sha, "Add post " + slug + " via admin");
    var ix = await getFile("index.html");
    if (ix.text.indexOf(WRITING_END) === -1) throw new Error("writing marker missing in index.html");
    await putFile("index.html",
      ix.text.replace(WRITING_END, writingRow(o) + "\n" + WRITING_END),
      ix.sha, "Add post " + slug + " to writing list via admin");
    log("post published: posts/" + slug + ".html");
  } catch (e) { log("ERROR: " + e.message); }
};

refreshAuth();
loadImages().catch(function (e) { log("ERROR: " + e.message); });
loadText().catch(function (e) {
  $("fields").innerHTML = "<p>Could not load content.json: " + esc(e.message) + "</p>";
});
})();
