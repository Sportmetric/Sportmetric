"""Tiny stdlib HTTP helper (no third-party dependencies)."""

from __future__ import annotations

import json
import os
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


class HttpError(Exception):
    def __init__(self, status: int, body: str, url: str):
        super().__init__(f"HTTP {status} from {_redact(url)}: {body[:800]}")
        self.status = status
        self.body = body


def _redact(url: str) -> str:
    # Telegram puts the bot token in the path; never print it.
    if "api.telegram.org/" in url:
        parts = url.split("/")
        return "/".join("bot***" if p.startswith("bot") and ":" in p else p for p in parts)
    return url.split("?")[0]


def _ctx() -> ssl.SSLContext:
    cafile = os.environ.get("SSL_CERT_FILE") or os.environ.get("REQUESTS_CA_BUNDLE")
    return ssl.create_default_context(cafile=cafile) if cafile else ssl.create_default_context()


def multipart(fields: dict, files: dict) -> tuple[bytes, str]:
    """files: name -> (filename, bytes, content_type)"""
    boundary = uuid.uuid4().hex
    out = bytearray()
    for k, v in fields.items():
        if v is None:
            continue
        out += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n".encode()
        out += (v if isinstance(v, str) else json.dumps(v)).encode() + b"\r\n"
    for k, (fname, data, ctype) in files.items():
        out += (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"; filename=\"{fname}\"\r\n"
            f"Content-Type: {ctype}\r\n\r\n"
        ).encode()
        out += data + b"\r\n"
    out += f"--{boundary}--\r\n".encode()
    return bytes(out), f"multipart/form-data; boundary={boundary}"


def request(
    method: str,
    url: str,
    *,
    params: dict | None = None,
    json_body=None,
    form: dict | None = None,
    data: bytes | None = None,
    headers: dict | None = None,
    timeout: float = 120,
    retries: int = 2,
) -> bytes:
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    hdrs = dict(headers or {})
    body = data
    if json_body is not None:
        body = json.dumps(json_body).encode()
        hdrs.setdefault("Content-Type", "application/json; charset=UTF-8")
    elif form is not None:
        body = urllib.parse.urlencode(form).encode()
        hdrs.setdefault("Content-Type", "application/x-www-form-urlencoded")
    attempt = 0
    while True:
        req = urllib.request.Request(url, data=body, method=method, headers=hdrs)
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=_ctx()) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            text = e.read().decode("utf-8", "replace")
            if e.code >= 500 and attempt < retries:
                attempt += 1
                time.sleep(2 * attempt)
                continue
            raise HttpError(e.code, text, url) from None
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            if attempt < retries:
                attempt += 1
                time.sleep(2 * attempt)
                continue
            raise HttpError(0, str(e), url) from None


def request_json(method: str, url: str, **kw) -> dict:
    raw = request(method, url, **kw)
    return json.loads(raw.decode("utf-8")) if raw else {}
