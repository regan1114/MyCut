# Third-party components

MyCut is a local video editor, not affiliated with CapCut or ByteDance. The interface and demo illustration in this repository are original implementations.

## Fonts

All 40 font families under `public/fonts/` are redistributed unmodified under the SIL Open Font License 1.1. Each family includes its original `OFL.txt` copyright and license notice and upstream `METADATA.pb` (Google Fonts) or `README.md` (ChenYuluoyan). `manifest.json` records the upstream source and SHA-256 hash of every font file. These fonts allow commercial video use under the OFL terms. Fonts may not be sold by themselves. The font licenses do not impose a license on the videos created with them.

Sources: https://openfontlicense.org/, https://github.com/google/fonts (39 families), and https://github.com/Chenyu-otf/chenyuluoyan_thin (ChenYuluoyan 2.0). ChenYuluoyan is redistributed without modifying the font binary; its original copyright and Reserved Font Names are retained.

## Media engine

The application launches FFmpeg and ffprobe as separate local processes. `ffmpeg-static` is GPL-3.0-or-later; the bundled macOS and Windows FFmpeg 6.1.1 binaries was built with GPL components, including libx264. Original license files are retained in the packaged `node_modules/ffmpeg-static` directory. Intel Mac and Windows ffprobe are obtained from `ffprobe-static`; its notices remain in that package. Apple Silicon uses the native ARM64 FFprobe 4.4.1 in `@ffprobe-installer/darwin-arm64` 5.0.1 (LGPL-2.1), whose package metadata and README are retained. Its source is FFmpeg 4.4.1: https://ffmpeg.org/releases/ffmpeg-4.4.1.tar.xz . This avoids the mislabeled Intel binary in the arm64 directory of ffprobe-static 3.1.0.

Upstream binary/build sources:

- https://github.com/eugeneware/ffmpeg-static (release b6.1.1)
- https://github.com/joshwnj/ffprobe-static
- https://evermeet.cx/ffmpeg/
- https://ffmpeg.org/download.html
- https://ffmpeg.org/legal.html

The current build is for local use. Before distributing a commercial application, provide the exact corresponding sources and notices for the binaries and their included libraries, and review the selected codec distribution terms. Font commercial-use permission does not replace those separate software distribution obligations.

## Other runtime components

- Electron: MIT, https://github.com/electron/electron
- React / React DOM: MIT, https://github.com/facebook/react
- Express: MIT, https://github.com/expressjs/express
- Busboy: MIT, https://github.com/mscdex/busboy
- Zod: MIT, https://github.com/colinhacks/zod
- Lucide: ISC, https://github.com/lucide-icons/lucide
- resvg-js: MIT, https://github.com/yisibl/resvg-js (resvg: MPL-2.0)

Original dependency license files are retained in installed packages. See `package-lock.json` for exact resolved versions.

## Offline speech recognition

- whisper.cpp 1.8.6, MIT: https://github.com/ggml-org/whisper.cpp/tree/v1.8.6 . Original license: `resources/speech/whisper-LICENSE.txt`.
- OpenAI Whisper weights, MIT; GGML Small Q5_1 distribution: https://huggingface.co/ggerganov/whisper.cpp . Original license: `resources/speech/model-LICENSE.txt`. Pinned model size and SHA-256: `resources/speech/manifest.json`.
- OpenCC-JS 1.4.2, MIT, with dictionary data licenses: `node_modules/opencc-js/LICENSE`, `LICENSES/Apache-2.0.txt`, and `THIRD_PARTY_LICENSES.md`. Used for Traditional Chinese conversion.

Reproduce the engine and verify model integrity with `npm run speech:install`. macOS requires CMake and a C/C++ compiler. Windows x64 uses the official whisper.cpp v1.8.6 CPU release, verified by SHA-256; its executable manifest is modified to select UTF-8 for paths. Source: https://github.com/ggml-org/whisper.cpp/releases/tag/v1.8.6 . The modified binary hash is recorded in its platform manifest.

## Known-lyrics alignment

MyCut bundles a separate native Python alignment worker and OpenAI Whisper small checkpoint for direct forced alignment. It runs offline and is not a LyricFlow service dependency.

- stable-ts 2.19.1, MIT: https://github.com/jianfch/stable-ts . License: `resources/lyrics-alignment/licenses/stable-ts-MIT.txt`.
- OpenAI Whisper 20250625 code and small model checkpoint, MIT: https://github.com/openai/whisper . License: `resources/lyrics-alignment/licenses/OpenAI-Whisper-MIT.txt`; model URL, SHA-256 and source are in `resources/lyrics-alignment/models/manifest.json`.
- PyTorch 2.2.2 and torchaudio 2.2.2, BSD-3-Clause: notices in `resources/lyrics-alignment/licenses/PyTorch-BSD-3-Clause.txt`, `PyTorch-NOTICE.txt`, and `torchaudio-BSD.txt`.
- OpenCC-Python-Reimplemented 0.1.7, MIT; NumPy 1.26.4, BSD; Numba 0.60.0 and llvmlite 0.43.0, BSD; tiktoken 0.14.0, MIT. License files and third-party notices are included under `resources/lyrics-alignment/licenses/`.
- PyInstaller 6.15.0 is a build-time tool; its compiled bootloader is used by the worker executable. Its GPL terms and bootloader exception are included as `resources/lyrics-alignment/licenses/PyInstaller-COPYING.txt`. PyInstaller hooks are build-time only.

Pre-trained Demucs separation weights are not distributed. The source repository labels its code MIT, while the upstream issue about licensing the separate pre-trained weights does not establish a redistribution grant ([upstream model-license discussion](https://github.com/facebookresearch/demucs/issues/327)). MyCut conservatively leaves that optional model and UI choice out of the installer.

Microsoft Visual C++ v14 runtime DLLs are deployed beside the Windows application and speech engine, without changing the system installation. Copyright Microsoft Corporation. Original runtime license: https://aka.ms/VCRedistLicense . Fixed download URL and original DLL SHA-256 hashes: `resources/windows-runtime/x64/manifest.json`. These DLLs retain their original signatures and are not covered by the application or Whisper MIT licenses.

## Atmosphere effects

Atmosphere effect designs were adapted at the workspace owner’s request from the adjacent `lyric_flow` project: `web/src/engine/passes/drawAtmosphere.ts`, `drawBranding.ts`, `drawBackground.ts`, `particles.ts`, `grading.ts`, and `rhythm.ts`. MyCut uses its own deterministic timeline animation and audio-envelope sampler. No song assets or other project files are bundled. Elven particles use the already bundled OFL Noto Sans TC font.

- `@napi-rs/canvas`: MIT, https://github.com/Brooooooklyn/canvas ; Skia-based native Canvas renderer. Original package notices are included in `node_modules/@napi-rs/`.
