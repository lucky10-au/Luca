# ~/blog — Luca's portfolio + blog (static site)

Zero dependencies, zero build step. Plain HTML + one `style.css`, placeholder
SVG art in `img/`. Live at https://lucky10-au.github.io via GitHub Pages
(push to `main` = deploy, ~1–2 min build).

## Layout
- `index.html` — home: hero, about blurb, projects carousel, writing list
- `projects.html` — 2-wide project grid, hover-only overlaid captions
- `writing.html`, `about.html` — article-style pages
- `posts/` — one HTML file per post (`hello-world.html` is the template)
- `img/` — SVG placeholders; swap same filenames for real art
- `serve.py` — local preview server on :2720 (`systemctl --user status blog`; dev only, Pages ignores it)
- NOTE 2026-10-01: self-host production files (`Dockerfile`, `Caddyfile`,
  `compose.yml`) were deliberately deleted — Pages is the deploy target. Do
  not reintroduce without owner approval.

## Invariants future agents must respect
1. **Absolute paths** (`/style.css`, `/img/…`, `/posts/…`) only work because
   this repo is the `lucky10-au.github.io` user site (served from domain
   root). If the repo is ever renamed to a project repo, either convert all
   paths to relative or put a custom domain in front — otherwise every asset
   404s in production.
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
   request. Site-wide dark palette lives in `:root` in `style.css`.

## Reminder
If you make a drastic change (hosting, routing, paths, carousel rewrite,
new build step), update THIS file in the same commit so the next agent
inherits accurate context. Keep it short.
