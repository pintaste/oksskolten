#!/usr/bin/env python3
"""
GitHub webhook receiver.

Listens for push events on the configured branch and runs deploy.sh.

Setup:
  1. Generate a secret:  python3 -c "import secrets; print(secrets.token_hex(32))"
  2. Write it to:        /etc/oksskolten/webhook-secret  (chmod 600)
  3. Add the same secret to GitHub: repo → Settings → Webhooks → Secret
  4. Run via systemd:    see webhook.service
"""

import hashlib
import hmac
import http.server
import json
import os
import subprocess
import sys
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("webhook")

SECRET_FILE = os.getenv("WEBHOOK_SECRET_FILE", "/etc/oksskolten/webhook-secret")
DEPLOY_BRANCH = os.getenv("DEPLOY_BRANCH", "main")
DEPLOY_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "deploy.sh")
PORT = int(os.getenv("WEBHOOK_PORT", "9000"))


def load_secret() -> bytes:
    with open(SECRET_FILE) as f:
        return f.read().strip().encode()


def verify_signature(secret: bytes, body: bytes, sig_header: str) -> bool:
    expected = "sha256=" + hmac.new(secret, body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig_header, expected)


class WebhookHandler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802
        if self.path != "/webhook":
            self._respond(404)
            return

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)

        try:
            secret = load_secret()
        except OSError as e:
            log.error("Cannot read secret file: %s", e)
            self._respond(500)
            return

        sig = self.headers.get("X-Hub-Signature-256", "")
        if not verify_signature(secret, body, sig):
            log.warning("Signature mismatch — ignoring request")
            self._respond(403)
            return

        event = self.headers.get("X-GitHub-Event", "")
        if event == "push":
            try:
                payload = json.loads(body)
            except json.JSONDecodeError:
                self._respond(400)
                return

            branch = payload.get("ref", "").removeprefix("refs/heads/")
            if branch == DEPLOY_BRANCH:
                log.info("Push to %s — triggering deploy", branch)
                subprocess.Popen(
                    ["bash", DEPLOY_SCRIPT],
                    stdout=sys.stdout,
                    stderr=sys.stderr,
                )
            else:
                log.info("Push to %s (not %s) — skipping", branch, DEPLOY_BRANCH)

        self._respond(200)

    def _respond(self, code: int):
        self.send_response(code)
        self.end_headers()

    def log_message(self, fmt, *args):  # silence default access log
        pass


if __name__ == "__main__":
    log.info("Webhook receiver listening on :%d (branch=%s)", PORT, DEPLOY_BRANCH)
    http.server.HTTPServer(("", PORT), WebhookHandler).serve_forever()
