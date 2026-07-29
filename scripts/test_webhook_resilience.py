#!/usr/bin/env python3
"""Regression test: incomplete/slow clients must not stall the webhook.

Reproduces the 2026-07-29 outage mode:
  - scanners open TCP and send partial HTTP (or nothing)
  - single-threaded HTTPServer blocked in readline forever
  - listen backlog filled → all new requests (incl. GitHub deploy) hang/502

This process starts a temporary webhook on a free port and checks that a
valid-looking POST still returns quickly while hung clients are connected.
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def wait_listening(port: int, timeout: float = 5.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                return
        except OSError:
            time.sleep(0.05)
    raise TimeoutError(f"server on :{port} did not start")


def open_hanging_clients(port: int, n: int) -> list[socket.socket]:
    """Open n connections that never complete an HTTP request."""
    socks: list[socket.socket] = []
    for i in range(n):
        s = socket.create_connection(("127.0.0.1", port), timeout=2)
        s.settimeout(None)
        # Partial request: header never finished → server would block on readline
        # without request timeout / would monopolize a single-threaded loop.
        if i % 2 == 0:
            s.sendall(b"POST /webhook HTTP/1.1\r\nHost: localhost\r\n")
        # else: connected but send nothing
        socks.append(s)
    return socks


def post_probe(port: int, timeout: float = 3.0) -> int:
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/webhook",
        data=b"{}",
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        return e.code


def main() -> int:
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "webhook.py")
    port = free_port()
    hang_n = int(os.getenv("HANG_CLIENTS", "20"))

    with tempfile.NamedTemporaryFile("w", delete=False) as f:
        f.write("test-secret-for-resilience\n")
        secret_path = f.name

    env = os.environ.copy()
    env["WEBHOOK_PORT"] = str(port)
    env["WEBHOOK_SECRET_FILE"] = secret_path
    env["DEPLOY_BRANCH"] = "main"

    proc = subprocess.Popen(
        [sys.executable, script],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    hung: list[socket.socket] = []
    try:
        wait_listening(port)
        t0 = time.time()
        code_before = post_probe(port)
        baseline_ms = (time.time() - t0) * 1000
        if code_before not in (403, 200):
            print(f"FAIL: unexpected baseline status {code_before}")
            return 1
        print(f"OK baseline POST → {code_before} in {baseline_ms:.0f}ms")

        hung = open_hanging_clients(port, hang_n)
        print(f"OK opened {hang_n} incomplete clients")

        # Give handler threads a moment; then prove we still serve new POSTs.
        time.sleep(0.5)
        latencies: list[float] = []
        for i in range(5):
            t0 = time.time()
            code = post_probe(port, timeout=5.0)
            ms = (time.time() - t0) * 1000
            latencies.append(ms)
            if code not in (403, 200):
                print(f"FAIL: probe #{i} status {code} after hangs")
                return 1
            if ms > 4000:
                print(f"FAIL: probe #{i} too slow ({ms:.0f}ms) — server stalled")
                return 1
            print(f"OK probe #{i} → {code} in {ms:.0f}ms")

        avg = sum(latencies) / len(latencies)
        print(f"PASS: server stays responsive under {hang_n} hung clients (avg {avg:.0f}ms)")
        return 0
    except Exception as e:
        print(f"FAIL: {e}")
        if proc.stdout:
            out = proc.stdout.read() if proc.poll() is not None else ""
            # non-blocking-ish drain
            try:
                proc.stdout.flush()
            except Exception:
                pass
            if out:
                print("--- server output ---")
                print(out[-2000:])
        return 1
    finally:
        for s in hung:
            try:
                s.close()
            except OSError:
                pass
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()
        try:
            os.unlink(secret_path)
        except OSError:
            pass


if __name__ == "__main__":
    sys.exit(main())
