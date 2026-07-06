# Launch Strategy — Voicebarn

## Pricing

**$34 one-time** (launch price; list $44).

Competitor math: ElevenLabs Creator is **$22/month** ($264/yr).
- vs monthly: **pays for itself in under 2 months** (1.5 months).
- Cheaper ElevenLabs Starter ($5/mo, 30k chars) still caps hard at 30,000 characters/month — Voicebarn has no cap at all.
- Year-2 cost: Voicebarn **$0**, ElevenLabs Creator another $264.

The unlimited-characters angle is the strongest hook: every ElevenLabs tier caps monthly characters and charges more per tier; heavy narrators (course creators, audiobook hobbyists, batch-processing dozens of scripts) hit real walls a local app doesn't have.

## Target communities (rules-aware angles)

- **r/selfhosted** (~500k) — Self-hosted culture loves local-first + open source. Angle: "Replaced my ElevenLabs subscription with a local Piper TTS desktop app (MIT)". Share the GitHub repo directly — this community converts to the paid installer well out of goodwill.
- **r/audiobookscreation** — Direct fit: per-paragraph voice control for varying character voices, batch mode for chapter-by-chapter narration. Lead with a workflow post, not a sales pitch.
- **r/YouTubeCreators / r/NewTubers** — Angle: "how I narrate faceless-channel scripts without a monthly TTS bill" — mention the free/open-source repo first, paid installer as the convenience option.
- **r/accessibility** — TTS for screen-reader-adjacent use cases; local + offline resonates for privacy-sensitive contexts (medical, legal). Lead with the privacy angle, not price.
- **r/opensource / r/software** — Straightforward "Show-off Saturday"-style posts of the repo; installer mentioned only in README.
- **Hacker News** — Show HN (draft below).
- **Indie Hackers + X (#buildinpublic)** — revenue-transparency posts do well; share launch numbers.

## Show HN draft

**Title:** Show HN: Voicebarn – local, unlimited text-to-speech desktop app (Piper TTS)

**Body:**
I make a lot of narrated video/course content and got tired of two things: paying $22/mo to ElevenLabs for a character-capped tier, and pasting unreleased scripts into a third-party cloud service.

Voicebarn is an Electron app around Piper (fast local neural TTS via ONNX runtime). You write your script as paragraphs, assign per-paragraph voice + speed overrides, drop in `<pause 500ms>` tags where you need a beat, preview any paragraph, and export WAV or MP3. There's also a batch mode: point it at a folder of .txt files and get one narrated audio file per input. First run downloads the Piper engine (~22 MB) from the official GitHub releases and your chosen voice (~60 MB) from Hugging Face's `rhasspy/piper-voices`; after that it's fully offline. No telemetry, no account.

Source is MIT: https://github.com/bensblueprints/voicebarn (npm i && npm start). I sell a packaged one-click Windows installer for $34 one-time as the convenience option.

Known limitations I'd love feedback on: this is narration-quality TTS, not voice cloning — if you need a specific person's voice, Piper isn't built for that. Only 8 starter voices are curated in the UI right now (more Piper voices exist upstream and can be wired in).

## SEO keywords (10)

1. elevenlabs alternative offline
2. local text to speech app
3. offline tts software windows
4. piper tts desktop app
5. unlimited text to speech no subscription
6. text to speech batch converter
7. private text to speech software
8. narration software one time purchase
9. txt to mp3 converter local
10. text to speech app no character limit

## AppSumo / PitchGround pitch

Voicebarn gives creators the one thing every TTS SaaS refuses to sell: ownership. It's a polished Windows desktop app that runs Piper's neural TTS 100% locally — unlimited-character narration with per-paragraph voice and speed control, inline pause tags, WAV/MP3 export, and batch folder processing, no character cap, no upload, no account. The market comparison writes its own copy: ElevenLabs Creator costs $264/year and still caps monthly characters; Voicebarn is a single lifetime license with zero caps, paying for itself in under two months. The privacy hook (creators and developers whose scripts aren't ready for a third-party cloud) drives strong word-of-mouth, and the MIT-licensed source on GitHub gives buyers long-term confidence. Lifetime-deal audiences are exactly the "pay once, own it forever" buyers this product was built for.

## Launch sequence (suggested)

1. Publish GitHub repo + README polish (portfolio doubles as landing page).
2. Show HN on a Tuesday–Thursday morning ET.
3. Product Hunt the following week (assets in `product-hunt.md`).
4. Reddit drip over 2–3 weeks per community rules above.
5. X launch thread + #buildinpublic revenue updates.
6. Pitch AppSumo/PitchGround once 50+ organic sales prove conversion.
