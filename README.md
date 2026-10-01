# blog / portfolio — static, zero dependencies
# Edit index.html + style.css + posts/*.html, refresh the browser. That's the whole CMS.

## Preview (this machine, Tailscale/LAN only)
systemctl --user status blog          # python http.server on :2720
# open http://<tailscale-ip>:2720 — add to ~/landing/index.html if you want it listed

## Deploy
Push to `main` → GitHub Pages rebuilds (~1–2 min) at https://lucky10-au.github.io.

## Files
- index.html — home: hero, about, projects carousel, writing list
- projects.html — project grid · writing.html / about.html — article pages
- style.css — one palette, system fonts (bump `?v=N` in all HTML on change — see AGENTS.md)
- posts/ — one HTML file per post (`hello-world.html` is the template)
- img/ — SVG placeholders, swap same filenames for real art
- serve.py — local preview server on :2720 (dev only, not used by Pages)
- AGENTS.md — maintainer notes for future agents
