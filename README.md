# LangTok

LangTok is a React learning project for experimenting with browser-local AI for language learning. The app is designed as a short-form, TikTok-like feed where learners choose a target language, scroll through vocabulary and phrase cards, save useful items to a Word Wall, and eventually hear pronunciation from local browser-side text-to-speech models.

This repository currently contains the second implementation milestone: a static feed with saved-card persistence and a Word Wall.

## Current Features

- Vite + React app scaffold.
- Mobile-first vertical feed with full-screen scroll snapping.
- Language dropdown for Spanish, French, German, and English.
- Static vocabulary and phrase cards.
- Minimal cards with target text, English meaning, phonetic spelling, example sentence, and example translation.
- Save and unsave interaction backed by `localStorage`.
- Word Wall view with saved cards sorted alphabetically by target text.
- Placeholder audio button for the future local TTS milestone.

## Planned Learning Milestones

1. Static product skeleton.
2. Word Wall with alphabetically organized saved cards.
3. Browser-local text-to-speech with Transformers.js.
4. Browser-local vocabulary generation with WebLLM.
5. Infinite generated feed.
6. Review mode for saved cards.

The full learning project spec is in `LANGTOK_PROJECT_SPEC.md`.

## Tech Stack

- React
- Vite
- lucide-react icons
- Planned: WebLLM for browser-local text generation
- Planned: Transformers.js for browser-local text-to-speech
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

## Project Status

LangTok is early-stage. The current app is intentionally static so the core interaction model is clear before adding local model loading, workers, caching, validation, and persistence.

## Privacy Goal

The long-term direction is to keep vocabulary generation, pronunciation, saved words, and review data local to the browser wherever possible.
