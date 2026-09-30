# Static blog — no build step, no dependencies.
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY index.html projects.html writing.html about.html style.css /srv/
COPY posts/ /srv/posts/
COPY img/ /srv/img/
