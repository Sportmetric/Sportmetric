# Hourly run - instructions for Claude

This file is the job description for the scheduled task that runs every hour.
Python does all the API work; your part is **writing captions, choosing times, and applying the owner's replies**.

## Steps

1. Get the code and run the check:
   ```bash
   cd Sportmetric 2>/dev/null || git clone https://github.com/sportmetric/sportmetric Sportmetric && cd Sportmetric
   BR=${BR:-main}   # the scheduled task's prompt names the branch to use
   git fetch -q origin "$BR" && git checkout -q FETCH_HEAD
   cd social && python3 -m innosocial tick > /tmp/tick.json; echo "exit $?"; cat /tmp/tick.json
   ```
   If `tick` fails, send the error to the owner and stop:
   `echo "<short description of the error>" | python3 -m innosocial notify-error`

2. For **each item in `needs_draft`**:
   - Look at every image in `frames` (Read tool) and read `note` (what the owner typed with the video).
   - Write the caption (rules below) to a file, choose a time (rules below), then:
     `python3 -m innosocial propose P7 --caption-file /tmp/P7.txt --time "2026-11-20 19:00"`
   - If the item has an `error` (video couldn't be downloaded), don't propose: tell the owner with
     `echo "P7: <error>" | python3 -m innosocial notify-error` and move on.

3. For **each item in `needs_revision`**: apply every message in `instructions` (oldest first).
   They may change the caption ("shorter", "mention 20% off", or a full new caption to use word for word),
   the time ("Friday 19:00", "tomorrow morning"), or both. Then `propose` again:
   pass `--time` only when the time changes. A full caption the owner typed is used exactly as written.

4. Do nothing else: no commits, no other messages. If `needs_draft` and `needs_revision` are both empty, you're done.

## Caption rules (English)

- Brand: **InnoMetrics**. Friendly, confident, short. No corporate filler.
- Line 1 is the hook (it's all people see before "more"): max ~70 characters, no hashtags.
- Then 1-3 short lines on what's in the video and why it matters. One clear call to action
  (e.g. "Link in bio", "Order on Skroutz", "DM us") only if it fits the note.
- 1-3 emojis at most.
- End with 3-6 hashtags on their own line: always `#innometrics`, plus specific ones for what's in the video.
  Never more than 30 hashtags (hard limit).
- **Never invent facts**: no prices, discounts, specs, dates or claims that aren't in the note or clearly visible in the video.
- Same caption goes to Instagram and TikTok.

## Time rules (Europe/Athens time - the `now` field is already in that zone)

- If the note asks for a time or day, use it (if it's in the past, take the next possible slot and mention nothing).
- Otherwise pick the next free slot that is **at least 3 hours from now** (the owner needs time to approve):
  - Mon-Fri: 13:00 or 19:30
  - Sat-Sun: 11:30 or 20:00
- At most one post per day; check `booked` and skip days that already have one.
- Format for `--time`: `YYYY-MM-DD HH:MM`.
