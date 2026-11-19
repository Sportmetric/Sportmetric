"""Settings, all read from environment variables (set them in the cloud environment's settings)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from zoneinfo import ZoneInfo


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, "").strip() or default  # empty counts as unset (missing GitHub secrets are "")


@dataclass
class Config:
    telegram_token: str = field(default_factory=lambda: _env("TELEGRAM_BOT_TOKEN"))
    telegram_chat_id: str = field(default_factory=lambda: _env("TELEGRAM_CHAT_ID"))

    # Instagram. Preferred: "Instagram API with Instagram Login" - app id/secret here, and the account is
    # connected once with `python -m innosocial auth instagram` (token kept and renewed in the pinned queue file).
    instagram_app_id: str = field(default_factory=lambda: _env("INSTAGRAM_APP_ID"))
    instagram_app_secret: str = field(default_factory=lambda: _env("INSTAGRAM_APP_SECRET"))
    # Alternative: a Facebook Login / System User token for an account linked to a Facebook Page.
    meta_token: str = field(default_factory=lambda: _env("META_ACCESS_TOKEN"))
    ig_user_id: str = field(default_factory=lambda: _env("INSTAGRAM_USER_ID"))
    graph_version: str = field(default_factory=lambda: _env("META_GRAPH_VERSION", "v23.0"))

    # TikTok (Content Posting API)
    tiktok_client_key: str = field(default_factory=lambda: _env("TIKTOK_CLIENT_KEY"))
    tiktok_client_secret: str = field(default_factory=lambda: _env("TIKTOK_CLIENT_SECRET"))
    tiktok_refresh_token: str = field(default_factory=lambda: _env("TIKTOK_REFRESH_TOKEN"))
    # "draft": video lands in the TikTok app's inbox, you tap Post (works before TikTok's audit).
    # "direct": posts straight to the profile (only after TikTok approves the app).
    tiktok_mode: str = field(default_factory=lambda: _env("TIKTOK_MODE", "draft").lower())
    tiktok_privacy: str = field(default_factory=lambda: _env("TIKTOK_PRIVACY", "PUBLIC_TO_EVERYONE"))

    # YouTube (Meme Town channel): Google OAuth client; connect once with `python -m innosocial auth youtube`.
    youtube_client_id: str = field(default_factory=lambda: _env("YOUTUBE_CLIENT_ID"))
    youtube_client_secret: str = field(default_factory=lambda: _env("YOUTUBE_CLIENT_SECRET"))
    youtube_refresh_token: str = field(default_factory=lambda: _env("YOUTUBE_REFRESH_TOKEN"))
    youtube_privacy: str = field(default_factory=lambda: _env("YOUTUBE_PRIVACY", "public"))

    # One page that shows the one-time code after any sign-in (GitHub Pages).
    redirect_uri: str = field(default_factory=lambda: _env(
        "OAUTH_REDIRECT_URI", "https://sportmetric.github.io/Sportmetric/tiktok-callback.html"))

    platforms: list[str] = field(
        default_factory=lambda: [p.strip() for p in _env("PLATFORMS", "instagram,tiktok,youtube").split(",") if p.strip()]
    )
    timezone: str = field(default_factory=lambda: _env("TIMEZONE", "Europe/Athens"))
    work_dir: Path = field(
        default_factory=lambda: Path(_env("INNOSOCIAL_WORK_DIR") or Path(__file__).resolve().parent.parent / ".work")
    )
    # Optional: keep state in a local JSON file instead of Telegram (tests / local runs).
    state_file: str = field(default_factory=lambda: _env("INNOSOCIAL_STATE_FILE"))

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.timezone)

    def instagram_ready(self) -> bool:
        return bool(self.instagram_app_id or self.ig_user_id)  # a FB token may also be injected by the network proxy

    def youtube_ready(self) -> bool:
        return bool(self.youtube_client_id and self.youtube_client_secret)

    def tiktok_ready(self) -> bool:
        return bool(self.tiktok_client_key and self.tiktok_client_secret)

    def configured_platforms(self) -> list[str]:
        ready = {"instagram": self.instagram_ready(), "tiktok": self.tiktok_ready(), "youtube": self.youtube_ready()}
        return [p for p in self.platforms if ready.get(p)]

    def problems(self) -> list[str]:
        out = []
        if not self.telegram_token:
            out.append("TELEGRAM_BOT_TOKEN is not set")
        if not self.telegram_chat_id:
            out.append("TELEGRAM_CHAT_ID is not set (run `python -m innosocial setup` after messaging the bot)")
        if "instagram" in self.platforms and not self.instagram_ready():
            out.append("Instagram: INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET not set - Instagram will be skipped")
        if "youtube" in self.platforms and not self.youtube_ready():
            out.append("YouTube: YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET not set - YouTube will be skipped")
        if "tiktok" in self.platforms and not self.tiktok_ready():
            out.append("TikTok: TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET / TIKTOK_REFRESH_TOKEN not set - TikTok will be skipped")
        if self.tiktok_mode not in ("draft", "direct"):
            out.append(f"TIKTOK_MODE must be 'draft' or 'direct', got {self.tiktok_mode!r}")
        return out
