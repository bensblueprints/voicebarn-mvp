# Voicebarn

## Demo



https://github.com/user-attachments/assets/aeb71488-5c3a-4c6e-88df-478c47797110



[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Unlimited natural-sounding text-to-speech on your own machine. Pay once, own it forever. No subscription. Your text never leaves your computer.**

Voicebarn is a desktop app built around [Piper](https://github.com/rhasspy/piper), a fast local neural TTS engine — per-paragraph voice and speed control, inline pause tags, WAV/MP3 export, and batch conversion of whole folders of `.txt` files. No upload, no account, no per-character bill.

![Screenshot](docs/screenshot.png)

## ☕ Skip the setup — get the 1-click installer

Don't want to touch a terminal? Grab the packaged Windows installer (one-time purchase, lifetime updates):

**→ [https://whop.com/benjisaiempire/voicebarn](https://whop.com/benjisaiempire/voicebarn)**

The source here is MIT-licensed and always will be — the installer is just the convenient, pre-packaged version.

## Features

- 🎙️ **Local neural TTS via Piper** — clean, natural narration voices, 100% offline after first run
- 📝 **Per-paragraph control** — every paragraph in a document gets its own voice + speed override (0.5x–2.0x), inheriting document defaults when left blank
- ⏸️ **SSML-lite pauses** — drop `<pause 500ms>` or `[pause 0.5s]` anywhere inside your text for a precise, sample-rate-matched silence gap; honestly documented (see below) — this is **not** full SSML
- ▶️ **Instant preview** — synthesize and play any single paragraph before you export, with results cached by content hash
- 💾 **WAV or MP3 export** — MP3 via bundled ffmpeg with a bitrate picker (128/192/256/320 kbps)
- 📦 **Batch mode** — point it at a folder of `.txt` files and get one narrated audio file per input, blank line = paragraph = pause
- 🌍 **8 curated starter voices** — English (US/UK), German, Spanish, French — all medium-quality Piper voices, each downloaded once from Hugging Face
- 📁 **Projects** — save/reload documents as local JSON, no cloud sync required
- 🔒 **100% private** — no telemetry, no network calls except the one-time engine + voice downloads (clearly surfaced in the UI)

## What "SSML-lite" actually means

Piper does not support SSML. Voicebarn does **not** pretend otherwise. The only markup it understands is an inline pause token:

```
Welcome to the show. <pause 500ms> Let's get started.
Second sentence here. [pause 1s] Third sentence.
```

Everything else — `<prosody>`, `<break>`, `<emphasis>`, phoneme tags, etc. — is plain text and will be read aloud literally. If you need real SSML, Piper isn't the right engine; Voicebarn is honest about that trade for the "unlimited and free forever" positioning.

## Quick start

```bash
git clone https://github.com/bensblueprints/voicebarn
cd voicebarn
npm i
npm start
```

On first launch the app downloads (with a visible progress bar):

1. The **Piper** Windows engine (~22 MB) from the official GitHub releases
2. Your **default voice** (~60 MB) from Hugging Face (`rhasspy/piper-voices`)

After that, everything runs offline. Additional voices can be added any time from the Voice Manager tab.

## How it compares

| | **Voicebarn** | ElevenLabs (Creator) |
|---|---|---|
| Price | **$34 one-time** | $22/month, forever |
| Cost after 1 year | **$34** | ~$264 |
| Characters | **Unlimited** | 100,000/mo cap |
| Privacy | **Text never leaves your PC** | Uploaded to their cloud |
| Works offline | **Yes** | No |
| Voice cloning | No — clean neural narration voices only | Yes (different product category) |
| Batch folder processing | **Yes** | Limited/paid tier |
| Per-paragraph voice/speed | **Yes** | No |
| Account required | **No** | Yes |

*Honest framing: Voicebarn is not a voice-clone tool. Piper's neural voices are clean, natural, and great for narration, videos, audiobooks, IVR prompts, and accessibility — not celebrity impressions.* Pays for itself in about 2 months vs. the Creator tier.

## Tech stack

- **Electron** — main + preload + renderer, plain HTML/CSS/JS (no framework bloat)
- **[Piper](https://github.com/rhasspy/piper)** — fast local neural TTS (ONNX runtime under the hood), CPU-native
- **ffmpeg-static** — bundled ffmpeg handles MP3 encoding and any sample-rate resampling needed at concat time
- **rhasspy/piper-voices** — official Piper voice models on Hugging Face

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Launch the app |
| `npm test` | End-to-end smoke test: downloads the real Piper binary + a real voice, synthesizes audio, verifies speed control, pause tokens, multi-paragraph export, MP3 encoding, and batch mode |
| `npm run dist` | Build the Windows NSIS installer (electron-builder) |

## Privacy

No telemetry. No analytics. No network calls at all except the one-time downloads above (Piper binary from GitHub, voice models from Hugging Face), both clearly surfaced in the UI. Projects, previews, and exports are stored as plain files in your local app-data folder.

## License

[MIT](LICENSE) © 2026 Ben (bensblueprints)

## macOS build

See [MAC-BUILD.md](MAC-BUILD.md). Quickest path: GitHub **Actions** tab -> run the **Mac Build** (`mac-build.yml`) workflow to get a downloadable `.dmg` (unsigned - right-click -> Open on first launch).
