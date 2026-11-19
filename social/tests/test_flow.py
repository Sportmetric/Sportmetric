"""End-to-end flow with fake Telegram / Instagram / TikTok (no network)."""

import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from innosocial import bot as botmod  # noqa: E402
from innosocial.bot import Bot  # noqa: E402
from innosocial.config import Config  # noqa: E402
from innosocial.store import empty_state  # noqa: E402

CHAT = "111"


class FakeTG:
    def __init__(self):
        self.sent, self.edits, self.queue, self.mid = [], {}, [], 1000

    def _m(self):
        self.mid += 1
        return {"message_id": self.mid}

    def send(self, text, **kw):
        self.sent.append((text, kw))
        return self._m()

    def ask_reply(self, text, reply_to=None):
        self.sent.append((text, {}))
        return self._m()

    def edit(self, mid, text, buttons=None):
        self.edits[mid] = (text, buttons)

    def answer_callback(self, *a):
        pass

    def send_video(self, *a):
        return self._m()

    def updates(self, offset):
        out = [u for u in self.queue if u["update_id"] >= offset]
        self.queue = []
        return out

    def download(self, file_id, dest):
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(b"\0" * 1000)
        return dest


class FakeIG:
    published = []

    def __init__(self, *a):
        pass

    def create_container(self, video, caption):
        return "C1"

    def wait_ready(self, cid):
        return "FINISHED"

    def publish(self, cid):
        FakeIG.published.append(cid)
        return {"id": "M1", "url": "https://instagram.com/reel/x"}


class FakeTT:
    def __init__(self, *a):
        pass

    def upload_draft(self, v):
        return "PUB1"

    def status(self, pid):
        return {"status": "SEND_TO_USER_INBOX"}


def upd(i, **kw):
    return {"update_id": i, **kw}


def msg(mid, **kw):
    return {"message_id": mid, "chat": {"id": int(CHAT), "type": "private"}, **kw}


class Flow(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cfg = Config(telegram_token="x", telegram_chat_id=CHAT, ig_user_id="1", meta_token="t",
                          tiktok_client_key="k", tiktok_client_secret="s", tiktok_refresh_token="r",
                          work_dir=Path(self.tmp.name))
        self.tg = FakeTG()
        FakeIG.published = []
        self.state = empty_state()
        self.t0 = 1_800_000_000.0
        mock.patch.object(botmod, "Instagram", FakeIG).start()
        mock.patch.object(botmod, "TikTok", FakeTT).start()
        mock.patch.object(botmod.media, "probe", lambda v: {"duration": 10.0}).start()
        mock.patch.object(botmod.media, "frames", lambda v, d, dur: ["f1.jpg"]).start()
        self.addCleanup(mock.patch.stopall)

    def run_tick(self, now):
        return Bot(self.cfg, self.tg, self.state, now=now).tick()

    def test_reply_before_first_draft_reaches_needs_draft(self):
        self.tg.queue = [upd(1, message=msg(5, video={"file_id": "F", "file_size": 5000})),
                         upd(2, message=msg(6, text="Tomorrow 15:25 #tt", reply_to_message={"message_id": 5}))]
        r = self.run_tick(self.t0)
        self.assertEqual(r["needs_draft"][0]["note"], "Tomorrow 15:25")
        self.assertEqual(r["needs_draft"][0]["targets"], ["tiktok"])

    def test_no_tag_asks_where_then_button_sets_platforms(self):
        self.tg.queue = [upd(1, message=msg(5, video={"file_id": "F", "file_size": 5000}, caption="hello"))]
        r = self.run_tick(self.t0)
        self.assertEqual(r["needs_draft"], [])
        p = self.state["posts"]["P1"]
        self.assertEqual(p["status"], "needs_platform")
        codes = [row[0]["callback_data"] for row in self.tg.sent[-1][1]["buttons"]]
        self.assertEqual(codes, ["gti:P1", "gt:P1", "gi:P1"])  # YouTube not configured in this test
        self.tg.queue = [upd(2, callback_query={"id": "c", "data": "gt:P1", "message": msg(p["platform_question_id"])})]
        r = self.run_tick(self.t0 + 5)
        self.assertEqual(p["targets"], ["tiktok"])
        self.assertEqual([d["id"] for d in r["needs_draft"]], ["P1"])
        self.assertEqual(r["needs_draft"][0]["brand"], "InnoMetrics")

    def test_youtube_post(self):
        published = []

        class FakeYT:
            def __init__(self, *a):
                pass

            def upload(self, video, caption, privacy, tags=None):
                published.append((caption, tags))
                return {"id": "abc", "url": "https://youtube.com/shorts/abc", "privacy": "private"}

        mock.patch.object(botmod, "YouTube", FakeYT).start()
        self.cfg.youtube_client_id, self.cfg.youtube_client_secret = "id", "sec"
        self.tg.queue = [upd(1, message=msg(5, video={"file_id": "F", "file_size": 5000}, caption="#yt cat vs printer"))]
        r = self.run_tick(self.t0)
        self.assertEqual(r["needs_draft"][0]["brand"], "Meme Town")
        b = Bot(self.cfg, self.tg, self.state, now=self.t0)
        b.propose("P1", "When the printer wins\nNobody expected this. #memes", "2027-01-15 19:00")
        self.state["posts"]["P1"]["status"] = "approved"
        self.run_tick(1_900_000_000.0)
        p = self.state["posts"]["P1"]
        self.assertEqual(p["status"], "published")
        self.assertEqual(p["platforms"]["youtube"]["url"], "https://youtube.com/shorts/abc")
        self.assertEqual(published[0][1], ["memes"])
        self.assertIn("private", self.tg.sent[-2][0])  # told the owner it stayed private

    def test_full_cycle(self):
        # 1. video arrives (plus a stranger's video, which must be ignored)
        self.tg.queue = [upd(1, message=msg(5, video={"file_id": "F", "file_size": 5000}, caption="#tt #ig new grips")),
                         upd(2, message={"message_id": 6, "chat": {"id": 999}, "video": {"file_id": "X"}})]
        r = self.run_tick(self.t0)
        self.assertEqual([d["id"] for d in r["needs_draft"]], ["P1"])
        self.assertEqual(r["needs_draft"][0]["note"], "new grips")
        self.assertEqual(r["needs_draft"][0]["instructions"], [])
        self.assertEqual(len(self.state["posts"]), 1)

        # 2. Claude proposes
        b = Bot(self.cfg, self.tg, self.state, now=self.t0)
        p = b.propose("P1", "Grip it. #innometrics", "2027-01-15 19:00")
        self.assertEqual(p["status"], "awaiting_approval")
        prev = p["preview_message_id"]

        # 3. user replies with an instruction -> needs revision
        self.tg.queue = [upd(3, message=msg(7, text="shorter please", reply_to_message={"message_id": prev}))]
        r = self.run_tick(self.t0 + 10)
        self.assertEqual(r["needs_revision"][0]["instructions"], ["shorter please"])
        # approving while an instruction is pending is refused
        self.tg.queue = [upd(4, callback_query={"id": "c", "data": "a:P1", "message": msg(prev)})]
        self.run_tick(self.t0 + 11)
        self.assertEqual(self.state["posts"]["P1"]["status"], "awaiting_approval")

        b = Bot(self.cfg, self.tg, self.state, now=self.t0 + 20)
        p = b.propose("P1", "Grip it.", None)
        new_prev = p["preview_message_id"]
        self.assertNotEqual(new_prev, prev)

        # 4. old preview buttons are ignored, new ones work
        self.tg.queue = [upd(5, callback_query={"id": "c", "data": "a:P1", "message": msg(prev)}),
                         upd(6, callback_query={"id": "c", "data": "a:P1", "message": msg(new_prev)})]
        self.run_tick(self.t0 + 30)
        self.assertEqual(self.state["posts"]["P1"]["status"], "approved")
        self.assertEqual(FakeIG.published, [])  # not due yet

        # 5. time passes -> published on both
        due = self.state["posts"]["P1"]["scheduled_at"] + 5
        r = self.run_tick(due)
        self.assertEqual(r["published"], ["P1"])
        plats = self.state["posts"]["P1"]["platforms"]
        self.assertEqual(plats["instagram"]["url"], "https://instagram.com/reel/x")
        self.assertEqual(plats["tiktok"]["status"], "done")
        self.assertEqual(self.state["tg_offset"], 7)

        # 6. nothing happens twice
        self.run_tick(due + 3600)
        self.assertEqual(FakeIG.published, ["C1"])

    def test_failure_and_retry(self):
        self.tg.queue = [upd(1, message=msg(5, video={"file_id": "F", "file_size": 5000}))]
        self.run_tick(self.t0)
        b = Bot(self.cfg, self.tg, self.state, now=self.t0)
        p = b.propose("P1", "Hi", "now")
        with mock.patch.object(FakeIG, "publish", side_effect=RuntimeError("token expired")):
            self.tg.queue = [upd(2, callback_query={"id": "c", "data": "n:P1", "message": msg(p["preview_message_id"])})]
            self.run_tick(self.t0 + 5)
        p = self.state["posts"]["P1"]
        self.assertEqual(p["status"], "failed")
        self.assertEqual(p["platforms"]["tiktok"]["status"], "done")
        self.tg.queue = [upd(3, callback_query={"id": "c", "data": "y:P1", "message": msg(9999)})]
        FakeIG.published = []
        self.run_tick(self.t0 + 100)
        self.assertEqual(p["status"], "published")
        self.assertEqual(FakeIG.published, ["C1"])  # tiktok not re-uploaded

    def test_validation(self):
        self.tg.queue = [upd(1, message=msg(5, video={"file_id": "F", "file_size": 30 * 2**20}))]
        self.run_tick(self.t0)
        self.assertEqual(self.state["posts"], {})  # too big, rejected with a message
        self.tg.queue = [upd(2, message=msg(6, video={"file_id": "F", "file_size": 10}))]
        self.run_tick(self.t0)
        b = Bot(self.cfg, self.tg, self.state, now=self.t0)
        with self.assertRaises(ValueError):
            b.propose("P1", "x", "2020-01-01 10:00")
        with self.assertRaises(ValueError):
            b.propose("P1", "#a " * 31, "2027-01-01 10:00")


class Chunks(unittest.TestCase):
    def test_plan(self):
        from innosocial.tiktok import MB, chunk_plan
        self.assertEqual(chunk_plan(3 * MB), (3 * MB, 1))
        self.assertEqual(chunk_plan(100 * MB), (10 * MB, 10))


class TagTest(unittest.TestCase):
    def test_parse_tags(self):
        from innosocial.bot import parse_tags
        self.assertEqual(parse_tags("#ig Νέα smartglasses 🔥"), (["instagram"], "Νέα smartglasses 🔥"))
        self.assertEqual(parse_tags("#yt #YT meme title"), (["youtube"], "meme title"))
        self.assertEqual(parse_tags("price #innometrics"), ([], "price #innometrics"))

    def test_youtube_title_split(self):
        from innosocial.youtube import split_caption
        t, d = split_caption("Title <b>here</b>\nline two")
        self.assertEqual(t, "Title bhere/b")
        self.assertTrue(d.endswith("#Shorts"))


class MergeTest(unittest.TestCase):
    def test_merge_keeps_latest_change_per_post(self):
        from innosocial.store import merge
        base = {"history": [{"at": 1, "event": "received"}]}
        ours = {"seq": 2, "tg_offset": 10, "tiktok": {"expires_at": 5},
                "posts": {"P1": {**base, "status": "approved", "history": base["history"] + [{"at": 3, "event": "approved"}]},
                          "P2": {**base, "status": "new"}}}
        theirs = {"seq": 2, "tg_offset": 8, "tiktok": {"expires_at": 9},
                  "posts": {"P1": {**base, "status": "awaiting_approval"},
                            "P2": {**base, "status": "awaiting_approval", "history": base["history"] + [{"at": 4, "event": "draft sent"}]}}}
        m = merge(ours, theirs)
        self.assertEqual(m["posts"]["P1"]["status"], "approved")
        self.assertEqual(m["posts"]["P2"]["status"], "awaiting_approval")
        self.assertEqual(m["tg_offset"], 10)
        self.assertEqual(m["tiktok"]["expires_at"], 9)


if __name__ == "__main__":
    unittest.main()
