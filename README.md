# blog / portfolio — static, zero dependencies
# Edit index.html + style.css + posts/*.html, refresh the browser. That's the whole CMS.

## Preview (this machine, Tailscale/LAN only)
systemctl --user status blog          # python http.server on :2720
# open http://<tailscale-ip>:2720 — add to ~/landing/index.html if you want it listed

## Public options (recommended over exposing this laptop)
1. **Best:** `git init && git add .` → push to GitHub → Cloudflare Pages / GitHub Pages → add your domain (CNAME). Free, CDN, auto-TLS.
2. **Self-host via Tunnel:** `cp .env.example .env` (add token), `docker compose up -d tunnel`. No port-forward needed.
3. **VPS:** same compose.yml works on any $5 VPS with your domain's A record.

## Files
- index.html — hero, work, about, writing, contact (edit text in place)
- style.css — one palette, system fonts
- posts/hello-world.html — template: copy per post, add a row in index.html
- Dockerfile / Caddyfile / compose.yml — prod serving (read-only, static only)
