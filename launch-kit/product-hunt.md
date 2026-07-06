# Product Hunt Launch — Voicebarn

## Name
Voicebarn

## Tagline (60 chars max)
Unlimited offline text-to-speech — pay once, narrate forever.
<!-- 60 chars -->

## Description (260 chars max)
Voicebarn turns any script into clean, natural narration — 100% on your machine via Piper TTS. Per-paragraph voice/speed control, pause tags, WAV/MP3 export, batch folder processing. No upload, no account, no character cap. $34 once vs $22/mo.
<!-- ~245 chars -->

## Full description

Voicebarn is a desktop app for anyone who narrates a lot — video creators, audiobook makers, IVR/accessibility builders — and is tired of two things: paying per-character subscriptions, and uploading scripts to someone else's cloud.

It's built around Piper, an excellent local neural TTS engine. Type or paste your script as paragraphs, assign a voice and speed to each one (or inherit document defaults), drop in `<pause 500ms>` tags wherever you need a beat, hit preview, and export the whole thing as WAV or MP3. Point it at a folder of `.txt` files and it'll batch-convert every one into its own narrated audio file.

**What you get:**
- 8 curated starter voices (English US/UK, German, Spanish, French), downloaded once
- Per-paragraph voice + speed (0.5x–2.0x) overrides
- Inline pause tags — sample-rate-matched silence, not a hack
- Instant per-paragraph preview, cached by content hash
- WAV or MP3 export (128–320 kbps)
- Batch mode: folder of scripts in, folder of audio files out
- Local project save/load — no account, no cloud

**Who it's for:** YouTubers and course creators who need narration without paying per word, audiobook hobbyists, indie devs adding voice prompts to apps, and anyone who'd rather not hand a script to a cloud service before it's published.

**Honest framing:** Piper's voices are clean, natural narration voices — this is not a celebrity voice clone tool, and Voicebarn doesn't pretend otherwise.

The code is MIT and open source. The one-time purchase is the polished 1-click Windows installer — pay once, own it forever.

## Maker first comment

Hey hunters 👋

I kept bumping into the same wall making video content: every good TTS tool is a subscription with a character cap, and I'd rather not upload half-finished scripts to a third party before they're public.

So I built Voicebarn: Piper (local neural TTS) wrapped in a proper document editor — paragraphs, per-paragraph voice/speed, pause tags, batch folder mode, WAV/MP3 export. That's the whole product.

Honest notes:
- First run downloads the Piper engine (~22 MB) and your first voice (~60 MB) — after that it's fully offline.
- These are clean neural narration voices, not voice cloning — if you need to clone a specific person's voice, this isn't that product.
- Source is MIT on GitHub — you can run it free with `npm start`. The $34 gets you the 1-click installer and lifetime updates.

Would love feedback on which additional languages/voices to curate next.

## Gallery shots (5)

1. **Hero shot** — Editor view in dark mode: paragraph cards with voice/speed controls visible, tagline overlay "Your text never leaves this machine."
2. **Pause tag close-up** — A paragraph card showing `<pause 500ms>` inline in the text with a caption explaining the honest SSML-lite scope.
3. **Export in progress** — Export panel mid-run, phase label "Synthesizing paragraph 3/8," progress bar visible.
4. **Voice Manager grid** — Catalog of 8 voices with language flags/labels, download buttons, and installed checkmarks.
5. **Comparison card** — Simple graphic: "ElevenLabs Creator: $264/yr, character cap ❌ vs Voicebarn: $34 once, unlimited, 100% local ✅ — pays for itself in ~2 months."
