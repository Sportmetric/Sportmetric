"""Queue state persistence.

Every hourly run starts in a fresh container, so the queue can't live on local disk.
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
