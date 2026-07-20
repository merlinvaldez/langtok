# LangTok Learning Project Spec

## 1. Project Summary

LangTok is a React learning project for exploring browser-local language AI. The app provides a short-form vertical feed of vocabulary words and useful phrases for a selected target language. Users can save items to a Word Wall, review them later, and hear pronunciation from a browser-side text-to-speech model.

The project is intentionally scoped as a learning app. The goal is to understand how local browser inference works, how React coordinates long-running model work, and how to build a useful product experience around local generation, local TTS, and local persistence.

## 2. Learning Goals

By the end of the project, the builder should understand:

- How to scaffold and organize a React app for an AI-heavy browser experience.
- How to create a mobile-first vertical feed with card-based interactions.
- How to store saved learning items in browser storage.
- How to run model work outside the main UI thread with Web Workers.
- How to use WebLLM for browser-local structured text generation.
- How to compare browser-side TTS options across LiteRT.js, Supertonic web, and Transformers.js/MMS.
- How to handle model loading progress, cache behavior, device limits, and graceful fallbacks.
- How to validate LLM output before rendering it in the UI.

## 3. Target User

The target user is a casual language learner who wants quick exposure to useful vocabulary and phrases without building a formal flashcard deck first. The user opens the app, chooses a language, scrolls through fresh learning cards, listens to pronunciation, and saves useful terms for later review.

## 4. Core Experience

### 4.1 For You Feed

The For You feed is the main screen. It behaves like a short-form vertical discovery feed, but for language cards instead of videos.

Requirements:

- Show one primary card at a time in a vertically scrollable feed.
- Provide a target language dropdown at the top of the experience.
- Generate a continuing feed of words and phrases for the selected language.
- Mix individual vocabulary words and practical phrases.
- Keep cards beginner-friendly by default.
- Generate more cards before the user reaches the end of the current batch.
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
- Mobile-first app shell.
- Language dropdown.
- Static hardcoded feed cards.
- Vertical feed layout.
- Save and unsave actions.
- Word Wall with local persistence.
- A TTS test harness for Italian, Arabic, Farsi/Persian, and French.
- One integrated local TTS path once the harness identifies the best browser-side option.
- Basic model loading state.

The MVP should not require a backend, account system, payments, analytics, or cloud database.

## 6. AI Scope

### 6.1 Text Generation

Use WebLLM for browser-local generation after the static feed and Word Wall are working.

Primary local text model decision:

- Use Gemma 4 E2B IT as the preferred main local text model for LangTok.
- Treat this model as the first target for browser-local vocabulary and phrase generation.
- Use it for card generation, English meanings, example sentences, example translations, phonetic spelling, and later review prompts.
- This model does not replace the local TTS model; pronunciation audio remains a separate browser-local TTS adapter responsibility.
- Before implementation, verify the exact WebLLM-compatible model id, browser/WebGPU compatibility, download size, memory requirements, and performance on the target device.
- If Gemma 4 E2B IT is not available in a browser-compatible WebLLM package, use the closest compatible Gemma instruct model and document the deviation.

Generation responsibilities:

- Generate batches of vocabulary and phrase cards.
- Return structured JSON only.
- Respect the selected target language.
- Produce beginner-friendly, practical learning content.
- Include example sentences and English translations.

Recommended generation strategy:

- Request 5 to 10 cards at a time.
- Ask for strict JSON matching the card schema.
- Parse and validate the response before appending cards to the feed.
- If validation fails, discard the batch and show a retry action.

### 6.2 Text-to-Speech

Use a browser-local TTS adapter for pronunciation. Do not bind the UI directly to one model library. The app should expose one internal function such as `speak({ text, languageCode })`, then route that request to the best available local model for the selected language.

Initial target languages:

- Italian (`it`)
- Arabic (`ar`)
- Farsi/Persian (`fa` in the UI; many model repositories use ISO 639-3 `fas`)
- French (`fr`)

TTS responsibilities:

- Load a language-appropriate TTS model.
- Generate audio from the card target text.
- Play generated audio in the browser.
- Cache or reuse the loaded TTS runtime for the selected language.
- Show loading and error states when a voice model is first loaded.
- Keep TTS work outside fragile UI components, preferably in a service module first and a Web Worker once model loading becomes heavy.

Research findings:

- LiteRT.js is a browser runtime for running `.tflite` models with WebGPU, WebNN, or WASM. It is not itself a ready-made TTS product, so LangTok still needs a compatible TTS model plus tokenization, audio decoding, and playback logic.
- No single pure LiteRT browser-ready TTS model was found that clearly covers Italian, Arabic, Farsi/Persian, and French.
- Supertonic 3 is the strongest first candidate for natural browser-side multilingual TTS. It is a 99M-parameter ONNX Runtime model with a browser example through `@supertone/supertonic-web`. Its documented language list includes Italian, Arabic, and French, but does not list Farsi/Persian.
- Qwen3-TTS LiteRT is useful to study because it is a real LiteRT TTS conversion, but it is not the first implementation target. The LiteRT model card lists 10 languages and the documented base coverage includes Italian and French, but not Arabic or Farsi/Persian. The current sample path is Python/Android-oriented and large enough that it should be treated as a later research spike.
- MMS-TTS through Transformers.js/ONNX is the best fallback family to investigate for language coverage. Browser-compatible ONNX models are confirmed for Arabic and French through Xenova model repositories. Persian exists as `facebook/mms-tts-fas`, but a browser-compatible ONNX path must be verified or converted before integration. Italian MMS-TTS browser support was not confirmed, so Italian should start with Supertonic or Qwen research instead.

Recommended TTS strategy:

- Build a small TTS harness before wiring the production audio button.
- Test one short word and one short phrase for Italian, Arabic, Farsi/Persian, and French.
- Record model size, first-load time, repeat-play latency, browser support, audio quality, and licensing constraints.
- Try Supertonic 3 web first for Italian, Arabic, and French.
- Use MMS-TTS/Transformers.js as the primary fallback path for Arabic, French, and especially Farsi/Persian.
- Keep Qwen3-TTS LiteRT as a later LiteRT-specific learning spike, not as the MVP dependency.
- Use browser `SpeechSynthesis` only as a clearly labeled fallback for unsupported devices or missing local model coverage.

Candidate model map:

```json
{
  "it": {
    "label": "Italian",
    "primaryTts": "supertonic-web",
    "fallbackTts": null,
    "status": "candidate"
  },
  "ar": {
    "label": "Arabic",
    "primaryTts": "supertonic-web",
    "fallbackTts": "Xenova/mms-tts-ara",
    "status": "candidate"
  },
  "fa": {
    "label": "Farsi",
    "primaryTts": "mms-tts",
    "fallbackTts": "browser-speech-synthesis",
    "modelToValidate": "facebook/mms-tts-fas",
    "status": "needs browser-compatible ONNX validation"
  },
  "fr": {
    "label": "French",
    "primaryTts": "supertonic-web",
    "fallbackTts": "Xenova/mms-tts-fra",
    "status": "candidate"
  }
}
```

## 7. Suggested Tech Stack

- React for UI.
- Vite for local development and bundling.
- Plain CSS or CSS modules for styling.
- WebLLM for local LLM generation.
- Supertonic web as the first local natural TTS candidate.
- Transformers.js/MMS for fallback TTS coverage.
- LiteRT.js for `.tflite` model experiments and later TTS research spikes.
- Web Workers for model operations.
- IndexedDB for saved cards and generated history.
- localStorage for lightweight preferences.

## 8. Data Model

### 8.1 LangTok Card

```json
{
  "id": "local-generated-id",
  "language": "Italian",
  "languageCode": "it",
  "targetText": "ancora",
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
  "label": "Italian",
  "code": "it",
  "generationName": "Italian",
  "tts": {
    "primary": "supertonic-web",
    "fallback": null,
    "status": "candidate"
  },
  "enabled": true
}
```

## 9. App Screens

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

### 9.3 Review Screen

Primary route or view: `/review`

Main UI elements:

- One saved item at a time.
- Reveal translation button.
- Audio replay button.
- Remembered button.
- Still learning button.

## 10. Implementation Milestones

### Milestone 1: Static Product Skeleton

Learning focus:

- React components.
- App state.
- Mobile-first layout.
- Vertical feed ergonomics.

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

Learning focus:

- Persistent browser state.
- Save and unsave flows.
- Separating app state from view state.

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

### Milestone 3: Local TTS Prototype

Learning focus:

- Browser-side model runtime tradeoffs.
- Supertonic web setup.
- Transformers.js/MMS fallback setup.
- LiteRT.js feasibility testing.
- Model loading progress.
- Audio playback from generated model output.
- Browser model performance constraints.

Deliverables:

- TTS service module with a stable `speak({ text, languageCode })` interface.
- TTS test harness for Italian, Arabic, Farsi/Persian, and French.
- Documented model results for each initial language.
- One working integrated local TTS path after the harness proves the best candidate.
- Audio playback button.
- Loading and error states.

Acceptance criteria:

- Clicking audio loads the model if needed.
- The app plays generated pronunciation audio.
- The UI remains responsive while audio is prepared.
- The harness records whether each initial language is supported by the selected local TTS path.

### Milestone 4: WebLLM Generation Prototype

Learning focus:

- WebLLM model loading.
- Gemma-family browser compatibility checks.
- Prompt design.
- Structured JSON generation.
- Runtime validation.

Deliverables:

- WebLLM worker.
- Generate-card-batch function.
- JSON parsing and validation.
- Append generated cards to the feed.
- Documented model id and fallback if Gemma 4 E2B IT is not WebLLM-compatible.

Acceptance criteria:

- User can generate a new batch for the selected language.
- Invalid model output is rejected safely.
- Generated cards match the app schema.

### Milestone 5: Infinite Feed

Learning focus:

- Intersection Observer or scroll threshold logic.
- Request queues.
- Duplicate prevention.
- Async state machines.

Deliverables:

- Auto-generation near the end of the feed.
- Loading card or feed footer.
- Duplicate filtering by normalized target text.

Acceptance criteria:

- Feed continues to grow as the user scrolls.
- The app does not trigger overlapping generation requests.
- Duplicate cards are minimized.

### Milestone 6: Review Mode

Learning focus:

- Derived state.
- Simple review workflows.
- User progress tracking.

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
Generate 8 beginner-friendly language learning cards for {selectedLanguage}.
Mix useful words and short phrases.
Return only valid JSON with this shape:
{
  "cards": [
    {
      "targetText": "string",
      "translation": "string",
      "phoneticSpelling": "string",
      "example": "string",
      "exampleTranslation": "string"
    }
  ]
}
Do not include duplicates. Do not include offensive, adult, or overly obscure content.
```

## 12. Validation Rules

Generated cards must be rejected unless:

- `targetText`, `translation`, `example`, and `exampleTranslation` are non-empty strings.
- `phoneticSpelling` is either absent or a non-empty string explaining how to say the item phonetically.
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
- No social feed, follows, likes, comments, or public sharing.
- No payment or subscription system.
- No formal spaced repetition algorithm until the basic review flow works.
- No claim that generated content is a complete curriculum.

## 15. Risks And Constraints

- Browser-local models can be large and slow to load the first time.
- WebGPU support varies across browsers and devices.
- TTS model quality and language coverage vary.
- No confirmed single pure LiteRT browser TTS path currently covers Italian, Arabic, Farsi/Persian, and French.
- Supertonic 3 covers several target languages but does not list Farsi/Persian in its supported language list.
- Qwen3-TTS LiteRT is large and not yet a simple browser drop-in integration path.
- MMS-TTS has broad language coverage, but browser-ready ONNX availability must be verified per language.
- Model licenses differ. Review Supertonic, MMS, Qwen, and any converted model licenses before commercial use.
- Local LLM output may be malformed or linguistically imperfect.
- Running both LLM generation and TTS in the same browser session can be memory-intensive.

Mitigations:

- Start with static cards.
- Add one local model at a time.
- Use workers for model work.
- Keep TTS behind an adapter so model choices can change without redesigning the app.
- Run a browser TTS harness before committing to one voice stack.
- Validate all generated data.
- Show model loading progress and retry states.
- Keep model choices configurable.

## 16. Documentation References

- WebLLM Basic Usage: https://webllm.mlc.ai/docs/user/basic_usage.html
- WebLLM Advanced Use Cases: https://webllm.mlc.ai/docs/user/advanced_usage.html
- LiteRT.js Get Started: https://developers.google.com/edge/litert/web/get_started
- Supertonic 3 Overview: https://supertonic3.github.io/
- Supertonic GitHub Repository: https://github.com/supertone-inc/supertonic
- Qwen3-TTS LiteRT model: https://huggingface.co/litert-community/Qwen3-TTS-12Hz-0.6B-Base
- Transformers.js Overview: https://huggingface.co/docs/transformers.js/index
- MMS-TTS model collection: https://huggingface.co/facebook/mms-tts
- Persian MMS-TTS model: https://huggingface.co/facebook/mms-tts-fas
- Arabic MMS-TTS ONNX model: https://huggingface.co/Xenova/mms-tts-ara
- French MMS-TTS ONNX model: https://huggingface.co/Xenova/mms-tts-fra
- MDN Web Workers: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers
- MDN SpeechSynthesis fallback API: https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis

## 17. Definition Of Done For The Learning Project

The learning project is complete when:

- A user can choose a language.
- A user can scroll through a feed of vocabulary and phrase cards.
- A user can hear pronunciation for cards using local model-backed TTS where supported.
- A user can save cards to the Word Wall.
- Saved cards persist locally.
- A user can review saved cards.
- The app can generate additional cards locally in the browser.
- The code clearly separates UI, persistence, generation, validation, and TTS concerns.
