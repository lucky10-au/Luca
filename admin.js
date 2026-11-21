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
function log(m) {
  var el = $("log");
  el.textContent += m + "\n";
  el.scrollTop = el.scrollHeight;
}
// Toast: errors used to be written to #log only, which sits below the fold,
// so a failed save looked like nothing happened.
var statusTimer = null;
function status(msg, kind) {
  var el = $("status");
  if (!el) return;
  clearTimeout(statusTimer);
  el.textContent = msg || "";
  el.className = kind || "";
  el.hidden = !msg;
  if (msg) statusTimer = setTimeout(function () { el.hidden = true; }, 9000);
}
function busy(btn, on, label) {
  if (!btn) return;
  if (on) {
    btn.setAttribute("data-label", btn.textContent);
    btn.textContent = label || "Working…";
    btn.disabled = true;
  } else {
    btn.textContent = btn.getAttribute("data-label") || btn.textContent;
    btn.disabled = false;
  }
}
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
function setPath(o, path, v) {
  // Walk/create every segment. The old version threw a TypeError when a key
  // had been removed on GitHub since the form was built, which aborted the
  // whole save with an unhelpful message.
  var parts = path.split("."), cur = o;
  for (var i = 0; i < parts.length - 1; i++) {
    var p = (cur instanceof Array) ? +parts[i] : parts[i];
    var next = parts[i + 1];
    if (cur[p] === null || typeof cur[p] !== "object") {
      cur[p] = /^\d+$/.test(next) ? [] : {};
    }
    cur = cur[p];
  }
  var last = parts[parts.length - 1];
  cur[(cur instanceof Array) ? +last : last] = v;
}
function mergeInto(orig, m) {
  // Write only the edited leaves into a deep clone, preserving the file's
  // key order so saves produce minimal diffs. Untouched keys keep whatever
  // is in the freshly fetched file.
  var o = JSON.parse(JSON.stringify(orig));
  Object.keys(m).forEach(function (path) { setPath(o, path, m[path]); });
  return o;
}
function token() { return localStorage.getItem("blog-admin-token") || ""; }
async function api(method, path, body) {
  var opt = { method: method,
    headers: { "Accept": "application/vnd.github+json",
               "Authorization": "Bearer " + token() } };
  if (body !== undefined) {
    opt.headers["Content-Type"] = "application/json";
    opt.body = JSON.stringify(body);
  }
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
  var res = await api("PUT", path, body);
  log("saved " + path + (res && res.commit ? " · " + res.commit.sha.slice(0, 7) : ""));
  return res;
}
function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled";
}
// Which page holds a content key? tab slugs map to their pages,
// projects.* to the grid page, everything else to its section page.
function pageFor(key) {
  var m = key.match(/^posts\.([^.]+)/);
  if (m) return "posts/" + m[1] + ".html";
  if (key.indexOf("projects.") === 0) return "projects.html";
  if (key.indexOf("home.") === 0 || key.indexOf("site.") === 0) return "index.html";
  if (key.indexOf("about.") === 0) return "about.html";
  if (key.indexOf("writing.") === 0) return "writing.html";
  m = key.match(/^tabs\.(.+)$/);
  if (m) {
    if (m[1] === "home") return "index.html";
    if (m[1] === "projects" || m[1] === "writing" || m[1] === "about") return m[1] + ".html";
    return "posts/" + m[1] + ".html";
  }
  return "index.html";
}
async function readUpload(input) {
  if (!input.files || !input.files[0]) return null;
  var f = input.files[0];
  if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(f.name)) throw new Error("image must be png/jpg/gif/webp/svg");
  if (f.size > 8 * 1024 * 1024) throw new Error("image is larger than 8 MB — resize it first");
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
    "  </article>\n</main>\n<script src=\"../content.js?v=13\" defer><\/script>\n</body>\n</html>\n";
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

// ---- auth: panel stays hidden until a token verifies against GitHub ----
var lockTimer = null;
function setLocked(locked, msg) {
  ["text", "project", "post"].forEach(function (id) { $(id).hidden = locked; });
  ["save-text", "save-project", "save-post"].forEach(function (id) { $(id).disabled = locked; });
  if (msg) log(msg);
}
function disarmLock() { if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; } }
function armLock() {
  disarmLock();
  lockTimer = setTimeout(function () {
    localStorage.removeItem("blog-admin-token");
    setLocked(true);
    $("token-status").textContent = "locked after 15 idle minutes — enter the token again";
    log("auto-locked after 15 idle minutes");
  }, 15 * 60 * 1000);
}
["click", "keydown"].forEach(function (ev) {
  document.addEventListener(ev, function () { if (token()) armLock(); },
    { capture: true, passive: true });
});
async function verify() {
  if (!token()) {
    setLocked(true);
    $("token-status").textContent = "no token";
    return false;
  }
  try {
    // /rate_limit accepts any well-formed token, including ones that cannot
    // write to this repo — that is how a read-only token "verified" and then
    // failed every save. Check the repo's own permissions instead.
    var r = await fetch("https://api.github.com/repos/" + OWNER + "/" + REPO,
      { headers: { "Authorization": "Bearer " + token(),
                   "Accept": "application/vnd.github+json" } });
    if (r.status === 401) {
      localStorage.removeItem("blog-admin-token");
      throw new Error("GitHub rejected the token — it has been forgotten, paste a valid one");
    }
    if (!r.ok) throw new Error("GitHub answered HTTP " + r.status + " for " + OWNER + "/" + REPO);
    var j = await r.json();
    var canWrite = !!(j.permissions && j.permissions.push);
    if (!canWrite) {
      setLocked(true);
      $("token-status").textContent = "token verified but cannot write to " + OWNER + "/" + REPO;
      log("ERROR: this token is read-only for this repo — it needs Contents read & write");
      return false;
    }
    setLocked(false);
    $("token-status").textContent = "token verified — read & write unlocked";
    armLock();
    return true;
  } catch (e) {
    setLocked(true);
    $("token-status").textContent = e.message;
    log("ERROR: " + e.message);
    return false;
  }
}
$("token-save").onclick = async function () {
  var v = $("token").value.trim();
  if (!v) return;
  localStorage.setItem("blog-admin-token", v);
  $("token").value = "";
  await verify();
};
$("token-clear").onclick = function () {
  localStorage.removeItem("blog-admin-token");
  disarmLock();
  setLocked(true);
  $("token-status").textContent = "no token";
  log("token forgotten");
};

// ---- text tab ----
var contentCache = null;     // parsed content.json as loaded
var contentSnapshot = null;  // flat map the form was built from

async function readContent() {
  // Read through the Contents API first. raw.githubusercontent.com is
  // CDN-cached for five minutes (cache-control: max-age=300), so the form
  // could be built from an older file than the one the save merged into —
  // every untouched field then reverted whatever had landed in between.
  try {
    var f = await getFile("content.json");
    return { sha: f.sha, text: f.text };
  } catch (e) {
    var r = await fetch(RAW + "content.json?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error("could not load content.json (HTTP " + r.status + ")");
    return { sha: null, text: await r.text() };
  }
}
function renderText(json) {
  contentCache = json;
  var m = flat(json), box = $("fields");
  contentSnapshot = Object.assign({}, m);
  box.textContent = "";
  Object.keys(m).sort().forEach(function (k) {
    var lab = document.createElement("label");
    var a = document.createElement("a");
    a.href = pageFor(k) + "#hl=" + encodeURIComponent(k);
    a.target = "_blank";
    a.rel = "noopener";
    a.title = "Open this text on the site, highlighted";
    a.textContent = k;
    lab.appendChild(a);
    lab.setAttribute("for", "f-" + k);
    var inp = (String(m[k]).length > 100 || String(m[k]).indexOf("\n") !== -1)
      ? document.createElement("textarea") : document.createElement("input");
    if (inp.tagName === "INPUT") inp.type = "text";
    inp.id = "f-" + k;
    inp.value = m[k];
    box.appendChild(lab);
    box.appendChild(inp);
  });
  return Object.keys(m).length;
}
async function loadText() {
  var f = await readContent();
  log("loaded " + renderText(JSON.parse(f.text)) + " strings");
}
function hasUnsavedText() {
  if (!contentSnapshot) return false;
  var dirty = false;
  $("fields").querySelectorAll("input,textarea").forEach(function (el) {
    if (String(contentSnapshot[el.id.slice(2)]) !== el.value) dirty = true;
  });
  return dirty;
}
window.addEventListener("beforeunload", function (e) {
  if (hasUnsavedText()) { e.preventDefault(); e.returnValue = ""; }
});

$("save-text").onclick = async function () {
  if (!needToken()) return;
  var btn = this;
  if (btn.disabled) return;
  busy(btn, true, "Saving…");
  status("");
  try {
    if (!contentSnapshot) throw new Error("the text form did not load — press ⌘R and try again");
    var changed = {};
    $("fields").querySelectorAll("input,textarea").forEach(function (el) {
      var k = el.id.slice(2);
      if (String(contentSnapshot[k]) === el.value) return; // untouched
      changed[k] = el.value;
    });
    if (!Object.keys(changed).length) {
      status("No changes to save.");
      return;
    }
    var cur = await getFile("content.json");
    var live = JSON.parse(cur.text), liveFlat = flat(live);
    var conflict = Object.keys(changed).filter(function (k) {
      return k in contentSnapshot && k in liveFlat &&
             String(liveFlat[k]) !== String(contentSnapshot[k]);
    });
    if (conflict.length && !confirm(
        "These fields changed on GitHub since this page loaded:\n\n" +
        conflict.slice(0, 10).join("\n") +
        (conflict.length > 10 ? "\n…and " + (conflict.length - 10) + " more" : "") +
        "\n\nOverwrite them with the values in this form?")) {
      status("Save cancelled — reload the page to pick up the newer text.", "err");
      return;
    }
    var merged = mergeInto(live, changed);
    var res = await putFile("content.json",
      JSON.stringify(merged, null, 2) + "\n", cur.sha, "Update site text via admin");
    // Re-render from what was actually written so the form, the snapshot and
    // the repo agree. Otherwise untouched inputs keep the pre-save text and
    // the next save would write that stale text back.
    renderText(merged);
    status("Saved " + Object.keys(changed).length + " field(s) — GitHub Pages rebuilds in about a minute.", "ok");
    log("text saved" + (res && res.commit ? " · " + res.commit.html_url : ""));
  } catch (e) {
    status(e.message, "err");
    log("ERROR: " + e.message);
  } finally {
    busy(btn, false);
  }
};

// ---- images select ----
var imageNames = [];
function fillImageSelects() {
  ["p-img", "w-hero"].forEach(function (id) {
    var sel = $(id), keep = sel.value;
    sel.textContent = "";
    imageNames.forEach(function (n) {
      var o = document.createElement("option");
      o.value = n; o.textContent = n;
      sel.appendChild(o);
    });
    if (imageNames.indexOf(keep) !== -1) sel.value = keep;
  });
}
async function loadImages() {
  var names = ["about-hero.svg", "post-hero.svg", "project-1.svg",
    "project-2.svg", "project-3.svg", "project-4.svg", "project-5.svg",
    "project-6.svg", "project-7.svg"];
  try {
    var j = await api("GET", "img?ref=" + BRANCH);
    var live = j.filter(function (f) { return f.type === "file"; }).map(function (f) { return f.name; });
    if (live.length) names = live;
  } catch (e) { log("image list: using built-in set (" + e.message.slice(0, 60) + ")"); }
  imageNames = names;
  fillImageSelects();
}
// Uploading a second file called photo.png used to PUT an existing path with
// no sha, which GitHub rejects with 422. Pick a free name instead.
async function freeImageName(name) {
  var dot = name.lastIndexOf("."), base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : "";
  var candidate = name, n = 2;
  for (;;) {
    try {
      await api("GET", "img/" + encodeURIComponent(candidate) + "?ref=" + BRANCH);
      candidate = base + "-" + (n++) + ext; // exists -> try the next suffix
    } catch (e) {
      if (e.status === 404) return candidate;
      throw e;
    }
  }
}

// ---- new project ----
$("save-project").onclick = async function () {
  if (!needToken()) return;
  var btn = this;
  if (btn.disabled) return;
  busy(btn, true, "Publishing…");
  status("");
  try {
    var name = $("p-name").value.trim(), meta = $("p-meta").value.trim();
    if (!name || !meta) throw new Error("name and meta are required");
    var slug = slugify(name);
    var paras = [$("p-body1").value.trim(), $("p-body2").value.trim()].filter(Boolean);
    if (!paras.length) throw new Error("at least one paragraph is required");
    var up = await readUpload($("p-upload"));
    var img = up ? await freeImageName(up.name) : $("p-img").value;
    if (!img) throw new Error("choose an image");
    // Preflight: read every file this publish writes before the first
    // commit, so a taken slug or a missing marker fails cleanly instead of
    // leaving a half-published project in the repo.
    var cj = await getFile("content.json");
    var j = JSON.parse(cj.text);
    if (j.posts[slug]) throw new Error("content.json already has posts." + slug);
    try {
      await api("GET", "posts/" + slug + ".html?ref=" + BRANCH);
      throw new Error("posts/" + slug + ".html already exists");
    } catch (e) { if (e.status !== 404) throw e; }
    var ix = await getFile("index.html");
    if (ix.text.indexOf(CAROUSEL_END) === -1) throw new Error("ADMIN:CAROUSEL-END marker is missing from index.html");
    var px = await getFile("projects.html");
    if (px.text.indexOf(GRID_END) === -1) throw new Error("ADMIN:GRID-END marker is missing from projects.html");
    if (!confirm("Publish project \"" + name + "\"? This writes several commits to the repo.")) return;
    var idx = j.projects.items.length;
    j.projects.items.push({ name: name, meta: meta });
    var entry = { title: name, meta: meta };
    paras.forEach(function (p, i) { entry["body" + (i + 1)] = p; });
    j.posts[slug] = entry;
    j.tabs[slug] = name + " — Luca";
    var o = { slug: slug, img: img, name: name, meta: meta,
              title: name, paras: paras };
    if (up) await putFile("img/" + img, up.b64, null, "Add image " + img + " via admin");
    await putFile("posts/" + slug + ".html", postPage(o), null,
      "Add project page " + slug + " via admin");
    await putFile("content.json", JSON.stringify(j, null, 2) + "\n",
      cj.sha, "Add project " + slug + " via admin");
    await putFile("index.html",
      ix.text.replace(CAROUSEL_END, carouselFigure(o, idx) + "\n" + CAROUSEL_END),
      ix.sha, "Add project " + slug + " to carousel via admin");
    await putFile("projects.html",
      px.text.replace(GRID_END, gridTile(o, idx) + "\n" + GRID_END),
      px.sha, "Add project " + slug + " to grid via admin");
    if (up) { imageNames.push(img); fillImageSelects(); }
    ["p-name", "p-meta", "p-body1", "p-body2", "p-upload"].forEach(function (id) { $(id).value = ""; });
    if (!hasUnsavedText()) loadText().catch(function () {});
    status("Project \"" + name + "\" published — live in about a minute.", "ok");
    log("project published: posts/" + slug + ".html");
  } catch (e) {
    status(e.message, "err");
    log("ERROR: " + e.message);
  } finally {
    busy(btn, false);
  }
};

// ---- new post ----
$("save-post").onclick = async function () {
  if (!needToken()) return;
  var btn = this;
  if (btn.disabled) return;
  busy(btn, true, "Publishing…");
  status("");
  try {
    var title = $("w-title").value.trim(), meta = $("w-meta").value.trim();
    if (!title || !meta) throw new Error("title and meta are required");
    var slug = slugify(title);
    var paras = $("w-body").value.split(/\n\s*\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!paras.length) throw new Error("at least one paragraph is required");
    var up = await readUpload($("w-upload"));
    var img = up ? await freeImageName(up.name) : $("w-hero").value;
    if (!img) throw new Error("choose an image");
    // Same preflight as projects: nothing is written until every check passes.
    var cj = await getFile("content.json");
    var j = JSON.parse(cj.text);
    if (j.posts[slug]) throw new Error("content.json already has posts." + slug);
    try {
      await api("GET", "posts/" + slug + ".html?ref=" + BRANCH);
      throw new Error("posts/" + slug + ".html already exists");
    } catch (e) { if (e.status !== 404) throw e; }
    var ix = await getFile("index.html");
    if (ix.text.indexOf(WRITING_END) === -1) throw new Error("ADMIN:WRITING-END marker is missing from index.html");
    if (!confirm("Publish post \"" + title + "\"? This writes several commits to the repo.")) return;
    var entry = { title: title, meta: meta };
    paras.forEach(function (p, i) { entry["body" + (i + 1)] = p; });
    j.posts[slug] = entry;
    j.tabs[slug] = title + " — Luca";
    var o = { slug: slug, img: img, title: title, meta: meta, paras: paras };
    if (up) await putFile("img/" + img, up.b64, null, "Add image " + img + " via admin");
    await putFile("posts/" + slug + ".html", postPage(o), null,
      "Add post " + slug + " via admin");
    await putFile("content.json", JSON.stringify(j, null, 2) + "\n",
      cj.sha, "Add post " + slug + " via admin");
    await putFile("index.html",
      ix.text.replace(WRITING_END, writingRow(o) + "\n" + WRITING_END),
      ix.sha, "Add post " + slug + " to writing list via admin");
    if (up) { imageNames.push(img); fillImageSelects(); }
    ["w-title", "w-meta", "w-body", "w-upload"].forEach(function (id) { $(id).value = ""; });
    if (!hasUnsavedText()) loadText().catch(function () {});
    status("Post \"" + title + "\" published — live in about a minute.", "ok");
    log("post published: posts/" + slug + ".html");
  } catch (e) {
    status(e.message, "err");
    log("ERROR: " + e.message);
  } finally {
    busy(btn, false);
  }
};

setLocked(true);
$("token-status").textContent = "checking token…";
verify();
loadImages().catch(function (e) { log("ERROR: " + e.message); });
loadText().catch(function (e) {
  $("fields").innerHTML = "<p>Could not load content.json: " + esc(e.message) + "</p>";
});
})();
