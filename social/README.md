# InnoMetrics social posting bot

Send a video to the InnoMetrics Telegram bot → Claude writes an English caption and picks a time →
you approve in Telegram → it posts to **Instagram Reels** and **TikTok** at that time.

```
You ──video──▶ Telegram bot ──▶ hourly Claude run ──▶ draft + buttons in Telegram
                                   │                     ✅ Approve  🚀 Post now
                                   │                     ✏️ Edit  🕒 Time  ❌ Reject
                                   └── at the scheduled time ──▶ Instagram Reel (automatic)
                                                              └▶ TikTok (drafts → you tap Post;
                                                                 automatic after TikTok's audit)
```

- A Claude **scheduled task every hour** writes captions and picks times; no server to host.
- A free **GitHub Actions** check every 10 minutes (`.github/workflows/social-bot.yml`, on the repository's default branch)
  handles button taps and replies, confirms them with a message, and publishes posts that are due.
  It needs repository secrets `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`
  (and later `META_ACCESS_TOKEN`, `INSTAGRAM_USER_ID`). GitHub pauses scheduled workflows after 60 days without repository activity.
- The queue is stored in the Telegram chat as a pinned JSON file. **Don't unpin or delete it.**
- Videos: send as a normal Telegram video (not "as file"), max 20 MB, 3 s - 10 min, vertical 9:16 is best.
- Code: `innosocial/` (Python, standard library only). Claude's instructions: `PLAYBOOK.md`. Tests: `python3 -m unittest discover -s tests`.

## Setup

All settings are **environment variables** on the cloud environment **"InnoMetrics social"**
(claude.ai/code → environment menu → InnoMetrics social → Edit → Environment variables).
Type the secret values there yourself, never in a chat.

### 1. Telegram bot (5 min)
1. In Telegram, open **@BotFather** → `/newbot` → name it e.g. *InnoMetrics Posting* → copy the token.
2. Add variable `TELEGRAM_BOT_TOKEN` = that token.
3. Open your new bot in Telegram and press **Start**.
4. Ask Claude to run `python3 -m innosocial setup`; it prints your chat id → add `TELEGRAM_CHAT_ID`.
   Only this chat can use the bot; everyone else is ignored.

### 2. Instagram (20-30 min)
1. The Instagram account must be **Professional (Business or Creator)** and **linked to a Facebook Page**
   (Instagram app → Settings → Account type; then link the Page in Meta Business Suite).
2. At developers.facebook.com create an app (type *Business*), add the **Instagram** product
   ("API setup with Facebook login").
3. Get a token with `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`,
   `business_management`. Best: a **System User token** in Business Settings → Users → System users
   (it doesn't expire). A normal long-lived user token expires after 60 days.
4. Find the Instagram user id: Graph API Explorer → `me/accounts?fields=instagram_business_account`.
5. Add variables `META_ACCESS_TOKEN` and `INSTAGRAM_USER_ID`.

### 3. TikTok (30 min + TikTok's review)
1. At developers.tiktok.com create an app, add **Login Kit** and **Content Posting API**,
   scopes `video.upload` (drafts) and `video.publish` (direct posting). Fill in the app details and submit for review.
2. Authorize the app once with the InnoMetrics TikTok account and exchange the code for tokens
   (Claude can walk you through this; it needs a redirect URL you control, or TikTok's web "Sandbox" testers).
3. Add variables `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REFRESH_TOKEN`.
   The bot renews the 24-hour access token itself; a renewed refresh token is kept in the pinned queue file.
4. Until the audit passes, videos go to your **TikTok inbox/drafts** and the bot sends you the caption to paste.
   After approval, add `TIKTOK_MODE` = `direct` and posts go straight to the profile.

### 4. Turn it on
Ask Claude: *"Create the hourly scheduled task for the social bot."* It runs `PLAYBOOK.md` every hour in a fresh
session on the "InnoMetrics social" environment.

### Optional settings
| Variable | Default | |
|---|---|---|
| `PLATFORMS` | `instagram,tiktok` | Drop one to pause it |
| `TIMEZONE` | `Europe/Athens` | For times in drafts |
| `TIKTOK_MODE` | `draft` | `direct` after TikTok's audit |
| `TIKTOK_PRIVACY` | `PUBLIC_TO_EVERYONE` | For direct mode |
| `META_GRAPH_VERSION` | `v23.0` | |

## Telegram commands
`/queue` upcoming posts · `/help` how it works. Reply to a draft with any change in plain English.
