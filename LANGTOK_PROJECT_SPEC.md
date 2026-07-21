# LangTok Learning Project Spec

## 1. Project Summary

LangTok is a React learning project for exploring browser-local language AI. The app provides a short-form vertical feed of vocabulary words and useful phrases for a selected target language. Users can save items to a Word Wall, review them later, and hear pronunciation from browser-side Supertonic 3 text-to-speech.

The project is intentionally scoped as a learning app. The goal is to understand how local browser inference works, how React coordinates long-running model work, and how to build a useful product experience around local generation, local TTS, and local persistence.

## 2. Learning Goals

By the end of the project, the builder should understand:

- How to scaffold and organize a React app for an AI-heavy browser experience.
- How to create a mobile-first vertical feed with card-based interactions.
- How to store saved learning items in browser storage.
- How to prepare and cache browser-side model assets.
- How to gate a browser app behind required local model setup.
- How to run Supertonic 3 through ONNX Runtime Web.
- How to use Gemma 4 E2B for browser-local structured text generation.
- How to validate LLM output before rendering it in the UI.
- How to keep pronunciation audio, phonetic spelling, and displayed text aligned.

## 3. Target User

The target user is a casual language learner who wants quick exposure to useful vocabulary and phrases without building a formal flashcard deck first. The user opens the app, chooses a language, scrolls through fresh learning cards, listens to pronunciation, and saves useful terms for later review.

## 4. Core Experience

### 4.0 Startup Setup

The app must check required model dependencies before the learner enters the main LangTok experience.

Requirements:

- On app load, check whether Gemma 4 E2B and Supertonic 3 assets are already cached in the browser.
- If either dependency is missing, show a minimal setup flow before the feed.
- The setup flow must download Gemma 4 E2B and Supertonic 3 assets into the browser Cache API.
- Show separate progress bars for Gemma 4 E2B and Supertonic 3.
- Do not allow entry into the feed until both required dependencies are cached.
- If the browser cannot support the required cache or WebGPU capabilities, show the blocking state instead of silently falling back to a cloud or system option.

### 4.1 For You Feed

The For You feed is the main screen. It behaves like a short-form vertical discovery feed, but for language cards instead of videos.

Requirements:

- Show one primary card at a time in a vertically scrollable feed.
- Provide a target language dropdown at the top of the experience.
- Generate a continuing feed of words and phrases for the selected language.
- Mix individual vocabulary words and practical phrases.
- Keep cards beginner-friendly by default.
- Generate one new card before the user reaches the end of the current feed.
- Avoid showing duplicate cards in the same session when possible.

Each card should include:

- Target word or phrase.
- English meaning.
- Example sentence in the target language.
- English translation of the example sentence.
- How to say it phonetically, if available.
- Audio playback button.
- Save or unsave button.

Cards should not show visible metadata chips such as language, word/phrase type, part of speech, use case, difficulty, or topic tags. The selected language belongs in the top-level dropdown, not repeated on every card.

### 4.2 Word Wall

The Word Wall is the saved-items screen.

Requirements:

- Show all saved words and phrases.
- Organize saved words and phrases alphabetically by target text.
- Persist saved items locally across page reloads.
- Let the user unsave items.
- Let the user replay pronunciation from saved cards.
- Keep the saved view minimal. Add language filtering only after the saved list becomes large enough to need it; do not add type or tag filters.

### 4.3 Review Mode

Review Mode is a later milestone that turns the Word Wall into a lightweight practice flow.

Requirements:

- Show one saved item at a time.
- Let the user reveal the translation.
- Let the user mark an item as remembered or still learning.
- Track review counts locally.

## 5. MVP Scope

The first complete MVP should include:

- React app scaffolded with Vite.
- Startup setup gate for required local model dependencies.
- Cache progress bars for Gemma 4 E2B and Supertonic 3.
- Mobile-first app shell.
- Language dropdown.
- Static hardcoded feed cards.
- Vertical feed layout.
- Save and unsave actions.
- Word Wall with local persistence.
- Supertonic 3 TTS test harness for Italian, Arabic, and French.
- Supertonic-only audio playback on feed cards and saved cards.
- Browser Cache API preparation for Supertonic model assets.
- Gemma 4 E2B browser-local card generation.
- Infinite feed loading as the user nears the end of the current cards.
- Basic model loading, download, generation, and error states.

The MVP should not require a backend, account system, payments, analytics, cloud database, cloud TTS fallback, or system TTS fallback.

## 6. AI Scope

### 6.1 Text Generation

Use Gemma 4 E2B for browser-local generation after the static feed, Word Wall, and Supertonic TTS path are working.

Primary local text model decision:

- Use Gemma 4 E2B IT as the preferred main local text model for LangTok.
- Use the web-converted model file `gemma-4-E2B-it-web.task` from `litert-community/gemma-4-E2B-it-litert-lm`.
- Run the model through Google AI Edge MediaPipe GenAI with `@mediapipe/tasks-genai`.
- Treat this model as the first target for browser-local vocabulary and phrase generation.
- Use it for card generation, English meanings, example sentences, example translations, phonetic spelling, and later review prompts.
- This model does not replace the local TTS model; pronunciation audio remains a separate browser-local TTS adapter responsibility.
- Download the model into the browser Cache API during startup setup.
- Read the cached model asset when creating the MediaPipe `LlmInference` instance.
- Chrome/WebGPU is required by the current Gemma 4 E2B web package.
- WebLLM remains useful to study, but it is not the exact runtime used for Gemma 4 E2B in this implementation.

Generation responsibilities:

- Generate one vocabulary or phrase card per scroll-triggered request.
- Return structured JSON only.
- Respect the selected target language.
- Produce beginner-friendly, practical learning content.
- Include example sentences and English translations.
- Include `ttsText` when the clean display text needs a more pronunciation-specific version.
- Include phonetic spelling that matches the effective TTS input, not just the display text.

Recommended generation strategy:

- Request exactly one card at a time to keep responses short and reduce malformed JSON.
- Ask for strict JSON matching the card schema.
- Parse and validate the response before appending cards to the feed.
- If validation fails, discard the card and show a concise retry-on-scroll status.
- Trigger new one-card requests with an Intersection Observer sentinel near the end of the feed.
- Persist generated cards locally so saved generated cards remain available after reload.

### 6.2 Text-to-Speech

Use Supertonic 3 as the active browser-local TTS engine. Do not use browser `SpeechSynthesis`, Google Cloud, a backend TTS service, MMS, or Transformers.js as a fallback in the MVP.

Initial target languages:

- Italian (`it`)
- Arabic (`ar`)
- French (`fr`)

Removed from MVP:

- Farsi/Persian is removed because Supertonic 3 documentation lists Italian, Arabic, and French but does not list Persian/Farsi.

TTS responsibilities:

- Expose one internal function: `speak({ text, languageCode })`.
- Route all audio requests to Supertonic 3.
- Pre-download/cache Supertonic assets in the browser through the Cache API.
- Load ONNX Runtime Web with WebGPU when available and WASM when WebGPU is unavailable.
- Generate audio from `ttsText` when a card provides it.
- Play generated audio with Web Audio.
- Reuse the loaded Supertonic runtime after the first load.
- Show model download, model load, generation, playback, and error states.
- Keep TTS work in a service module first; move to a Web Worker later if main-thread performance becomes a problem.

Pronunciation matching contract:

- `targetText` is the clean text shown on the card.
- `ttsText` is the exact text sent to Supertonic.
- `phoneticSpelling` must describe how `ttsText` should sound.
- For Arabic, use vocalized `ttsText` when needed, such as `شُكْرًا` for `شكرا` and `مِنْ فَضْلَك` for `من فضلك`.
- If generation later produces `ttsText`, validation must check that `phoneticSpelling` is still aligned with that `ttsText`.

Research findings:

- Supertonic 3 is the strongest first candidate for natural browser-side multilingual TTS.
- Its browser example runs with `onnxruntime-web` and expects ONNX model assets plus voice-style JSON files.
- The documented language list includes Italian, Arabic, and French.
- The documented language list does not include Persian/Farsi, so Farsi is out of scope for the current MVP.
- LiteRT.js remains useful to study as a browser runtime, but no single pure LiteRT browser-ready TTS model was found that clearly covers the current MVP language needs better than Supertonic 3.
- MMS/Transformers.js is removed from active implementation because Arabic pronunciation was rejected in user testing and the earlier Farsi path failed.

Candidate model map:

```json
{
  "it": {
    "label": "Italian",
    "primaryTts": "supertonic-3",
    "supertonicLang": "it",
    "status": "enabled"
  },
  "ar": {
    "label": "Arabic",
    "primaryTts": "supertonic-3",
    "supertonicLang": "ar",
    "status": "enabled with vocalized ttsText for key samples"
  },
  "fr": {
    "label": "French",
    "primaryTts": "supertonic-3",
    "supertonicLang": "fr",
    "status": "enabled"
  }
}
```

Browser assets:

```json
[
  "onnx/tts.json",
  "onnx/unicode_indexer.json",
  "onnx/duration_predictor.onnx",
  "onnx/text_encoder.onnx",
  "onnx/vector_estimator.onnx",
  "onnx/vocoder.onnx",
  "voice_styles/M1.json"
]
```

## 7. Suggested Tech Stack

- React for UI.
- Vite for local development and bundling.
- Plain CSS or CSS modules for styling.
- MediaPipe GenAI for Gemma 4 E2B browser-local generation.
- Gemma 4 E2B web task model from Hugging Face.
- ONNX Runtime Web for Supertonic 3 inference.
- Supertonic 3 as the active browser-local TTS model.
- Browser Cache API for model asset preparation.
- Web Workers for later heavy model operations.
- IndexedDB for saved cards and generated history.
- localStorage for lightweight preferences and current prototype persistence.

## 8. Data Model

### 8.1 LangTok Card

```json
{
  "id": "local-generated-id",
  "language": "Italian",
  "languageCode": "it",
  "targetText": "ancora",
  "ttsText": "ancora",
  "translation": "still / again",
  "phoneticSpelling": "ahn-KOH-rah",
  "example": "Sto ancora imparando.",
  "exampleTranslation": "I am still learning.",
  "source": "static-seed",
  "createdAt": "2026-07-18T00:00:00.000Z",
  "savedAt": null,
  "reviewCount": 0,
  "lastReviewedAt": null
}
```

### 8.2 Language Option

```json
{
  "label": "Arabic",
  "code": "ar",
  "generationName": "Arabic",
  "direction": "rtl",
  "tts": {
    "primary": "supertonic-3",
    "supertonicLang": "ar",
    "status": "enabled"
  },
  "enabled": true
}
```

## 9. App Screens

### 9.0 Setup Screen

Primary route or view: startup gate before `/`

Main UI elements:

- LangTok setup heading.
- Gemma 4 E2B cache status and progress bar.
- Supertonic 3 cache status and progress bar.
- Download models button when dependencies are missing.
- Enter LangTok button only after both dependencies are cached.
- Blocking browser capability state when Cache API or WebGPU support is missing.

### 9.1 Feed Screen

Primary route or view: `/`

Main UI elements:

- App header with LangTok name.
- Language dropdown.
- Vertical card feed.
- Audio button on each card.
- Save button on each card.
- Navigation control for Word Wall.

### 9.2 Word Wall Screen

Primary route or view: `/word-wall`

Main UI elements:

- Saved card list or grid sorted alphabetically by target text.
- Audio replay button.
- Remove saved item button.
- Entry point into Review Mode.
- Optional language filter only if saved items across multiple languages become hard to scan.

### 9.3 TTS Harness

Primary route or view: `/tts`

Main UI elements:

- Compact language test cards for Italian, Arabic, and French.
- Download/prepare button for Supertonic model assets.
- Word and phrase audio buttons.
- Visible phonetic guide for each test sample.
- Latest result metrics.

### 9.4 Review Screen

Primary route or view: `/review`

Main UI elements:

- One saved item at a time.
- Reveal translation button.
- Audio replay button.
- Remembered button.
- Still learning button.

## 10. Implementation Milestones

### Milestone 1: Static Product Skeleton

Deliverables:

- Vite React app.
- Hardcoded sample cards.
- Language dropdown.
- Full-height scrollable feed.
- Card component.

Acceptance criteria:

- App runs locally.
- User can change selected language.
- Feed renders multiple cards.
- Layout works at mobile and desktop widths.

### Milestone 2: Word Wall Persistence

Deliverables:

- Save button on feed cards.
- Word Wall view.
- Local persistence for saved cards.
- Alphabetical organization by target text.
- Saved state survives page reload.

Acceptance criteria:

- Saving a card adds it to the Word Wall.
- Unsaving removes it.
- Saved cards are shown alphabetically by target text.
- Reloading the page preserves saved cards.

### Milestone 3: Supertonic Local TTS

Learning focus:

- Browser-side model asset preparation.
- Cache API model storage.
- ONNX Runtime Web setup.
- WebGPU/WASM runtime behavior.
- Audio playback from generated model output.
- Pronunciation guide alignment.

Deliverables:

- TTS service module with a stable `speak({ text, languageCode })` interface.
- Supertonic runtime module.
- TTS test harness for Italian, Arabic, and French.
- Browser model asset cache status.
- Integrated Supertonic audio playback button.
- Loading and error states.
- Arabic `ttsText` values with diacritics for key samples.

Acceptance criteria:

- Clicking audio uses Supertonic 3, not system TTS.
- The app does not attempt rejected Arabic/Farsi MMS paths.
- The app does not use system voice fallback.
- Farsi is not shown in the language dropdown.
- Arabic `شكرا` speaks from `شُكْرًا` and shows a matching `SHOOK-ran` guide.
- Arabic `من فضلك` speaks from `مِنْ فَضْلَك` and shows a matching `min FAD-lak` guide.
- The UI remains responsive enough while audio is prepared.
- The harness records model id, backend, voice style, load time, generation time, total time, and timestamp.

### Milestone 4: Gemma 4 E2B Generation Prototype

Deliverables:

- Gemma 4 E2B generation service.
- Generate-one-card function.
- JSON parsing and validation.
- Append generated cards to the feed.
- Documented model id, web model file, runtime, and WebGPU requirement.
- Local persistence for generated cards.

Acceptance criteria:

- Scrolling near the end generates one new card for the selected language.
- Invalid model output is rejected safely.
- Generated cards match the app schema.
- Generated phonetic spelling describes the same text sent to TTS.
- Generation uses `litert-community/gemma-4-E2B-it-litert-lm` and `gemma-4-E2B-it-web.task`.

### Milestone 5: Infinite Feed

Deliverables:

- Auto-generation near the end of the feed.
- Loading card or feed footer.
- Duplicate filtering by normalized target text.

Acceptance criteria:

- Feed continues to grow as the user scrolls.
- The app does not trigger overlapping generation requests.
- Duplicate cards are minimized.
- The app shows a retryable status if Gemma loading or generation fails.

### Milestone 6: Startup Model Setup Gate

Deliverables:

- Initial cache check for Gemma 4 E2B and Supertonic 3.
- Minimal setup screen shown before the feed when either dependency is missing.
- Gemma 4 E2B Cache API downloader with progress.
- Supertonic 3 asset Cache API downloader with progress.
- Enter LangTok action enabled only after both dependencies are cached.
- Blocking browser capability state for missing Cache API or WebGPU support.

Acceptance criteria:

- A fresh browser profile sees the setup screen before the feed.
- A cached browser profile can enter LangTok after the startup check.
- Downloading models updates visible progress bars.
- The app does not enter the main feed while Gemma or Supertonic is missing from cache.
- Gemma generation uses the cached model asset.
- The setup flow does not introduce cloud, backend, system TTS, or other fallback model paths.

### Milestone 7: Review Mode

Deliverables:

- Review screen.
- Reveal translation interaction.
- Remembered and still-learning actions.
- Review metadata saved locally.

Acceptance criteria:

- User can review saved cards one by one.
- Review count updates locally.
- Reviewed state persists after reload.

## 11. Prompt Contract For Generated Cards

The generation prompt should require JSON with no markdown wrapper.

Example prompt intent:

```text
Generate exactly 1 beginner-friendly language learning card for {selectedLanguage}.
Choose either one useful word or one short practical phrase.
Return only valid minified JSON with this shape:
{
  "card": {
    "targetText": "string",
    "ttsText": "string; exact text to speak",
    "translation": "string",
    "phoneticSpelling": "string; must describe ttsText",
    "example": "string",
    "exampleTranslation": "string"
  }
}
Do not include duplicates. Do not include offensive, adult, or overly obscure content.
```

## 12. Validation Rules

Generated cards must be rejected unless:

- `targetText`, `translation`, `example`, and `exampleTranslation` are non-empty strings.
- `languageCode` is one of `it`, `ar`, or `fr`.
- `ttsText` is optional, but when present it must be a non-empty string intended for pronunciation rather than display.
- `phoneticSpelling` is either absent or a non-empty string explaining how to say the item phonetically.
- The phonetic spelling is reviewed against `ttsText` when `ttsText` exists.
- The target text is not already present in the current session for the selected language.

## 13. UX Principles

- The first screen should be the actual feed, not a landing page.
- Controls should be minimal and familiar.
- Cards should be readable on mobile.
- Do not show visible card metadata chips for language, word/phrase type, part of speech, use case, difficulty, topic tags, or local-model marketing copy.
- Loading states should explain what is happening without overexplaining the technology.
- AI failures should produce retryable UI states, not broken cards.
- Saved vocabulary should always feel recoverable and stable.

## 14. Non-Goals

- No user accounts in the learning project.
- No backend API for the MVP.
- No Google Cloud TTS.
- No system TTS fallback.
- No MMS/Transformers.js fallback.
- No Farsi/Persian in the current MVP.
- No social feed, follows, likes, comments, or public sharing.
- No payment or subscription system.
- No formal spaced repetition algorithm until the basic review flow works.

## 15. Risks And Constraints

- Browser-local models can be large and slow to load the first time.
- Hugging Face asset hosting and CORS behavior must keep working for first-run model preparation.
- Browser Cache API storage can be cleared by the browser.
- WebGPU support varies across browsers and devices.
- WASM fallback can be slower than WebGPU.
- TTS model quality can vary by language and sample.
- Supertonic 3 does not list Persian/Farsi in its supported language list.
- Local LLM output may be malformed or linguistically imperfect.
- Running both LLM generation and TTS in the same browser session can be memory-intensive.
- Model licenses differ. Review Supertonic and any future model license before commercial use.

Mitigations:

- Start with static cards.
- Add one local model at a time.
- Keep TTS behind an adapter so model choices can change without redesigning the app.
- Cache model assets explicitly and show cache state.
- Run a browser TTS harness before trusting generated language samples.
- Validate all generated data.
- Show model loading progress and retry states.
- Move TTS into a Worker if main-thread performance becomes unacceptable.

## 16. Documentation References

- Google AI Edge LLM Inference Web guide: https://developers.google.com/edge/mediapipe/solutions/genai/llm_inference/web_js
- Gemma 4 model card: https://ai.google.dev/gemma/docs/core/model_card_4
- Gemma 4 E2B LiteRT-LM model: https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm
- MediaPipe Tasks GenAI npm package: https://www.npmjs.com/package/@mediapipe/tasks-genai
- Supertonic 3 Overview: https://supertonic3.github.io/
- Supertonic GitHub Repository: https://github.com/supertone-inc/supertonic
- Supertonic 3 Hugging Face model assets: https://huggingface.co/Supertone/supertonic-3
- ONNX Runtime Web: https://onnxruntime.ai/docs/tutorials/web/
- MDN Cache API: https://developer.mozilla.org/en-US/docs/Web/API/Cache
- MDN Web Audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- MDN Web Workers: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers

## 17. Definition Of Done For The Learning Project

The learning project is complete when:

- A first-time user is guided through caching Gemma 4 E2B and Supertonic 3 before entering the app.
- A user can choose Italian, Arabic, or French.
- A user can scroll through a feed of vocabulary and phrase cards.
- A user can hear pronunciation for cards using Supertonic 3 in the browser.
- Pronunciation audio uses `ttsText` when present and matches the phonetic guide.
- A user can save cards to the Word Wall.
- Saved cards persist locally.
- A user can review saved cards.
- The app can generate additional cards locally in the browser.
- The code clearly separates UI, persistence, generation, validation, and TTS concerns.
