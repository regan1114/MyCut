# MyCut 0.6.11：Mac／Windows

共用 TypeScript、React 與 Electron 程式碼；影片、特效、字型、字幕和歌詞在本機處理。每個平台使用自己的 FFmpeg、ffprobe、Skia、resvg 和 whisper.cpp 原生執行檔，沒有把 Mac 二進位檔直接搬到 Windows。

0.6.1 統一為黑灰＋白色介面，Mac 與 Windows 共用相同配色。

0.6.2 的「建立新專案」直接建立「未命名專案」，預設 16:9（1920 × 1080）、30 fps。

0.6.3 在編輯器關閉視窗時，先儲存專案並回到檔案管理。

0.6.4 內建 40 款字型；最愛與預設字型儲存在各電腦的本機資料目錄，不依賴瀏覽器的連線埠。

0.6.5 精簡首頁與左側功能列；圖示支援滑鼠停留及鍵盤聚焦提示，進階特效設定可收合。

0.6.10 統一左側功能、右側屬性：特效參數移右側，分離音訊與所選歌詞 LRC 匯出移左側，移除重複屬性及新增入口。

0.6.9 簡化字幕屬性：分頁順序為「字幕」、「文字」，字幕清單負責選取與定位，文字分頁集中編輯及歌詞校時。

0.6.8 優化預覽文字快取、按需載入字型、直式預覽解析度與資源回收；字幕搜尋保留篩選，修正時間軸取消及離開後的拖曳清理。

0.6.7 加入面板寬度拖曳與最小限制、文字片段的字幕功能／清單分頁，以及依內容更新的時間軸標籤。

0.6.6 新增片段依軌道末端接續、同軌碰撞限制；字型改放右側文字屬性，以字型名稱預覽。

0.6.11 新增 12 種效果，總計 40 種特效與 53 張示意圖；預覽與本機匯出共用 Canvas 渲染。

## 使用方式

- Mac Intel：開啟 `release/mac/MyCut.app`。
- Mac Apple Silicon：開啟 `release/mac-arm64/MyCut.app`。
- 專案資料夾中的 `啟動 MyCut.command` 會優先選擇本機 Mac 架構。
- Windows：執行 `release/MyCut-0.6.11-Windows-x64-Setup.exe`，完成後從桌面或開始功能表開啟 MyCut。安裝可選位置，預設為目前使用者，不需另外安裝 C++ 執行階段。
- Windows ZIP：將 `release/MyCut-0.6.11-Windows-x64.zip` **完整解壓縮**後執行 `MyCut.exe`，不可只取出單一 EXE。若使用整個原始碼資料夾，也可執行 `啟動 MyCut.cmd`。

目標系統為 macOS 14+（Intel x64／Apple Silicon）、Windows 11 x64（Intel／AMD）。CPU 語音引擎的 x64 版本需要 AVX2。Windows ARM／Snapdragon 不在此版支援與測試範圍。尚未提供 Apple 公證與 Windows 發行者簽章。

## 平台差異

| 項目 | Mac | Windows |
| --- | --- | --- |
| 視窗 | Mac 紅黃綠按鈕、可拖曳標題列 | Windows 標準標題列、最小化／最大化／關閉 |
| 快捷鍵 | Command Z／Shift Z、B、D、S、E | Ctrl Z／Shift Z、B、D、S、E；另支援 Ctrl Y |
| H.264 匯出 | 軟體編碼、Apple VideoToolbox | 軟體編碼 libx264 |
| 編輯器關閉視窗 | 儲存後回到檔案管理，工作繼續 | 儲存後回到檔案管理，工作繼續 |
| 檔案管理中執行工作時關閉視窗 | 繼續背景處理，可從 Dock 返回 | 縮小至工作列，工作繼續處理 |
| 專案資料 | `~/Library/Application Support/MyCut/workspace/` | `%APPDATA%\MyCut\workspace\` |

Windows 硬體編碼（NVIDIA／AMD／Intel GPU）未在本版加入；CPU 匯出與特效功能相同。40 款 OFL 字型、53 張示意圖和 Whisper Small Q5_1 模型隨應用程式提供，不需另下載。Windows C++ 執行階段放在應用程式目錄，不修改系統 DLL。

再次啟動同一資料目錄的應用程式會聚焦既有視窗，避免兩個程序同時寫入專案。檔名會處理 Windows 保留字和不允許的符號。原生資源路徑支援兩種分隔符；語音引擎內嵌 UTF-8 manifest，以處理中文使用者名稱和資料夾。

`.mycut.json` 仍是剪輯設定，**不是包含所有素材的可攜式專案包**。兩個系統使用相同剪輯格式，但素材 ID 仍依賴本機媒體庫；只傳 JSON 不會連同素材庫一起傳送。0.6.0 可從桌面版「打包完整專案」產生 `.mycutpack`，包含原始素材與剪輯設定。目的電腦從「開啟專案檔」還原，會重建素材 ID 與本機路徑；原始位置不需存在。此格式在 Mac／Windows 使用同一套串流讀寫程式，跨系統實機往返仍待 Windows 環境驗證。

## 一小時影片

保留原生 FFmpeg 最多 10 秒分段、串流背壓、暫停續跑、工作快照、磁碟空間預檢及完稿長度檢查。Windows 不走瀏覽器 WASM，也不把一小時影片全部載入記憶體。

既有 Mac 一小時驗證是 320×180／24 fps、86,400 影格，包含早期 12 種擴充特效（頻譜、柔光等，不包含 0.6.11 新增效果）；不是 1080p／4K 效能保證。Windows 的完整一小時匯出仍須在 Windows 環境執行驗證。

## 建置

需要 Node.js 22+；Mac 編譯語音引擎另需 CMake、Xcode Command Line Tools。Windows 不需 C++ 編譯器，使用固定版本、校驗 SHA-256 的官方語音引擎。

```sh
npm ci
npm run speech:install
npm run desktop
npm run package:mac:x64
npm run package:mac:arm64
npm run package:win
```

Windows 執行瀏覽器測試前需先執行 `npx playwright install chromium`，或透過 `PLAYWRIGHT_CHROME_PATH` 指向已安裝的 Chrome。

Mac 封裝須在 Mac 執行；Windows 可以在 Windows 或 Mac 封裝。交叉建置在 `.build-staging/<平台>-<架構>/` 重新安裝對應原生模組，不修改開發環境的 `node_modules`。各版本內只含所需平台的語音引擎與 ffprobe。

`.github/workflows/desktop.yml` 提供手動啟動的 Windows x64、Mac Intel、Mac Apple Silicon 原生建置／測試工作；可選一小時特效測試。此工作流程已寫入本機，**尚未推送或在 GitHub 執行**。它產生測試用 artifacts，不發布正式版本。

0.6.0 新增 `npm run test:workflow` 與 `npm run test:portable:desktop`，驗證時段特效與完整專案包；CI 也已加入這兩項。

## 驗證狀態

- 0.6.11：46 項核心測試、25 項介面案例與優化後 3 項特效重測通過。40 種效果完成 720p／4 秒實際匯出、分段比較、取消清理與暫停續跑；新增效果的一小時位置倒帶像素一致，未重新輸出完整一小時影片。
- 0.6.10：24 項介面案例通過（含歌詞匯出入口重測），驗證左側操作與右側參數、全片與時段特效分離、音訊分離及復原、關鍵影格與逐字 LRC 內容。Intel Mac 最終封裝版的左右分工、字幕文字、字型與最小寬度亦通過實際操作驗證。

- 0.6.9：22 項介面案例通過（歌詞案例於封裝完成後重測），Intel Mac 封裝版確認字幕分頁只保留清單、字幕在前、文字在後，內容與歌詞校時由文字分頁編輯。核心與原生匯出沿用 0.6.8 紀錄。

- 0.6.8：42 項核心測試、22 項瀏覽器案例通過；涵蓋文字快取與字型載入量測、畫布預算、直式歌詞、搜尋保留及時間軸手勢清理。Intel Mac 最終封裝版的介面、40 款字型、最愛重啟及 720p 文字／歌詞匯出通過。
- 0.6.7：42 項核心測試與 18 項瀏覽器案例全數通過；涵蓋面板拖曳／最小寬度／縮小視窗、字幕清單與功能入口、即時文字標籤和 1,201 句一小時清單搜尋。Intel Mac 最終封裝版的面板／字幕／時間軸與最小寬度回歸通過，見 `interface-darwin-x64-test-result.json`。
- 0.6.6：42 項單元／原生小型測試與 15 項瀏覽器案例全數通過；Intel Mac 封裝版確認文字接續、右側字型與最愛重啟，720p 分軌交叉溶解／文字匯出通過。見 `interface-darwin-x64-test-result.json`、`fonts-darwin-x64-test-result.json`、`placement-export-test-result.json`。Mac／Windows 套件已同步更新，並完成架構與資源檢查。

- 0.6.5 通過 14 項瀏覽器操作案例（含新案例定位修正後重測），Intel Mac 封裝版通過圖示名稱、停用按鈕提示、Tab／Esc、收合設定與 1120×740 視窗邊界檢查；見 `interface-darwin-x64-test-result.json`，可執行 `npm run test:interface:desktop` 重現。Mac／Windows 三套件均比對最新介面程式與樣式；原生影音處理沿用既有版本的測試記錄。

- 0.6.4 Intel Mac 封裝版通過 40 款字型載入、最愛重啟保存、新專案預設與 720p 文字／歌詞匯出；見 `fonts-darwin-x64-test-result.json`，可執行 `npm run test:fonts:desktop` 重現。三平台的字型檔、授權與 CSS 均逐一比對校驗。
- 0.6.3 已在 Intel Mac 封裝版驗證關閉編輯器返回首頁、儲存失敗重試與背景匯出，見 `close-editor-darwin-x64-test-result.json`。可用 `npm run test:close:desktop` 在對應平台重現。

- 0.6.2 的一鍵建立流程已通過首頁測試與 Intel Mac 封裝版操作驗證，見 `quick-create-test-result.json`。

- 0.6.1 新配色通過 12 項瀏覽器操作測試與 Intel Mac 封裝版畫面檢查，見 `theme-test-result.json`。33 項單元／原生小型測試沿用 0.6.0 的通過記錄。Windows 介面分支測試只驗證 Ctrl 快捷鍵、配置和編碼器選單，不能取代 Windows 實機測試。
- 實際 720p 短片、多種特效、暫停續跑及中英文 DTW 逐字時間已在 Mac 通過。
- Windows 封裝靜態檢查：EXE 與兩個原生 Node 模組為 x64 PE、字型 40 款、示意圖 53 張、模型 SHA-256、語音 DLL／執行階段及 UTF-8 manifest。結果見 `windows-package-test-result.json`。
- 0.6.0 Mac 封裝原生功能驗證已通過，記錄於 `desktop-darwin-x64-test-result.json`；包含原生選檔、中文資料路徑、快捷鍵、另存檔名、字幕、逐字時間、特效與匯出。兩個 Mac 架構的 Mach-O、系統函式庫、最低 OS 版本與 ad-hoc 簽章亦通過靜態檢查，結果見 `mac-packages-test-result.json`。
- **Windows／Apple Silicon 實際啟動與原生執行仍需各自機器驗證**，目前這台 Intel Mac 無法代替該項驗證。

Windows 試用請確認：安裝與啟動、中文路徑匯入、音畫播放、麥克風錄音、自動字幕／歌詞、短片匯出、暫停續跑、關閉編輯器回到檔案管理、從檔案管理關閉後由工作列返回。完整原生自動驗證可執行 `npm run test:desktop`，報告會標記實際平台與架構。
