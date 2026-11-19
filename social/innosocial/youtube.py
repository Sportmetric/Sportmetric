"""YouTube Shorts upload (Data API v3, resumable upload). Used for the Meme Town channel."""

from __future__ import annotations

import json
import time
import urllib.parse
from pathlib import Path

from .http import request, request_json

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
API = "https://www.googleapis.com/youtube/v3"
UPLOAD = "https://www.googleapis.com/upload/youtube/v3/videos"
SCOPE = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly"


class YouTubeError(Exception):
    pass


def auth_url(client_id: str, redirect_uri: str, state: str) -> str:
    return AUTH_URL + "?" + urllib.parse.urlencode({
        "client_id": client_id, "redirect_uri": redirect_uri, "response_type": "code", "scope": SCOPE,
        "access_type": "offline", "prompt": "consent", "state": state})


def exchange_code(client_id: str, secret: str, code: str, redirect_uri: str) -> dict:
    res = request_json("POST", TOKEN_URL, form={"client_id": client_id, "client_secret": secret, "code": code,
                                               "grant_type": "authorization_code", "redirect_uri": redirect_uri})
    if "refresh_token" not in res:
        raise YouTubeError(f"no refresh token in Google's answer: { {k: v for k, v in res.items() if 'token' not in k} }")
    return res


def split_caption(caption: str) -> tuple[str, str]:
    """First line is the title (YouTube max 100 chars, no angle brackets); the rest is the description."""
    lines = caption.strip().splitlines()
    title = (lines[0] if lines else "").replace("<", "").replace(">", "").strip()[:100]
    desc = "\n".join(lines[1:]).strip()
    if "#shorts" not in desc.lower():
        desc = (desc + "\n\n#Shorts").strip()
    return title, desc


class YouTube:
    def __init__(self, client_id: str, secret: str, state: dict, env_refresh_token: str = ""):
        self.cid = client_id
        self.secret = secret
        self.state = state  # persisted: access_token, expires_at, refresh_token
        self.env_refresh = env_refresh_token

    def token(self) -> str:
        if self.state.get("access_token") and self.state.get("expires_at", 0) > time.time() + 120:
            return self.state["access_token"]
        refresh = self.state.get("refresh_token") or self.env_refresh
        if not refresh:
            raise YouTubeError("YouTube isn't connected yet - ask Claude to connect the Meme Town channel")
        res = request_json("POST", TOKEN_URL, form={"client_id": self.cid, "client_secret": self.secret,
                                                   "refresh_token": refresh, "grant_type": "refresh_token"})
        if "access_token" not in res:
            raise YouTubeError(f"token refresh failed: {res.get('error')} {res.get('error_description', '')}")
        self.state.update(access_token=res["access_token"], expires_at=time.time() + int(res.get("expires_in", 3600)),
                          refresh_token=res.get("refresh_token", refresh))
        return res["access_token"]

    def _h(self) -> dict:
        return {"Authorization": f"Bearer {self.token()}"}

    def channel(self) -> dict:
        items = request_json("GET", f"{API}/channels", params={"part": "snippet", "mine": "true"},
                             headers=self._h()).get("items") or []
        return {"id": items[0]["id"], "title": items[0]["snippet"]["title"]} if items else {}

    def upload(self, video: Path, caption: str, privacy: str = "public", tags: list[str] | None = None) -> dict:
        title, desc = split_caption(caption)
        if not title:
            raise YouTubeError("empty title (the caption's first line is the YouTube title)")
        data = video.read_bytes()
        meta = {"snippet": {"title": title, "description": desc, "tags": tags or [], "categoryId": "23"},  # Comedy
                "status": {"privacyStatus": privacy, "selfDeclaredMadeForKids": False}}
        hdrs: dict = {}
        request("POST", UPLOAD, params={"uploadType": "resumable", "part": "snippet,status"}, json_body=meta,
                headers={**self._h(), "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": str(len(data))},
                out_headers=hdrs)
        location = hdrs.get("location")
        if not location:
            raise YouTubeError("YouTube did not return an upload address")
        raw = request("PUT", location, data=data, timeout=900, retries=0,
                      headers={**self._h(), "Content-Type": "video/mp4", "Content-Length": str(len(data))})
        res = json.loads(raw.decode() or "{}")
        vid = res.get("id")
        if not vid:
            raise YouTubeError(f"upload finished without a video id: {str(res)[:300]}")
        return {"id": vid, "url": f"https://youtube.com/shorts/{vid}",
                "privacy": (res.get("status") or {}).get("privacyStatus", privacy)}
