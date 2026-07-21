# LangTok

LangTok is a React learning project for experimenting with browser-local AI for language learning. The app is designed as a short-form, TikTok-like feed where learners choose a target language, scroll through vocabulary and phrase cards, save useful items to a Word Wall, and eventually hear pronunciation from local browser-side text-to-speech models.

This repository currently contains the start of the third implementation milestone: a static feed, saved-card persistence, a Word Wall, and a browser-side TTS test harness.

## Current Features

- Vite + React app scaffold.
- Mobile-first vertical feed with full-screen scroll snapping.
- Language dropdown for Italian, Arabic, Farsi, and French.
- Static vocabulary and phrase cards.
- Minimal cards with target text, English meaning, phonetic spelling, example sentence, and example translation.
- Save and unsave interaction backed by `localStorage`.
- Word Wall view with saved cards sorted alphabetically by target text.
- TTS adapter with a stable `speak({ text, languageCode })` path.
- Worker-backed MMS/Transformers.js synthesis where a browser-compatible model is configured.
- Compact TTS test harness for the initial four languages.
- System voice fallback for languages that do not yet have a confirmed browser model path.

## Planned Learning Milestones

1. Static product skeleton.
2. Word Wall with alphabetically organized saved cards.
3. Browser-local text-to-speech harness across Italian, Arabic, Farsi, and French.
4. Browser-local vocabulary generation with WebLLM.
5. Infinite generated feed.
6. Review mode for saved cards.

The full learning project spec is in `LANGTOK_PROJECT_SPEC.md`.

## Tech Stack

- React
- Vite
- lucide-react icons
- Transformers.js for browser-side TTS experiments
- Planned: WebLLM for browser-local text generation
- Planned: Supertonic 3 browser asset spike for Italian, Arabic, and French
- Planned: LiteRT.js model spike after the working TTS baseline is measured
- Planned: IndexedDB for saved vocabulary persistence

## Getting Started

Install dependencies:

```powershell
npm install
```

Start the development server:

```powershell
npm run dev
```

Build for production:

```powershell
npm run build
```

## TTS Notes

Open the speaker icon in the header to test the current TTS harness. Arabic and French are wired to browser-compatible MMS models through Transformers.js. Farsi attempts the Meta MMS Persian model so we can validate whether the current browser runtime can load it directly. Italian currently uses the system voice fallback while the Supertonic 3 browser asset path is tested.

The first model-backed TTS run downloads model assets into the browser cache, so the first click can take much longer than repeat playback.

## Project Status

LangTok is early-stage. The current app is intentionally static so the core interaction model is clear before adding local model loading, workers, caching, validation, and persistence.

## Privacy Goal

The long-term direction is to keep vocabulary generation, pronunciation, saved words, and review data local to the browser wherever possible.
