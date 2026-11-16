r"""Core logic of one run: read Telegram, react to buttons/replies, publish what's due.

Post lifecycle:
  new -> (Claude drafts caption + time) -> awaiting_approval -> approved -> published
                                              |                    \-> failed (Retry button)
                                              \-> rejected
Replies to a draft ("make it shorter", "Friday 19:00") are queued as instructions for Claude.
"""

from __future__ import annotations

import html
import time
from datetime import datetime, timedelta
from pathlib import Path

from . import media
from .config import Config
from .instagram import Instagram, InstagramError
from .telegram import Telegram
from .tiktok import TikTok, TikTokError

MAX_BOT_DOWNLOAD = 20 * 1024 * 1024
FINAL = {"published", "rejected"}
LABEL = {"instagram": "Instagram", "tiktok": "TikTok"}


def esc(s: str) -> str:
    return html.escape(s or "", quote=False)


class Bot:
    def __init__(self, cfg: Config, tg: Telegram, state: dict, now: float | None = None):
        self.cfg = cfg
        self.tg = tg
        self.state = state
        self._now = now
        self.report = {"needs_draft": [], "needs_revision": [], "published": [], "errors": [], "notes": []}

    # --- helpers ----------------------------------------------------------------
    def now(self) -> float:
        return self._now if self._now is not None else time.time()

    def fmt_time(self, ts: float | None) -> str:
        if not ts:
            return "not set"
        return datetime.fromtimestamp(ts, self.cfg.tz).strftime("%a %d %b, %H:%M")

    def parse_time(self, text: str) -> float:
        text = text.strip()
        if text.lower() == "now":
            return self.now()
        dt = datetime.fromisoformat(text.replace(" ", "T", 1) if "T" not in text else text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=self.cfg.tz)
        return dt.timestamp()

    def post(self, pid: str) -> dict:
        p = self.state["posts"].get(pid)
        if not p:
            raise KeyError(f"unknown post {pid}")
        return p

    def log(self, p: dict, event: str) -> None:
        p.setdefault("history", []).append({"at": self.now(), "event": event})

    def video_path(self, p: dict) -> Path:
        path = self.cfg.work_dir / p["id"] / "video.mp4"
        if not path.exists():
            self.tg.download(p["source"]["file_id"], path)
        return path

    def booked(self) -> list[dict]:
        return [{"id": p["id"], "at": self.fmt_time(p.get("scheduled_at")), "status": p["status"]}
                for p in self.state["posts"].values()
                if p["status"] in ("awaiting_approval", "approved") and p.get("scheduled_at")]

    # --- Telegram intake ----------------------------------------------------------
    def process_updates(self) -> None:
        offset = self.state.get("tg_offset", 0)
        while True:
            ups = self.tg.updates(offset)
            if not ups:
                break
            for u in ups:
                offset = u["update_id"] + 1
                try:
                    self.handle_update(u)
                except Exception as e:  # one bad update must not block the queue
                    self.report["errors"].append(f"update {u['update_id']}: {e}")
            self.state["tg_offset"] = offset

    def _authorized(self, chat_id) -> bool:
        return str(chat_id) == str(self.cfg.telegram_chat_id)

    def handle_update(self, u: dict) -> None:
        if "callback_query" in u:
            cq = u["callback_query"]
            if self._authorized(cq.get("message", {}).get("chat", {}).get("id")):
                self.handle_button(cq)
            return
        msg = u.get("message") or {}
        if not self._authorized(msg.get("chat", {}).get("id")):
            return
        vid = msg.get("video")
        doc = msg.get("document") or {}
        if not vid and doc.get("mime_type", "").startswith("video/"):
            vid = doc
        if vid:
            self.new_video(msg, vid)
        elif msg.get("text", "").startswith("/"):
            self.command(msg["text"].split()[0].split("@")[0].lower())
        elif msg.get("text"):
            self.reply_text(msg)

    def new_video(self, msg: dict, vid: dict) -> None:
        if (vid.get("file_size") or 0) > MAX_BOT_DOWNLOAD:
            self.tg.send("⚠️ That video is over 20 MB, which is the most a Telegram bot can download. "
                         "Send it as a normal video (not as a file) so Telegram compresses it, or trim it.",
                         reply_to=msg["message_id"])
            return
        self.state["seq"] += 1
        pid = f"P{self.state['seq']}"
        p = {"id": pid, "status": "new", "created_at": self.now(), "note": msg.get("caption", ""),
             "source": {k: vid.get(k) for k in ("file_id", "file_unique_id", "file_size", "duration", "width", "height")},
             "video_message_id": msg["message_id"], "caption": "", "scheduled_at": None,
             "instructions": [], "platforms": {}, "preview_message_id": None, "prompt_message_ids": []}
        self.state["posts"][pid] = p
        self.log(p, "received")
        self.tg.send(f"🎬 Got it - <b>{pid}</b>. Drafting a caption and a time; the preview is coming within the hour.",
                     reply_to=msg["message_id"], silent=True)

    def _post_for_message(self, message_id: int) -> dict | None:
        for p in self.state["posts"].values():
            if message_id == p.get("preview_message_id") or message_id in p.get("prompt_message_ids", []) \
                    or message_id == p.get("video_message_id"):
                return p
        return None

    def reply_text(self, msg: dict) -> None:
        target = (msg.get("reply_to_message") or {}).get("message_id")
        p = self._post_for_message(target) if target else None
        if p is None:
            # A note typed right after a video belongs to that video.
            fresh = [q for q in self.state["posts"].values() if q["status"] == "new"]
            if len(fresh) == 1:
                p = fresh[0]
                p["note"] = (p["note"] + "\n" + msg["text"]).strip()
                return
            self.tg.send("I couldn't tell which post that's for. <b>Reply</b> (swipe left) to the post's draft "
                         "message, or tap ✏️ / 🕒 under it.", reply_to=msg["message_id"])
            return
        if p["status"] in FINAL:
            self.tg.send(f"{p['id']} is already {p['status']}.", reply_to=msg["message_id"])
            return
        p["instructions"].append(msg["text"])
        if p["status"] == "approved":  # changing an approved post sends it back for approval
            p["status"] = "awaiting_approval"
        self.log(p, f"instruction: {msg['text'][:80]}")
        self.tg.send(f"📝 Noted for {p['id']} - a new draft is on its way.", reply_to=msg["message_id"], silent=True)

    def command(self, cmd: str) -> None:
        if cmd in ("/queue", "/q"):
            rows = [p for p in self.state["posts"].values() if p["status"] not in FINAL]
            if not rows:
                self.tg.send("Queue is empty. Send me a video to get started.")
                return
            rows.sort(key=lambda p: p.get("scheduled_at") or 9e12)
            lines = [f"<b>{p['id']}</b> · {p['status'].replace('_', ' ')} · {self.fmt_time(p.get('scheduled_at'))}\n"
                     f"   {esc((p.get('caption') or p.get('note') or '').splitlines()[0][:70] if (p.get('caption') or p.get('note')) else '')}"
                     for p in rows]
            self.tg.send("🗓 <b>Upcoming</b>\n" + "\n".join(lines))
        elif cmd == "/start":
            self.tg.send("👋 InnoMetrics posting bot.\n\n" + HELP)
        else:
            self.tg.send(HELP)

    # --- buttons ----------------------------------------------------------------
    def handle_button(self, cq: dict) -> None:
        action, _, pid = (cq.get("data") or "").partition(":")
        p = self.state["posts"].get(pid)
        mid = cq.get("message", {}).get("message_id")
        if not p:
            self.tg.answer_callback(cq["id"], "Unknown post")
            return
        if action != "y" and mid != p.get("preview_message_id"):
            self.tg.answer_callback(cq["id"], "That draft is outdated - use the newest one.")
            if p["status"] not in FINAL:
                self.tg.send(f"⚠️ That's an older draft of {p['id']}. Tap the buttons on the newest one (this message's reply).",
                             reply_to=p.get("preview_message_id"), html=False)
            return
        if action == "a" and p["status"] == "awaiting_approval" and not p["instructions"]:
            p["status"] = "approved"
            self.log(p, "approved")
            self.tg.answer_callback(cq["id"], "Approved")
            self.refresh_preview(p)
            self.confirm(p, f"✅ {p['id']} approved - it goes out {self.fmt_time(p['scheduled_at'])}.")
        elif action == "n" and p["status"] in ("awaiting_approval", "approved"):
            p["status"] = "approved"
            p["scheduled_at"] = self.now()
            self.log(p, "approved: post now")
            self.tg.answer_callback(cq["id"], "Posting now")
            self.refresh_preview(p)
            self.confirm(p, f"🚀 {p['id']} - posting now.")
        elif action in ("e", "t") and p["status"] not in FINAL:
            ask = ("✏️ <b>Reply to this message</b> with the new caption, or say what to change "
                   "(e.g. <i>shorter, mention the price, more energetic</i>)." if action == "e" else
                   "🕒 <b>Reply to this message</b> with the new time, e.g. <i>Friday 19:00</i> or <i>tomorrow 12:30</i>.")
            m = self.tg.ask_reply(f"{p['id']}: {ask}", reply_to=mid)
            p["prompt_message_ids"].append(m["message_id"])
            self.tg.answer_callback(cq["id"])
        elif action == "r" and p["status"] not in FINAL:
            p["status"] = "rejected"
            self.log(p, "rejected")
            self.tg.answer_callback(cq["id"], "Rejected")
            self.refresh_preview(p)
            self.confirm(p, f"❌ {p['id']} rejected - it won't be posted.")
        elif action == "y" and p["status"] == "failed":
            for plat in p["platforms"].values():
                if plat["status"] == "failed":
                    plat.update(status="pending", error="")
            p["status"] = "approved"
            p["scheduled_at"] = self.now()
            self.log(p, "retry")
            self.tg.answer_callback(cq["id"], "Retrying")
            self.confirm(p, f"🔁 {p['id']} - trying again now.")
        else:
            self.tg.answer_callback(cq["id"], f"Can't do that - {p['id']} is {p['status'].replace('_', ' ')}.")

    def confirm(self, p: dict, text: str) -> None:
        self.tg.send(text, reply_to=p.get("preview_message_id"), html=False)

    def buttons(self, p: dict):
        if p["status"] == "awaiting_approval":
            return [[{"text": "✅ Approve", "callback_data": f"a:{p['id']}"},
                     {"text": "🚀 Post now", "callback_data": f"n:{p['id']}"}],
                    [{"text": "✏️ Edit caption", "callback_data": f"e:{p['id']}"},
                     {"text": "🕒 Change time", "callback_data": f"t:{p['id']}"},
                     {"text": "❌ Reject", "callback_data": f"r:{p['id']}"}]]
        if p["status"] == "approved":
            return [[{"text": "🚀 Post now", "callback_data": f"n:{p['id']}"},
                     {"text": "✏️ Edit", "callback_data": f"e:{p['id']}"},
                     {"text": "🕒 Time", "callback_data": f"t:{p['id']}"},
                     {"text": "❌ Cancel", "callback_data": f"r:{p['id']}"}]]
        return None

    def preview_text(self, p: dict) -> str:
        head = {"awaiting_approval": "📝 <b>Draft {id}</b> - waiting for your approval",
                "approved": "✅ <b>{id} approved</b>", "rejected": "❌ <b>{id} rejected</b>",
                "published": "🎉 <b>{id} published</b>", "failed": "⚠️ <b>{id} failed</b>"}.get(
            p["status"], "<b>{id}</b>").format(id=p["id"])
        plats = ", ".join(LABEL.get(x, x) for x in (p["platforms"] or self.cfg.configured_platforms())) or "no platform configured"
        tk = " (TikTok: to your drafts)" if "tiktok" in (p["platforms"] or self.cfg.configured_platforms()) \
            and self.cfg.tiktok_mode == "draft" else ""
        return (f"{head}\n🕒 {self.fmt_time(p.get('scheduled_at'))}\n📱 {plats}{tk}\n\n"
                f"{esc(p['caption'])}")

    def refresh_preview(self, p: dict) -> None:
        if p.get("preview_message_id"):
            self.tg.edit(p["preview_message_id"], self.preview_text(p), buttons=self.buttons(p))

    # --- drafting (called by Claude via `propose`) ----------------------------------
    def propose(self, pid: str, caption: str, when: str | None) -> dict:
        p = self.post(pid)
        if p["status"] in FINAL:
            raise ValueError(f"{pid} is {p['status']}")
        caption = caption.strip()
        if not caption:
            raise ValueError("empty caption")
        if len(caption) > 2200:
            raise ValueError(f"caption is {len(caption)} chars; Instagram/TikTok max is 2200")
        if caption.count("#") > 30:
            raise ValueError("more than 30 hashtags (Instagram limit)")
        if when:
            ts = self.parse_time(when)
            if ts < self.now() - 60:
                raise ValueError(f"time {self.fmt_time(ts)} is in the past")
            p["scheduled_at"] = ts
        if not p.get("scheduled_at"):
            raise ValueError("no time given")
        old = p.get("preview_message_id")
        p.update(caption=caption, status="awaiting_approval", instructions=[])
        if old:
            self.tg.edit(old, f"↩️ <i>Older draft of {p['id']} - see the new one below.</i>")
        self.tg.send_video(p["source"]["file_id"], f"{p['id']} · {self.fmt_time(p['scheduled_at'])}")
        m = self.tg.send(self.preview_text(p), buttons=self.buttons(p))
        p["preview_message_id"] = m["message_id"]
        self.log(p, "draft sent")
        return p

    def prepare_draft_inputs(self, p: dict) -> dict:
        item = {"id": p["id"], "note": p.get("note", ""), "received": self.fmt_time(p["created_at"]),
                "instructions": p.get("instructions", [])}  # owner replies sent before the first draft
        try:
            v = self.video_path(p)
            info = media.probe(v)
            item.update(video=str(v), **info,
                        frames=media.frames(v, self.cfg.work_dir / p["id"], info.get("duration") or p["source"].get("duration") or 0))
        except Exception as e:
            item["error"] = f"could not download/inspect video: {e}"
        return item

    # --- publishing ---------------------------------------------------------------
    def publish_due(self) -> None:
        for p in sorted(self.state["posts"].values(), key=lambda p: p.get("scheduled_at") or 0):
            if p["status"] == "approved" and p.get("scheduled_at") and p["scheduled_at"] <= self.now():
                self.publish(p)
            elif p["status"] == "publishing":
                self.publish(p)  # resume a run that was cut off

    def publish(self, p: dict) -> None:
        if not p["platforms"]:
            plats = self.cfg.configured_platforms()
            if not plats:
                self.report["errors"].append(f"{p['id']}: no platform configured; not publishing")
                return
            p["platforms"] = {x: {"status": "pending"} for x in plats}
        p["status"] = "publishing"
        for name, st in p["platforms"].items():
            if st["status"] in ("done", "failed"):
                continue
            try:
                if name == "instagram":
                    self._instagram(p, st)
                elif name == "tiktok":
                    self._tiktok(p, st)
            except (InstagramError, TikTokError, Exception) as e:
                st.update(status="failed", error=str(e)[:500])
                self.log(p, f"{name} failed: {str(e)[:120]}")
        states = {s["status"] for s in p["platforms"].values()}
        if states <= {"done"}:
            p["status"] = "published"
            self.report["published"].append(p["id"])
            links = "\n".join(f"• {LABEL[n]}: {s.get('url') or s.get('note') or 'done'}" for n, s in p["platforms"].items())
            self.tg.send(f"🎉 <b>{p['id']} is live</b>\n{links}")
        elif "failed" in states and not (states & {"pending", "processing", "uploaded"}):
            p["status"] = "failed"
            errs = "\n".join(f"• {LABEL[n]}: {esc(s.get('error', ''))[:300]}" for n, s in p["platforms"].items()
                             if s["status"] == "failed")
            ok = [LABEL[n] for n, s in p["platforms"].items() if s["status"] == "done"]
            self.tg.send(f"⚠️ <b>{p['id']} didn't fully publish</b>" + (f" (done: {', '.join(ok)})" if ok else "") +
                         f"\n{errs}", buttons=[[{"text": "🔁 Retry failed", "callback_data": f"y:{p['id']}"}]])
            self.report["errors"].append(f"{p['id']}: {errs}")
        # else: something is still processing on the platform side - picked up next run
        self.refresh_preview(p)

    def _instagram(self, p: dict, st: dict) -> None:
        ig = Instagram(self.cfg.meta_token, self.cfg.ig_user_id, self.cfg.graph_version)
        if st["status"] == "publishing" and not st.get("container_id"):
            raise InstagramError("a previous run was interrupted mid-publish; check Instagram before retrying")
        if not st.get("container_id"):
            st["status"] = "publishing"
            st["container_id"] = ig.create_container(self.video_path(p), p["caption"])
            st["status"] = "processing"
        code = ig.wait_ready(st["container_id"])
        if code != "FINISHED":
            st["status"] = "processing"
            return
        st["status"] = "publishing"
        res = ig.publish(st["container_id"])
        st.update(status="done", media_id=res["id"], url=res["url"])
        self.log(p, "instagram published")

    def _tiktok(self, p: dict, st: dict) -> None:
        tt = TikTok(self.cfg.tiktok_client_key, self.cfg.tiktok_client_secret, self.state.setdefault("tiktok", {}),
                    self.cfg.tiktok_refresh_token)
        if st["status"] == "publishing" and not st.get("publish_id"):
            raise TikTokError("a previous run was interrupted mid-upload; check TikTok before retrying")
        if not st.get("publish_id"):
            st["status"] = "publishing"
            st["mode"] = self.cfg.tiktok_mode
            if st["mode"] == "direct":
                st["publish_id"] = tt.direct_post(self.video_path(p), p["caption"], self.cfg.tiktok_privacy)
            else:
                st["publish_id"] = tt.upload_draft(self.video_path(p))
            st["status"] = "uploaded"
        for _ in range(12):
            s = tt.status(st["publish_id"])
            status = s.get("status", "")
            if status == "FAILED":
                raise TikTokError(f"TikTok processing failed: {s.get('fail_reason')}")
            if st["mode"] == "draft" and status in ("SEND_TO_USER_INBOX", "PUBLISH_COMPLETE"):
                st.update(status="done", note="in your TikTok inbox - open TikTok to finish posting")
                self.tg.send(f"📲 <b>{p['id']} is waiting in TikTok.</b> Open TikTok → inbox notification → "
                             "edit → paste the caption below → Post.")
                self.tg.send(esc(p["caption"]))
                self.log(p, "tiktok sent to drafts")
                return
            if status == "PUBLISH_COMPLETE":
                ids = s.get("publicaly_available_post_id") or []
                st.update(status="done", url=f"https://www.tiktok.com/video/{ids[0]}" if ids else "")
                self.log(p, "tiktok published")
                return
            time.sleep(10)
        st["status"] = "uploaded"  # still processing; check again next run

    # --- one full run -----------------------------------------------------------
    def tick(self, quick: bool = False) -> dict:
        """quick=True: buttons, replies and due posts only (the frequent GitHub run); drafting is left to Claude."""
        self.process_updates()
        self.publish_due()
        for p in self.state["posts"].values():
            if p["status"] == "new":
                self.report["needs_draft"].append({"id": p["id"]} if quick else self.prepare_draft_inputs(p))
            elif p["instructions"] and p["status"] not in FINAL:
                self.report["needs_revision"].append({
                    "id": p["id"], "caption": p["caption"], "scheduled_at": self.fmt_time(p.get("scheduled_at")),
                    "note": p.get("note", ""), "instructions": p["instructions"]})
        self.report["booked"] = self.booked()
        self.report["now"] = self.fmt_time(self.now())
        self.report["timezone"] = self.cfg.timezone
        return self.report


HELP = ("How it works:\n"
        "1. Send me a video (add a note in the caption if you like: product, offer, when to post).\n"
        "2. I draft a caption and a time and send you a preview.\n"
        "3. Tap ✅ Approve - it posts at that time. Or ✏️ / 🕒 to change things, by replying.\n\n"
        "Button taps and replies are picked up within about 10 minutes; new drafts within the hour.\n"
        "/queue - upcoming posts")
