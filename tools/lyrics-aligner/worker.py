#!/usr/bin/env python3
"""MyCut's local known-lyrics aligner. This process never transcribes audio."""

import json
import math
import os
import sys
import wave
from pathlib import Path
from types import SimpleNamespace


def emit(**event):
    print(json.dumps(event, ensure_ascii=False), flush=True)


def normalize(text, converter):
    return "".join(char.upper() for char in converter.convert(text) if char.isalnum())


def infer_language(text):
    if any("\u3040" <= char <= "\u30ff" for char in text):
        return "ja"
    if any("\uac00" <= char <= "\ud7af" for char in text):
        return "ko"
    if any("\u3400" <= char <= "\u9fff" for char in text):
        return "zh"
    return "en"


def build_timeline(lines, aligned_segments, duration, converter, preserve_lines=True):
    """Keep valid lines and retain failures as untimed text for manual correction."""
    segments, unmatched = [], []
    previous_end = 0
    count_matches = len(aligned_segments) == len(lines)
    # stable-ts rounds timestamps to milliseconds; WAV duration is sample-accurate.
    def bounded_end(value):
        return duration if 0 < value - duration <= 0.0005 else value

    for index, source in enumerate(lines, 1):
        aligned = aligned_segments[index - 1] if count_matches else None
        if aligned is not None:
            aligned = SimpleNamespace(
                start=aligned.start, end=bounded_end(aligned.end), text=aligned.text,
                words=[SimpleNamespace(word=word.word, start=word.start, end=bounded_end(word.end),
                                       probability=word.probability) for word in aligned.words or []],
            )
        reason = None
        if aligned is None:
            reason = "模型未能確認這行的位置，請手動設定時間。"
        elif normalize(aligned.text, converter) != normalize(source["text"], converter):
            reason = "模型回傳的文字未完整對應原稿，請手動設定時間。"
        elif not (math.isfinite(aligned.start) and math.isfinite(aligned.end)):
            reason = "模型未回傳有效秒數，請手動設定時間。"
        elif aligned.end <= aligned.start:
            reason = "未取得有效時長（開始 {:.3f} 秒，結束 {:.3f} 秒）。".format(aligned.start, aligned.end)
        elif aligned.start < 0 or aligned.end > duration:
            reason = "時間超出音源範圍（{:.3f}–{:.3f} 秒；音源 {:.6f} 秒）。".format(aligned.start, aligned.end, duration)
        elif aligned.start < previous_end:
            reason = "時間與前一句重疊或順序不符，請手動設定時間。"
        elif any(not math.isfinite(word.start) or not math.isfinite(word.end) or word.end <= word.start
                 for word in aligned.words or [] if normalize(word.word, converter)):
            reason = "這行部分字詞未取得有效時長，請手動確認整句時間。"
        if reason:
            unmatched.append({"id": index, "text": source["text"], "reason": reason})
            continue

        words, position = [], 0
        for word in aligned.words or []:
            token = normalize(word.word, converter)
            if not token:
                continue
            matched, display = "", ""
            while position < len(source["units"]) and len(matched) < len(token):
                unit = source["units"][position]
                position += 1
                matched += normalize(unit, converter)
                display += unit
            last_end = words[-1]["end"] if words else aligned.start
            if matched != token or not last_end <= word.start < word.end <= aligned.end:
                words = []
                break
            words.append({"text": display, "start": word.start, "end": word.end})

        segment = {"id": index, "start": aligned.start, "end": aligned.end, "text": source["text"]}
        probabilities = [word.probability for word in aligned.words or []
                         if word.probability is not None and math.isfinite(word.probability)
                         and 0 <= word.probability <= 1]
        if probabilities:
            segment["confidence"] = sum(probabilities) / len(probabilities)
        if words and "".join(word["text"] for word in words) == source["text"]:
            segment["words"] = words
        segments.append(segment)
        previous_end = aligned.end

    # A partial result keeps its original lines so each failure can be timed separately.
    if not preserve_lines and not unmatched and segments:
        text = " ".join(line["text"].strip() for line in lines)
        merged = SimpleNamespace(start=segments[0]["start"], end=segments[-1]["end"], text=text,
                                 words=[word for segment in aligned_segments for word in (segment.words or [])])
        return build_timeline([{"text": text, "units": list(text)}], [merged], duration, converter)
    project = {"version": "1.0.0", "mode": "known_lyrics", "duration": duration, "segments": segments}
    if unmatched:
        project["unmatched"] = unmatched
    return project


def timeline(audio_path, model_path, lines, preserve_lines):
    import numpy as np
    import stable_whisper
    import torch
    from opencc import OpenCC

    with wave.open(str(audio_path), "rb") as wav:
        if wav.getnchannels() != 1 or wav.getframerate() != 16000 or wav.getsampwidth() != 2:
            raise ValueError("對齊音訊格式錯誤，請使用 16 kHz 單聲道 PCM。")
        samples = (
            np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2").astype(np.float32)
            / 32768
        )
    duration = len(samples) / 16000
    if not duration or np.max(np.abs(samples), initial=0) < 0.0001:
        raise ValueError("音訊沒有可對齊的聲音。")

    emit(type="progress", stage="loading_alignment", percent=10, message="載入本機對齊模型…")
    torch.set_num_threads(min(4, os.cpu_count() or 1))
    try:
        model = stable_whisper.load_model(str(model_path), device="cpu")
    except Exception as error:
        emit(
            type="error",
            code="MODEL_LOAD_FAILED",
            message="MyCut 的歌詞對齊模型無法載入。",
            details=str(error),
            suggestion="重新安裝 MyCut，確認對齊模型檔案完整。",
        )
        return None

    emit(type="progress", stage="alignment", percent=20, message="正在依原稿對齊音源…")
    language = infer_language("".join(line["text"] for line in lines))
    result = model.align(
        samples,
        "\n".join(line["text"] for line in lines),
        language=language,
        original_split=True,
        regroup=False,
        verbose=None,
        max_word_dur=3,
        word_dur_factor=2,
        failure_threshold=None,
        progress_callback=lambda seek, total: emit(
            type="progress",
            stage="alignment",
            percent=20 + round(70 * min(1, seek / max(total, 0.001))),
            message="正在依原稿對齊音源…",
        ),
    )
    return build_timeline(
        lines, list(result.segments) if result is not None else [],
        duration, OpenCC("t2s"), preserve_lines,
    )


def main():
    try:
        request = json.load(sys.stdin)
        audio_path = Path(request["audio"])
        model_path = Path(request["model"])
        lines = request["lines"]
        if not audio_path.is_file():
            raise FileNotFoundError("找不到 MyCut 擷取的音訊檔。")
        if not model_path.is_file():
            raise FileNotFoundError("找不到 MyCut 內建的歌詞對齊模型。")
        project = timeline(
            audio_path,
            model_path,
            lines,
            request.get("preserve_lines", True),
        )
        if project is not None:
            emit(type="result", project=project)
    except Exception as error:
        emit(
            type="error",
            code="ALIGNMENT_RUNTIME_FAILED",
            message="MyCut 本機歌詞對齊失敗。",
            details=str(error),
            suggestion="重新啟動 MyCut；若持續發生，請重新安裝應用程式。",
        )
        sys.exit(1)


if __name__ == "__main__":
    import multiprocessing
    multiprocessing.freeze_support()
    main()
