"""Queue state persistence.

Every run starts in a fresh container, so the queue can't live on local disk.
It lives in the Telegram chat itself: a small JSON file the bot pins (silently).
Older copies are deleted when a new one is pinned. Don't unpin it.
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

from .telegram import Telegram

STATE_NAME = "innometrics-social-queue.json"


def empty_state() -> dict:
    return {"version": 1, "seq": 0, "tg_offset": 0, "state_message_id": None, "tiktok": {}, "posts": {}}


def _last_change(post: dict) -> tuple:
    h = post.get("history") or []
    return (h[-1]["at"] if h else 0, len(h))


def merge(ours: dict, theirs: dict) -> dict:
    """Combine two saves that started from the same copy (the 10-minute run and the hourly run overlapped).
    Each post keeps whichever side changed it last; counters take the larger value."""
    out = dict(ours)
    out["seq"] = max(ours.get("seq", 0), theirs.get("seq", 0))
    out["tg_offset"] = max(ours.get("tg_offset", 0), theirs.get("tg_offset", 0))
    if (theirs.get("tiktok") or {}).get("expires_at", 0) > (ours.get("tiktok") or {}).get("expires_at", 0):
        out["tiktok"] = theirs["tiktok"]
    posts = dict(theirs.get("posts", {}))
    for pid, p in ours.get("posts", {}).items():
        if pid not in posts or _last_change(p) >= _last_change(posts[pid]):
            posts[pid] = p
    out["posts"] = posts
    return out


class TelegramStore:
    def __init__(self, tg: Telegram):
        self.tg = tg

    def load(self) -> dict:
        chat = self.tg.get_chat()
        pinned = chat.get("pinned_message") or {}
        doc = pinned.get("document") or {}
        if doc.get("file_name") != STATE_NAME:
            return empty_state()
        with tempfile.TemporaryDirectory() as d:
            p = self.tg.download(doc["file_id"], Path(d) / STATE_NAME)
            state = json.loads(p.read_text())
        state["state_message_id"] = pinned["message_id"]
        return state

    def save(self, state: dict) -> None:
        old = state.get("state_message_id")
        current = (self.tg.get_chat().get("pinned_message") or {}).get("message_id")
        if current and old and current != old:  # another run saved since we loaded
            latest = self.load()
            state.update(merge(state, latest))
            old = latest["state_message_id"]
        data = json.dumps(state, ensure_ascii=False, indent=1).encode()
        msg = self.tg.send_document(STATE_NAME, data, caption="⚙️ Queue data for the posting bot - please keep pinned.")
        self.tg.pin(msg["message_id"])
        state["state_message_id"] = msg["message_id"]
        if old and old != msg["message_id"]:
            self.tg.unpin(old)
            self.tg.delete(old)


class FileStore:
    def __init__(self, path: str):
        self.path = Path(path)

    def load(self) -> dict:
        return json.loads(self.path.read_text()) if self.path.exists() else empty_state()

    def save(self, state: dict) -> None:
        self.path.write_text(json.dumps(state, ensure_ascii=False, indent=1))
