# ~/blog — Luca's portfolio + blog (static site)

Zero dependencies, zero build step. Plain HTML + one `style.css`, placeholder
SVG art in `img/`. Live at https://lucky10-au.github.io/Luca/ via GitHub Pages
(push to `main` = deploy, ~1–2 min build).

## Layout
- `index.html` — home: hero, about blurb, projects carousel, writing list
- `projects.html` — 2-wide project grid, hover-only overlaid captions
- `writing.html`, `about.html` — article-style pages
- `posts/` — one HTML file per post (`hello-world.html` is the template)
- `img/` — SVG placeholders; swap same filenames for real art
- `serve.py` — local preview server on :2720 (`systemctl --user status blog`; dev only, Pages ignores it)
- `content.json` — THE copy source: every visible string on the site, keyed
  by path (`site.brand`, `projects.items.0.name`, …). Edit this file (or use
  `/admin.html`) to change any text. Pretty-printed; keep it that way.
- `content.js` — loader that overrides `[data-content]` elements from the
  JSON. HTML text is fallback-only and must match the JSON (it is the
  no-JS rendering).
- `admin.html` + `admin.js` — private on-site CMS, NOT in the nav. Edits
  text, publishes projects/posts straight to the repo via the Contents API
  (one commit per file). Security model (be honest about it): the page
  itself is public — any JS gate is obscurity. The real boundary is the
  GitHub token, enforced server-side by GitHub: keep it repo-scoped and
  minimal (Contents read+write on this repo only), it lives in the
  visitor's browser localStorage ONLY (never commit one), the panel stays
  hidden until the token verifies, it auto-locks after 15 idle minutes,
  publishes ask for confirmation, and the page is `noindex`. Insert
  markers `ADMIN:CAROUSEL-END`, `ADMIN:GRID-END`, `ADMIN:WRITING-END` must
  stay exactly where they are or admin inserts fail loudly.
- NOTE 2026-10-01: self-host production files (`Dockerfile`, `Caddyfile`,
  `compose.yml`) were deliberately deleted — Pages is the deploy target. Do
  not reintroduce without owner approval.

## Invariants future agents must respect
1. **Paths are relative** (`style.css`, `img/…`, `posts/…`, `../` from posts).
   Converted from absolute on 2026-10-01 when the repo was renamed
   `lucky10-au.github.io` → `Luca` (project sites serve from a subpath, so
   absolute paths would 404). Keep them relative — works on user sites,
   project sites, custom domains, and local preview alike.
2. **CSS cache-busting is manual.** `serve.py` sends `no-cache` locally, but
   GitHub Pages does not run `serve.py`. Every `style.css` change MUST bump
   the `?v=N` query in ALL HTML files or production visitors see stale styles.
3. **Carousel** (`index.html` `<script>`): 31× cloned set for the infinite
   loop, teleports on scroll-settle ONLY (never mid-gesture — that caused
   flicker twice), 3-frame stability hysteresis on the featured card,
   `proximity` snap + settle-time smooth centering. Do not reintroduce
   mid-glide teleports or per-frame class churn; both were removed after
   real-browser (Playwright/Chromium) reproduction. Test rig lives in
   `/tmp/cartest` (not committed).
4. No footers, no contact page, no dark-mode toggle — all removed per owner
   request. Strict black-and-white light theme lives in `:root` in
   `style.css` (no chromatic colors anywhere; placeholder art is grayscale).

## Reminder
If you make a drastic change (hosting, routing, paths, carousel rewrite,
new build step), update THIS file in the same commit so the next agent
inherits accurate context. Keep it short.
