# LangTok

LangTok is a React learning project for experimenting with browser-local AI for language learning. The app uses a short-form vertical feed where learners choose a target language, scroll through vocabulary and phrase cards, save useful items to a Word Wall, and hear pronunciation through browser-side text-to-speech.

## Current Features

- Vite + React app scaffold.
- Mobile-first vertical feed with full-screen scroll snapping.
- Language dropdown for Italian, Arabic, and French.
- Static vocabulary and phrase cards.
- Minimal cards with target text, English meaning, phonetic spelling, example sentence, and example translation.
- Save and unsave interaction backed by `localStorage`.
- Word Wall view with saved cards sorted alphabetically by target text.
- Supertonic 3 browser-local TTS through `onnxruntime-web`.
- Browser Cache API pre-download for Supertonic ONNX assets and the `M1` voice style.
- Compact TTS test harness for Italian, Arabic, and French.
- Separate `ttsText` values for pronunciation-friendly audio input.

## Planned Learning Milestones

1. Static product skeleton.
2. Word Wall with alphabetically organized saved cards.
3. Supertonic 3 browser-local text-to-speech.
4. Browser-local vocabulary generation with WebLLM.
5. Infinite generated feed.
6. Review mode for saved cards.

The full learning project spec is in `LANGTOK_PROJECT_SPEC.md`.

## Tech Stack

- React
- Vite
- lucide-react icons
- ONNX Runtime Web through `onnxruntime-web`
- Supertonic 3 model assets from `Supertone/supertonic-3`
- Planned: WebLLM for browser-local text generation
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

Open the speaker icon in the header to test the TTS harness. LangTok now uses Supertonic 3 only for pronunciation audio. There is no system `SpeechSynthesis` fallback and no Google Cloud/backend TTS fallback.

The first model setup downloads and caches these browser assets from Hugging Face:

- `onnx/tts.json`
- `onnx/unicode_indexer.json`
- `onnx/duration_predictor.onnx`
- `onnx/text_encoder.onnx`
- `onnx/vector_estimator.onnx`
- `onnx/vocoder.onnx`
- `voice_styles/M1.json`

Farsi is removed from the MVP because Supertonic 3 documents Arabic, French, and Italian support, but does not list Persian/Farsi. Arabic cards use vocalized `ttsText`, such as `شُكْرًا` and `مِنْ فَضْلَك`, so the generated audio matches the displayed phonetic guide.

The harness stores a versioned latest result per language in `localStorage` under `langtok:ttsResults`. Each entry records the tested sample, engine, model id, voice style, ONNX backend, load time, generation time, total time, and timestamp.

## Project Status

LangTok is early-stage. The current app is intentionally static so the core interaction model is clear before adding local text generation, workers, generated-card validation, and durable persistence.

## Privacy Goal

The long-term direction is to keep vocabulary generation, pronunciation, saved words, and review data local to the browser wherever possible.
