"""Regression checks for partial alignment; no model download or fabricated audio inference."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest

spec = importlib.util.spec_from_file_location("worker", Path(__file__).resolve().parents[1] / "tools/lyrics-aligner/worker.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class Converter:
    def convert(self, text):
        return text


def aligned(text, start, end, words=None):
    return SimpleNamespace(text=text, start=start, end=end, words=words or [])


def build(texts, segments, duration=10, preserve_lines=True):
    return worker.build_timeline([{"text": text, "units": list(text)} for text in texts],
                                 segments, duration, Converter(), preserve_lines)


class PartialAlignmentTests(unittest.TestCase):
    def test_millisecond_rounding_at_audio_end_is_clipped_without_losing_words(self):
        duration = 14.2119375
        word = SimpleNamespace(word="歸", start=14, end=14.212, probability=.9)
        result = build(["歸"], [aligned("歸", 14, 14.212, [word])], duration)
        self.assertNotIn("unmatched", result)
        self.assertEqual(result["segments"][0]["end"], duration)
        self.assertEqual(result["segments"][0]["words"][0]["end"], duration)
        result = build(["歸"], [aligned("歸", 14, 14.213)], duration)
        self.assertEqual(result["segments"], [])
        self.assertIn("時間超出", result["unmatched"][0]["reason"])

    def test_line_93_failure_preserves_earlier_and_later_lines(self):
        texts = ["歌詞{}".format(index) for index in range(94)]
        segments = [aligned(text, index, index + .5) for index, text in enumerate(texts)]
        segments[92] = aligned(texts[92], 95, 96)
        result = build(texts, segments, 94)
        self.assertEqual(len(result["segments"]), 93)
        self.assertEqual(result["segments"][-1]["id"], 94)
        self.assertEqual(result["unmatched"][0]["id"], 93)
        self.assertIn("時間超出", result["unmatched"][0]["reason"])
        self.assertNotIn("start", result["unmatched"][0])

    def test_zero_reverse_and_nonfinite_times_have_distinct_reasons(self):
        result = build(["零", "反", "無", "好"], [aligned("零", 1, 1), aligned("反", 2, 1),
                       aligned("無", float("nan"), 3), aligned("好", 4, 5)])
        self.assertEqual([s["text"] for s in result["segments"]], ["好"])
        self.assertIn("未取得有效時長", result["unmatched"][0]["reason"])
        self.assertIn("未回傳有效秒數", result["unmatched"][2]["reason"])

    def test_missing_result_retains_every_original_line(self):
        result = build(["副歌", "副歌", "尾聲"], [])
        self.assertEqual(result["segments"], [])
        self.assertEqual([s["id"] for s in result["unmatched"]], [1, 2, 3])

    def test_mismatched_segment_count_never_shifts_repeated_lyrics(self):
        result = build(["副歌", "副歌", "尾聲"], [aligned("副歌", 1, 2), aligned("尾聲", 4, 5)])
        self.assertEqual(len(result["unmatched"]), 3)

    def test_unlocated_word_marks_whole_line_for_manual_review(self):
        word = SimpleNamespace(word="月", start=1, end=1, probability=.8)
        result = build(["月", "歸"], [aligned("月", 1, 2, [word]), aligned("歸", 3, 4)])
        self.assertEqual(result["unmatched"][0]["id"], 1)
        self.assertEqual(result["segments"][0]["id"], 2)

    def test_text_mismatch_and_overlap_do_not_discard_other_lines(self):
        result = build(["月", "歸", "風", "雨"], [aligned("月", 1, 3), aligned("歸", 2, 4),
                       aligned("錯", 4, 5), aligned("雨", 6, 7)])
        self.assertEqual([s["id"] for s in result["segments"]], [1, 4])
        self.assertEqual([s["id"] for s in result["unmatched"]], [2, 3])

    def test_partial_result_keeps_lines_even_when_merging_requested(self):
        result = build(["月", "歸"], [aligned("月", 1, 2), aligned("歸", 3, 3)], preserve_lines=False)
        self.assertEqual(result["segments"][0]["text"], "月")
        self.assertEqual(result["unmatched"][0]["text"], "歸")

    def test_complete_merged_result_preserves_word_times(self):
        words = [SimpleNamespace(word=text, start=start, end=start+1, probability=.9)
                 for text, start in [("月", 1), ("歸", 3)]]
        result = build(["月", "歸"], [aligned("月", 1, 2, [words[0]]), aligned("歸", 3, 4, [words[1]])],
                       preserve_lines=False)
        self.assertEqual(result["segments"][0]["text"], "月 歸")
        self.assertEqual(len(result["segments"][0]["words"]), 2)


if __name__ == "__main__":
    unittest.main()
