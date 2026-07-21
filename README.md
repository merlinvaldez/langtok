# LangTok

LangTok is a React learning project for experimenting with browser-local AI for language learning. The app uses a short-form vertical feed where learners choose a target language, scroll through vocabulary and phrase cards, save useful items to a Word Wall, and hear pronunciation through browser-side text-to-speech.

## Current Features

- Vite + React app scaffold.
- Startup setup gate that checks local model caches before entering the app.
- First-run download flow with progress bars for Gemma 4 E2B and Supertonic 3.
- Mobile-first vertical feed with full-screen scroll snapping.
- Language dropdown for Italian, Arabic, and French.
- Static vocabulary and phrase cards.
- Minimal cards with target text, English meaning, phonetic spelling, example sentence, and example translation.
- Save and unsave interaction backed by `localStorage`.
- Word Wall view with saved cards sorted alphabetically by target text.
- Infinite feed generation that creates one new card as the learner scrolls near the end.
- Generated card persistence backed by `localStorage`.
- Gemma 4 E2B browser-local card generation through `@mediapipe/tasks-genai`.
- Supertonic 3 browser-local TTS through `onnxruntime-web`.
- Browser Cache API pre-download for Gemma, Supertonic ONNX assets, and the `M1` voice style.
- Compact TTS test harness for Italian, Arabic, and French.
- Separate `ttsText` values for pronunciation-friendly audio input.

## Planned Learning Milestones

1. Static product skeleton.
2. Word Wall with alphabetically organized saved cards.
3. Supertonic 3 browser-local text-to-speech.
4. Browser-local vocabulary generation with Gemma 4 E2B.
5. Required model setup gate with cache progress.
6. Infinite generated feed.
7. Review mode for saved cards.

The full learning project spec is in `LANGTOK_PROJECT_SPEC.md`.

## Tech Stack

- React
- Vite
- lucide-react icons
- ONNX Runtime Web through `onnxruntime-web`
- Supertonic 3 model assets from `Supertone/supertonic-3`
- MediaPipe GenAI through `@mediapipe/tasks-genai`
- Gemma 4 E2B web model from `litert-community/gemma-4-E2B-it-litert-lm`
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

## Generation Notes

Scrolling near the bottom of the feed asks Gemma 4 E2B to create one beginner vocabulary or phrase card for the selected language. There is no manual generate-card button in the feed. The setup screen downloads the model into the browser Cache API first, and generation reads the cached model asset instead of fetching on first scroll. The exact browser model file is:

```text
https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.task
```

The app runs inference locally in the browser through Google AI Edge MediaPipe GenAI. Chrome with WebGPU and persistent Cache API support are required by the current setup flow.

## TTS Notes

Open the speaker icon in the header to test the TTS harness after setup. LangTok now uses Supertonic 3 only for pronunciation audio. There is no system `SpeechSynthesis` fallback and no Google Cloud/backend TTS fallback.

The startup setup downloads and caches these browser assets from Hugging Face:

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

LangTok is early-stage. The current app now has the static core flow, required browser-model setup, Supertonic TTS, and the first browser-local Gemma generation path. The next hardening work is full browser-device testing, worker isolation, stronger persistence, and review-mode practice.

## Privacy Goal

The long-term direction is to keep vocabulary generation, pronunciation, saved words, and review data local to the browser wherever possible.
