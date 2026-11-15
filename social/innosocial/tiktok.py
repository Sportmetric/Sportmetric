"""TikTok Content Posting API: inbox/draft upload now, direct post once the app passes TikTok's audit."""

from __future__ import annotations

import time
from pathlib import Path

from .http import request, request_json

API = "https://open.tiktokapis.com/v2"
MB = 1024 * 1024


class TikTokError(Exception):
    pass


def chunk_plan(size: int) -> tuple[int, int]:
    """(chunk_size, total_chunks) per TikTok rules: chunks 5-64 MB, last chunk takes the remainder."""
    if size <= 64 * MB:
        return size, 1
    chunk = 10 * MB
    return chunk, size // chunk


class TikTok:
    def __init__(self, client_key: str, client_secret: str, state: dict, env_refresh_token: str = ""):
        self.key = client_key
        self.secret = client_secret
        self.state = state  # persisted dict: access_token, expires_at, refresh_token
        self.env_refresh = env_refresh_token

    # --- auth -------------------------------------------------------------------
    def token(self) -> str:
        if self.state.get("access_token") and self.state.get("expires_at", 0) > time.time() + 300:
            return self.state["access_token"]
        refresh = self.state.get("refresh_token") or self.env_refresh
        if not refresh:
            raise TikTokError("no TikTok refresh token - set TIKTOK_REFRESH_TOKEN")
        res = request_json("POST", f"{API}/oauth/token/", form={
            "client_key": self.key, "client_secret": self.secret,
            "grant_type": "refresh_token", "refresh_token": refresh,
        })
        if "access_token" not in res:
            raise TikTokError(f"token refresh failed: {res}")
        self.state.update(access_token=res["access_token"], expires_at=time.time() + int(res.get("expires_in", 3600)),
                          refresh_token=res.get("refresh_token", refresh), open_id=res.get("open_id"))
        return res["access_token"]

    def _post(self, path: str, body: dict) -> dict:
        res = request_json("POST", f"{API}{path}", json_body=body, headers={"Authorization": f"Bearer {self.token()}"})
        err = res.get("error", {})
        if err.get("code") not in (None, "ok"):
            raise TikTokError(f"{path}: {err.get('code')} {err.get('message')}")
        return res.get("data", {})

    # --- upload -----------------------------------------------------------------
    def _upload(self, upload_url: str, data: bytes, chunk: int, total: int) -> None:
        size = len(data)
        for i in range(total):
            start = i * chunk
            end = size if i == total - 1 else start + chunk
            request("PUT", upload_url, data=data[start:end], timeout=600, headers={
                "Content-Type": "video/mp4", "Content-Length": str(end - start),
                "Content-Range": f"bytes {start}-{end - 1}/{size}",
            })

    def upload_draft(self, video: Path) -> str:
        data = video.read_bytes()
        chunk, total = chunk_plan(len(data))
        d = self._post("/post/publish/inbox/video/init/", {"source_info": {
            "source": "FILE_UPLOAD", "video_size": len(data), "chunk_size": chunk, "total_chunk_count": total}})
        self._upload(d["upload_url"], data, chunk, total)
        return d["publish_id"]

    def creator_info(self) -> dict:
        return self._post("/post/publish/creator_info/query/", {})

    def direct_post(self, video: Path, caption: str, privacy: str) -> str:
        info = self.creator_info()
        options = info.get("privacy_level_options") or []
        if privacy not in options:
            raise TikTokError(f"privacy {privacy} not allowed for this account/app (allowed: {options}). "
                              "Before TikTok's audit only SELF_ONLY works - keep TIKTOK_MODE=draft.")
        data = video.read_bytes()
        chunk, total = chunk_plan(len(data))
        d = self._post("/post/publish/video/init/", {
            "post_info": {"title": caption[:2200], "privacy_level": privacy,
                          "disable_comment": bool(info.get("comment_disabled")),
                          "disable_duet": bool(info.get("duet_disabled")),
                          "disable_stitch": bool(info.get("stitch_disabled")),
                          "video_cover_timestamp_ms": 1000},
            "source_info": {"source": "FILE_UPLOAD", "video_size": len(data), "chunk_size": chunk,
                            "total_chunk_count": total},
        })
        self._upload(d["upload_url"], data, chunk, total)
        return d["publish_id"]

    def status(self, publish_id: str) -> dict:
        return self._post("/post/publish/status/fetch/", {"publish_id": publish_id})
