"""Command line used by the hourly Claude run (see PLAYBOOK.md)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .bot import Bot
from .config import Config
from .store import FileStore, TelegramStore
from .telegram import Telegram


def _setup(cfg: Config):
    problems = [p for p in cfg.problems() if "skipped" not in p]
    if problems:
        sys.exit("Not configured: " + "; ".join(problems))
    tg = Telegram(cfg.telegram_token, cfg.telegram_chat_id)
    store = FileStore(cfg.state_file) if cfg.state_file else TelegramStore(tg)
    return tg, store


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="innosocial")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("setup", help="check settings; list chats that messaged the bot")
    tk = sub.add_parser("tick", help="one run: read Telegram, publish due posts, print what needs drafting (JSON)")
    tk.add_argument("--quick", action="store_true", help="skip preparing drafts (frequent automatic run)")
    pr = sub.add_parser("propose", help="send a caption + time draft for approval")
    pr.add_argument("post_id")
    g = pr.add_mutually_exclusive_group(required=True)
    g.add_argument("--caption")
    g.add_argument("--caption-file")
    pr.add_argument("--time", help="'YYYY-MM-DD HH:MM' in the configured timezone (default: keep current)")
    sub.add_parser("status", help="print the queue (JSON)")
    sub.add_parser("notify-error", help="send a message from stdin to the Telegram chat")
    a = ap.parse_args(argv)
    cfg = Config()

    if a.cmd == "setup":
        return setup(cfg)

    tg, store = _setup(cfg)
    if a.cmd == "notify-error":
        tg.send("⚠️ Posting bot: " + sys.stdin.read()[:3500], html=False)
        return 0
    state = store.load()
    bot = Bot(cfg, tg, state)
    before = json.dumps(state, sort_keys=True)
    try:
        if a.cmd == "tick":
            out = bot.tick(quick=a.quick)
        elif a.cmd == "propose":
            cap = Path(a.caption_file).read_text() if a.caption_file else a.caption
            p = bot.propose(a.post_id, cap, a.time)
            out = {"ok": True, "id": p["id"], "scheduled": bot.fmt_time(p["scheduled_at"])}
        else:
            out = {"posts": state["posts"], "booked": bot.booked()}
    finally:
        if json.dumps(state, sort_keys=True) != before:
            store.save(state)
    print(json.dumps(out, ensure_ascii=False, indent=1))
    return 0


def setup(cfg: Config) -> int:
    for p in cfg.problems():
        print("•", p)
    if not cfg.telegram_token:
        return 1
    tg = Telegram(cfg.telegram_token, cfg.telegram_chat_id)
    me = tg.call("getMe")
    print(f"Bot: @{me['username']}")
    if not cfg.telegram_chat_id:
        chats = {}
        for u in tg.updates(0):  # does not acknowledge, so nothing is lost
            c = (u.get("message") or {}).get("chat") or {}
            if c.get("type") == "private":
                chats[c["id"]] = c.get("first_name", "") + " " + (c.get("username") or "")
        print("Private chats that messaged the bot (use your id as TELEGRAM_CHAT_ID):")
        for cid, name in chats.items():
            print(f"  {cid}  {name}")
        if not chats:
            print("  none yet - open the bot in Telegram, press Start, then run this again")
    if cfg.instagram_ready():
        from .instagram import Instagram
        try:
            print("Instagram:", Instagram(cfg.meta_token, cfg.ig_user_id, cfg.graph_version).whoami())
        except Exception as e:
            print("Instagram check failed:", e)
    if cfg.tiktok_ready():
        from .tiktok import TikTok
        try:
            tt_state = {}
            if cfg.telegram_chat_id and not cfg.state_file:
                tt_state = dict(TelegramStore(tg).load().get("tiktok") or {})  # token from the pinned queue file
            info = TikTok(cfg.tiktok_client_key, cfg.tiktok_client_secret, tt_state, cfg.tiktok_refresh_token).creator_info()
            print("TikTok:", info.get("creator_username"), "privacy options:", info.get("privacy_level_options"))
        except Exception as e:
            print("TikTok check failed:", e)
    return 0
