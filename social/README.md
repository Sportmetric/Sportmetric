# InnoMetrics social posting bot

Send a video to the Telegram bot → Claude writes an English caption and picks a time →
you approve in Telegram → it posts at that time to **TikTok** / **Instagram Reels** (InnoMetrics)
or **YouTube Shorts** (Meme Town).

Start the video's caption with where it goes: `#tt`, `#ig` (both InnoMetrics, can be combined) or `#yt` (Meme Town).
Without a tag the bot asks with buttons.

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

### 2. Instagram (Instagram API with Instagram Login - no Facebook Page token needed)
1. The Instagram account must be **Professional (Business or Creator)**.
2. developers.facebook.com → Create app → use case **"Manage messaging & content on Instagram"** →
   *API setup with Instagram business login*. Add the redirect URL
   `https://sportmetric.github.io/Sportmetric/tiktok-callback.html` under *Set up Instagram business login*.
3. Add variables `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET` (the **Instagram** app id/secret shown there).
4. Ask Claude to run `python3 -m innosocial auth instagram`: open the link, sign in, paste the one-time code back.
   The token is kept in the pinned queue file and renewed weekly (it would otherwise expire after 60 days).

### 2b. YouTube (Meme Town)
1. console.cloud.google.com → new project → enable **YouTube Data API v3**.
2. OAuth consent screen: External; add the Meme Town Google account as a test user, then **Publish app**
   (in "Testing" mode Google expires the sign-in after 7 days).
3. Credentials → OAuth client ID → *Web application*, redirect URI as above. Add `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`.
4. Ask Claude to run `python3 -m innosocial auth youtube` and sign in with the Meme Town account.
5. Until Google verifies the app (apply for the audit early), uploads stay **private**; the bot tells you, and you
   switch them to Public in YouTube Studio. Quota: about 6 uploads a day.

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
