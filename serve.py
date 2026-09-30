#!/usr/bin/env python3
"""Static server for ~/blog with sane caching.

HTML is always revalidated (no-cache), so edits and JS fixes reach
browsers immediately. Versioned assets (?v=12) are immutable and cached
for a year. Replaces `python -m http.server`, which sends no
Cache-Control and lets phones sit on stale code for days.
"""
import functools
import http.server

PORT = 2720
DIRECTORY = "/home/ubliq/blog"


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        path = self.path.split("?", 1)[0]
        name = path.rsplit("/", 1)[-1]
        # HTML, CSS and JS are tiny and change often: always revalidate so
        # edits show up on plain reload. Images/fonts are content addressed
        # in practice: cache them hard.
        if ("." not in name or name.endswith((".html", ".css", ".js"))):
            self.send_header("Cache-Control", "no-cache")
        else:
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    http.server.ThreadingHTTPServer(
        ("0.0.0.0", PORT),
        functools.partial(Handler, directory=DIRECTORY),
    ).serve_forever()
