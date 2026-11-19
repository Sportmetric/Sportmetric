"""Instagram Reels publishing (resumable upload, no public URL needed).

Two kinds of token work:
- "Instagram API with Instagram Login" (token starts with IG): graph.instagram.com. No Facebook Page needed.
  Long-lived tokens last 60 days; the bot renews them itself (see refresh_token).
- Facebook Login / System User token: graph.facebook.com (account linked to a Facebook Page).
"""

from __future__ import annotations

import time
import urllib.parse
from pathlib import Path

from .http import request_json

GRAPH = "https://graph.facebook.com"
IG_GRAPH = "https://graph.instagram.com"
RUPLOAD = "https://rupload.facebook.com/ig-api-upload"
IG_SCOPES = "instagram_business_basic,instagram_business_content_publish"


def auth_url(app_id: str, redirect_uri: str, state: str) -> str:
    return "https://www.instagram.com/oauth/authorize?" + urllib.parse.urlencode({
        "client_id": app_id, "redirect_uri": redirect_uri, "response_type": "code", "scope": IG_SCOPES,
        "state": state, "enable_fb_login": "0", "force_reauth": "true"})


def exchange_code(app_id: str, secret: str, code: str, redirect_uri: str) -> dict:
    """One-time code -> long-lived (60-day) token. Returns {token, user_id, expires_at}."""
    code = code.strip().removesuffix("#_")
    short = request_json("POST", "https://api.instagram.com/oauth/access_token", form={
        "client_id": app_id, "client_secret": secret, "grant_type": "authorization_code",
        "redirect_uri": redirect_uri, "code": code})
    short = (short.get("data") or [short])[0]
    if "access_token" not in short:
        raise InstagramError(f"code exchange failed: { {k: v for k, v in short.items() if 'token' not in k} }")
    long = request_json("GET", f"{IG_GRAPH}/access_token", params={
        "grant_type": "ig_exchange_token", "client_secret": secret, "access_token": short["access_token"]})
    if "access_token" not in long:
        raise InstagramError("could not get a long-lived Instagram token")
    return {"token": long["access_token"], "user_id": str(short.get("user_id", "")),
            "expires_at": time.time() + int(long.get("expires_in", 5_184_000))}


def refresh_token(token: str) -> dict:
    res = request_json("GET", f"{IG_GRAPH}/refresh_access_token",
                       params={"grant_type": "ig_refresh_token", "access_token": token})
    if "access_token" not in res:
        raise InstagramError("Instagram token refresh failed")
    return {"token": res["access_token"], "expires_at": time.time() + int(res.get("expires_in", 5_184_000))}


class InstagramError(Exception):
    pass


class Instagram:
    def __init__(self, token: str, ig_user_id: str, version: str = "v23.0"):
        self.token = token
        self.v = version
        self.ig_login = token.startswith("IG")
        self.base = IG_GRAPH if self.ig_login else GRAPH
        self.uid = ig_user_id or (self._me().get("user_id", "") if self.ig_login else "")
        if not self.uid:
            raise InstagramError("Instagram user id unknown")

    def _h(self) -> dict:
        # If no token in env, the network proxy may inject the Authorization header instead.
        if not self.token:
            return {}
        return {"Authorization": f"{'Bearer' if self.ig_login else 'OAuth'} {self.token}"}

    def _me(self) -> dict:
        return request_json("GET", f"{IG_GRAPH}/{self.v}/me", headers=self._h(), params={"fields": "user_id,username"})

    def create_container(self, video: Path, caption: str) -> str:
        res = request_json("POST", f"{self.base}/{self.v}/{self.uid}/media", headers=self._h(), form={
            "media_type": "REELS", "upload_type": "resumable", "caption": caption, "share_to_feed": "true",
        })
        cid = res.get("id")
        if not cid:
            raise InstagramError(f"no container id: {res}")
        data = video.read_bytes()
        up = request_json("POST", f"{RUPLOAD}/{self.v}/{cid}", data=data, timeout=600, headers={
            **({"Authorization": f"OAuth {self.token}"} if self.token else {}), "offset": "0", "file_size": str(len(data)), "Content-Type": "application/octet-stream",
        })
        if not up.get("success", True):
            raise InstagramError(f"upload failed: {up}")
        return cid

    def container_status(self, cid: str) -> tuple[str, str]:
        res = request_json("GET", f"{self.base}/{self.v}/{cid}", headers=self._h(), params={"fields": "status_code,status"})
        return res.get("status_code", "UNKNOWN"), res.get("status", "")

    def wait_ready(self, cid: str, max_wait: int = 600) -> str:
        deadline = time.time() + max_wait
        while True:
            code, detail = self.container_status(cid)
            if code == "FINISHED":
                return code
            if code in ("ERROR", "EXPIRED"):
                raise InstagramError(f"container {code}: {detail}")
            if time.time() > deadline:
                return code  # still IN_PROGRESS - caller retries next run
            time.sleep(10)

    def publish(self, cid: str) -> dict:
        res = request_json("POST", f"{self.base}/{self.v}/{self.uid}/media_publish", headers=self._h(),
                           form={"creation_id": cid})
        mid = res.get("id")
        if not mid:
            raise InstagramError(f"publish failed: {res}")
        url = ""
        try:
            url = request_json("GET", f"{self.base}/{self.v}/{mid}", headers=self._h(),
                               params={"fields": "permalink"}).get("permalink", "")
        except Exception:
            pass
        return {"id": mid, "url": url}

    def whoami(self) -> dict:
        return request_json("GET", f"{self.base}/{self.v}/{self.uid}", headers=self._h(),
                            params={"fields": "username,account_type"})
