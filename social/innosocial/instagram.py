"""Instagram Reels publishing via the Instagram Graph API (resumable upload, no public URL needed)."""

from __future__ import annotations

import time
from pathlib import Path

from .http import request_json

GRAPH = "https://graph.facebook.com"
RUPLOAD = "https://rupload.facebook.com/ig-api-upload"


class InstagramError(Exception):
    pass


class Instagram:
    def __init__(self, token: str, ig_user_id: str, version: str = "v23.0"):
        self.token = token
        self.uid = ig_user_id
        self.v = version

    def _h(self) -> dict:
        # If no token in env, the network proxy may inject the Authorization header instead.
        return {"Authorization": f"OAuth {self.token}"} if self.token else {}

    def create_container(self, video: Path, caption: str) -> str:
        res = request_json("POST", f"{GRAPH}/{self.v}/{self.uid}/media", headers=self._h(), form={
            "media_type": "REELS", "upload_type": "resumable", "caption": caption, "share_to_feed": "true",
        })
        cid = res.get("id")
        if not cid:
            raise InstagramError(f"no container id: {res}")
        data = video.read_bytes()
        up = request_json("POST", f"{RUPLOAD}/{self.v}/{cid}", data=data, timeout=600, headers={
            **self._h(), "offset": "0", "file_size": str(len(data)), "Content-Type": "application/octet-stream",
        })
        if not up.get("success", True):
            raise InstagramError(f"upload failed: {up}")
        return cid

    def container_status(self, cid: str) -> tuple[str, str]:
        res = request_json("GET", f"{GRAPH}/{self.v}/{cid}", headers=self._h(), params={"fields": "status_code,status"})
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
        res = request_json("POST", f"{GRAPH}/{self.v}/{self.uid}/media_publish", headers=self._h(),
                           form={"creation_id": cid})
        mid = res.get("id")
        if not mid:
            raise InstagramError(f"publish failed: {res}")
        url = ""
        try:
            url = request_json("GET", f"{GRAPH}/{self.v}/{mid}", headers=self._h(),
                               params={"fields": "permalink"}).get("permalink", "")
        except Exception:
            pass
        return {"id": mid, "url": url}

    def whoami(self) -> dict:
        return request_json("GET", f"{GRAPH}/{self.v}/{self.uid}", headers=self._h(),
                            params={"fields": "username,account_type"})
