"""Telegram Bot API client (approval UI + video intake + state storage)."""

from __future__ import annotations

import json
from pathlib import Path

from .http import HttpError, multipart, request, request_json

API = "https://api.telegram.org"


class TelegramError(Exception):
    pass


class Telegram:
    def __init__(self, token: str, chat_id: str):
        self.token = token
        self.chat_id = chat_id

    def call(self, method: str, **params):
        try:
            res = request_json("POST", f"{API}/bot{self.token}/{method}", json_body=params, timeout=60)
        except HttpError as e:
            raise TelegramError(f"{method}: {e}") from None
        if not res.get("ok"):
            raise TelegramError(f"{method}: {res}")
        return res["result"]

    # --- messages ---------------------------------------------------------------
    def send(self, text: str, *, buttons=None, reply_to: int | None = None, silent=False, html=True) -> dict:
        params = {"chat_id": self.chat_id, "text": text[:4096], "disable_web_page_preview": True,
                  "disable_notification": silent}
        if html:
            params["parse_mode"] = "HTML"
        if buttons:
            params["reply_markup"] = {"inline_keyboard": buttons}
        if reply_to:
            params["reply_parameters"] = {"message_id": reply_to, "allow_sending_without_reply": True}
        return self.call("sendMessage", **params)

    def ask_reply(self, text: str, reply_to: int | None = None) -> dict:
        """Message that opens the reply box in the Telegram app."""
        params = {"chat_id": self.chat_id, "text": text, "parse_mode": "HTML",
                  "reply_markup": {"force_reply": True, "selective": True}}
        if reply_to:
            params["reply_parameters"] = {"message_id": reply_to, "allow_sending_without_reply": True}
        return self.call("sendMessage", **params)

    def edit(self, message_id: int, text: str, *, buttons=None) -> None:
        params = {"chat_id": self.chat_id, "message_id": message_id, "text": text[:4096],
                  "parse_mode": "HTML", "disable_web_page_preview": True}
        if buttons:
            params["reply_markup"] = {"inline_keyboard": buttons}
        try:
            self.call("editMessageText", **params)
        except TelegramError as e:
            if "message is not modified" not in str(e):
                raise

    def answer_callback(self, callback_id: str, text: str = "") -> None:
        try:
            self.call("answerCallbackQuery", callback_query_id=callback_id, text=text[:200])
        except TelegramError:
            pass  # query too old (we only poll hourly) - harmless

    def send_video(self, file_id: str, caption: str = "") -> dict:
        return self.call("sendVideo", chat_id=self.chat_id, video=file_id, caption=caption[:1024], parse_mode="HTML")

    def delete(self, message_id: int) -> None:
        try:
            self.call("deleteMessage", chat_id=self.chat_id, message_id=message_id)
        except TelegramError:
            pass

    # --- updates ----------------------------------------------------------------
    def updates(self, offset: int) -> list[dict]:
        return self.call("getUpdates", offset=offset, timeout=0, limit=100,
                         allowed_updates=["message", "callback_query"])

    # --- files ------------------------------------------------------------------
    def download(self, file_id: str, dest: Path) -> Path:
        info = self.call("getFile", file_id=file_id)
        path = info.get("file_path")
        if not path:
            raise TelegramError("getFile returned no file_path (file larger than 20 MB?)")
        try:
            data = request("GET", f"{API}/file/bot{self.token}/{path}", timeout=300)
        except HttpError as e:
            raise TelegramError(f"download: {e}") from None
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        return dest

    def send_document(self, filename: str, data: bytes, caption: str = "", silent=True) -> dict:
        body, ctype = multipart(
            {"chat_id": str(self.chat_id), "caption": caption, "disable_notification": "true" if silent else "false"},
            {"document": (filename, data, "application/json")},
        )
        try:
            res = json.loads(request("POST", f"{API}/bot{self.token}/sendDocument", data=body,
                                     headers={"Content-Type": ctype}, timeout=120))
        except HttpError as e:
            raise TelegramError(f"sendDocument: {e}") from None
        if not res.get("ok"):
            raise TelegramError(f"sendDocument: {res}")
        return res["result"]

    def get_chat(self) -> dict:
        return self.call("getChat", chat_id=self.chat_id)

    def pin(self, message_id: int) -> None:
        self.call("pinChatMessage", chat_id=self.chat_id, message_id=message_id, disable_notification=True)

    def unpin(self, message_id: int) -> None:
        try:
            self.call("unpinChatMessage", chat_id=self.chat_id, message_id=message_id)
        except TelegramError:
            pass
