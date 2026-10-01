# MyCut 本機原稿對齊引擎

MyCut 內建已知原稿對齊，不需要 LyricFlow、Python 伺服器、HTTP 連線或額外安裝 Python。兩個字幕流程獨立運作：「輸入原稿並對齊」必須先填寫原稿，以原稿直接對齊目前時間軸的混音音訊；沒有原稿時，從左側自動字幕／自動歌詞啟動既有的自動語音辨識。Worker 會依原稿文字選擇 Whisper 語言 tokenizer（中文字用中文、日文假名用日文、韓文用韓文，其餘用英文）。

成功對齊後，時間碼直接建立在 MyCut 字幕／歌詞軌上。對齊以秒回傳，再投影到 MyCut 影格；最多產生半影格的取整誤差。預設保留原稿每一行的字幕邊界。取消、來源音訊變更檢查及專案時間軸也都由 MyCut 自行處理。

## 建置及封裝

安裝包會附帶 CPU 版 Python 對齊執行檔及 OpenAI Whisper small 模型。模型下載位置和 SHA-256 固定在 `resources/lyrics-alignment/models/manifest.json`；安裝包建置會自動驗證模型。第一次建置會下載並安裝 PyTorch、stable-ts、Whisper 與 PyInstaller 建置相依套件，磁碟會額外使用約數 GB。建置使用 CPython 3.12，也保留 3.9–3.11 相容範圍；下載後的 MyCut 不需要另外安裝 Python。

```sh
npm run lyrics-aligner:setup
npm run lyrics-aligner:build
npm run package:mac
```

若系統預設 `python3` 仍是舊版，Mac 可明確指定 `PYTHON=/完整路徑/python3.12 npm run lyrics-aligner:setup`；Windows PowerShell 可先設定 `$env:PYTHON='C:\完整路徑\python.exe'` 再執行 setup。未指定時優先使用已準備的 3.12 環境，或系統的 `python3.12`／`py -3.12`。每個 Python 次版本使用獨立的 `.build-tools/lyrics-aligner-平台-架構-py3.12` 等資料夾，保留舊環境。完成 setup 後，後續建置會自動使用專案內的 3.12 環境。

目前固定的 NumPy 1.26.4、Numba 0.60.0 與 PyTorch 2.2.2 相依組合支援到 Python 3.12，尚不接受 3.13 以上。Intel Mac 的 PyTorch 官方預編譯套件停留在 2.2 系列，不能只放寬 Python 版本檢查。相容範圍依據：[PyTorch 2.2.2 安裝檔](https://pypi.org/project/torch/2.2.2/)、[Numba 支援表](https://numba.readthedocs.io/en/0.60.0/user/installing.html)、[PyTorch Intel Mac 公告](https://dev-discuss.pytorch.org/t/pytorch-macos-x86-builds-deprecation-starting-january-2024/1690)。

建置會檢查 Python 的作業系統與 CPU 架構；`resources/lyrics-alignment/平台-架構/build-manifest.json` 記錄實際 Python 版本，版本變更會重新封裝引擎。

Windows x64 請在 Windows x64 執行 `npm run package:win`；Apple Silicon 請在 arm64 Mac 執行 `npm run package:mac:arm64`。每個目標都在相同作業系統與 CPU 架構建置其原生引擎，打包腳本會拒絕缺少目標引擎或使用錯誤主機架構，避免產生無法執行的安裝包。

開發模式可設定 `MYCUT_ALIGNMENT_BUILD_PYTHON` 指向含有 `alignment-build-requirements.txt` 的 Python 環境，再執行 `npm run lyrics-aligner:build`。MyCut 執行期間只會啟動已打包的本機程式，不讀取這個建置環境。

## 對齊流程

原稿對齊的音訊時間軸上限為 1,200 秒（20 分鐘，含邊界），以最後一段可聽片段的結尾計算。零音訊與超過時長上限會分別提示；擷取 WAV 與 worker 處理皆使用完整範圍。

`server/lyrics.ts` 使用 MyCut FFmpeg 擷取可聽音軌，套用片段裁切、位置與速度，再將 WAV 和原稿交給打包的 worker。Worker 直接載入本機 Whisper small 權重，透過 stable-ts `model.align(audio, text, language="zh")` 強制對齊原稿；不會先做 ASR，也不會把辨識文字覆寫成歌詞。有效句子加入時間軸，未定位的句子保留原文與原因，轉為「待手動校時」，不會因一行失敗而捨棄整批。零時長、無效秒數、超出音源範圍與順序錯置分別說明；無法確認原稿與模型行數對應時，保留所有原稿供手動設定，避免把後一句誤配到前一句。

「待手動校時」位於左側字幕區，可以輸入起訖秒數，或播放歌曲時以目前播放位置設定開始／結束，再試聽與逐句加入時間軸。未完成的句子隨專案儲存，手動加入可復原；不會替未定位的文字猜測時間。這些句子完成的是整句校時，逐字高亮仍可使用既有的逐字校時工具。即使取消「保留原稿分行」，部分失敗時仍保留各行供校時；全部成功時才合併。

Timeline JSON 可選帶有 `unmatched: [{ id, text, reason }]`，未定位行不含起訖時間。匯入／匯出 JSON 保留這些行；SRT 只匯出已校時句子，介面會提醒剩餘數量。

stable-ts 的時間碼取至毫秒，WAV 長度則以取樣數計算；尾端若只因取整超出最多半毫秒，會裁回實際音源結尾。較大的超出、零時長與反序仍轉為手動校時。

`shared/lyrics-timeline.ts` 是 MyCut 維護的秒數 JSON 合約，`shared/lyrics-adapter.ts` 負責轉成 MyCut Cue。安裝包不含 LyricFlow 程式碼或 npm 套件。自動辨識仍使用原有 MyCut `whisper-cli` 流程。

執行測試：

```sh
npm run typecheck
npm test
python3 tests/lyrics-worker.test.py
npx playwright test tests/ui/lyrics.spec.ts
```

強制對齊會定位「與原稿相符的內容」，不會替錯誤、漏字或未唱出的原稿創造正確位置。歌唱、背景人聲、長間奏與混音可能降低模型信心；完成後請播放並檢查時間軸，必要時拖曳微調。當前安裝包使用 CPU 推論，處理時間取決於歌曲長度和電腦效能。
