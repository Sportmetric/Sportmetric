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
    au = sub.add_parser("auth", help="connect an account: prints a sign-in link; then run again with --code")
    au.add_argument("platform", choices=["instagram", "youtube", "tiktok"])
    au.add_argument("--code", help="the one-time code shown on the callback page after signing in")
    a = ap.parse_args(argv)
    cfg = Config()

    if a.cmd == "setup":
        return setup(cfg)
    if a.cmd == "auth":
        return auth(cfg, a.platform, a.code)

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
    saved = TelegramStore(tg).load() if cfg.telegram_chat_id and not cfg.state_file else {}
    if cfg.instagram_ready():
        from .instagram import Instagram
        try:
            ig = saved.get("instagram") or {}
            if cfg.instagram_app_id and not ig.get("token") and not cfg.meta_token:
                raise RuntimeError("not connected yet - run `python3 -m innosocial auth instagram`")
            print("Instagram:", Instagram(ig.get("token") or cfg.meta_token, ig.get("user_id") or cfg.ig_user_id,
                                          cfg.graph_version).whoami())
        except Exception as e:
            print("Instagram check failed:", e)
    if cfg.tiktok_ready():
        from .tiktok import TikTok
        try:
            tt_state = dict(saved.get("tiktok") or {})  # token from the pinned queue file
            info = TikTok(cfg.tiktok_client_key, cfg.tiktok_client_secret, tt_state, cfg.tiktok_refresh_token).creator_info()
            print("TikTok:", info.get("creator_username"), "privacy options:", info.get("privacy_level_options"))
        except Exception as e:
            print("TikTok check failed:", e)
    if cfg.youtube_ready():
        from .youtube import YouTube
        try:
            ch = YouTube(cfg.youtube_client_id, cfg.youtube_client_secret, dict(saved.get("youtube") or {}),
                         cfg.youtube_refresh_token).channel()
            print("YouTube:", ch.get("title"))
        except Exception as e:
            print("YouTube check failed:", e)
    return 0


def auth(cfg: Config, platform: str, code: str | None) -> int:
    """Sign-in link, then one-time code -> long-lived token saved in the pinned queue file (never printed)."""
    import secrets
    import time
    import urllib.parse
    from . import instagram as iglib, youtube as ytlib
    from .http import request_json

    if not code:
        st = secrets.token_urlsafe(9)
        if platform == "instagram":
            print(iglib.auth_url(cfg.instagram_app_id, cfg.redirect_uri, st))
        elif platform == "youtube":
            print(ytlib.auth_url(cfg.youtube_client_id, cfg.redirect_uri, st))
        else:
            print("https://www.tiktok.com/v2/auth/authorize/?" + urllib.parse.urlencode({
                "client_key": cfg.tiktok_client_key, "scope": "user.info.basic,video.upload,video.publish",
                "response_type": "code", "redirect_uri": cfg.redirect_uri, "state": st}))
        return 0
    code = urllib.parse.unquote(code.strip())
    tg, store = _setup(cfg)
    state = store.load()
    if platform == "instagram":
        res = iglib.exchange_code(cfg.instagram_app_id, cfg.instagram_app_secret, code, cfg.redirect_uri)
        state["instagram"] = {**res, "renewed_at": time.time()}
        who = iglib.Instagram(res["token"], res["user_id"], cfg.graph_version).whoami()
        msg = f"Instagram connected: @{who.get('username')} ({who.get('account_type')})"
    elif platform == "youtube":
        res = ytlib.exchange_code(cfg.youtube_client_id, cfg.youtube_client_secret, code, cfg.redirect_uri)
        state["youtube"] = {"refresh_token": res["refresh_token"], "access_token": res["access_token"],
                            "expires_at": time.time() + int(res.get("expires_in", 3600))}
        ch = ytlib.YouTube(cfg.youtube_client_id, cfg.youtube_client_secret, state["youtube"]).channel()
        msg = f"YouTube connected: {ch.get('title') or '(no channel found)'}"
    else:
        res = request_json("POST", "https://open.tiktokapis.com/v2/oauth/token/", form={
            "client_key": cfg.tiktok_client_key, "client_secret": cfg.tiktok_client_secret, "code": code,
            "grant_type": "authorization_code", "redirect_uri": cfg.redirect_uri})
        if "refresh_token" not in res:
            sys.exit(f"TikTok code exchange failed: { {k: v for k, v in res.items() if 'token' not in k} }")
        state.setdefault("tiktok", {}).update(access_token=res["access_token"], refresh_token=res["refresh_token"],
                                              expires_at=time.time() + int(res.get("expires_in", 86400)),
                                              open_id=res.get("open_id"))
        msg = "TikTok connected"
    store.save(state)
    tg.send("🔗 " + msg, html=False)
    print(msg)
    return 0
