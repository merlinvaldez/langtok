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
- How to use Transformers.js for browser-local text-to-speech.
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
- Topic tags.
- Audio playback button.
- Save or unsave button.

### 4.2 Word Wall

The Word Wall is the saved-items screen.

Requirements:

- Show all saved words and phrases.
- Organize saved words and phrases alphabetically by target text.
- Persist saved items locally across page reloads.
- Let the user unsave items.
- Let the user replay pronunciation from saved cards.
- Provide basic filtering by language and type.

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
- One working local TTS path for one language.
- Basic model loading state.

The MVP should not require a backend, account system, payments, analytics, or cloud database.

## 6. AI Scope

### 6.1 Text Generation

Use WebLLM for browser-local generation after the static feed and Word Wall are working.

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

Use Transformers.js text-to-speech models for browser-local pronunciation.

TTS responsibilities:

- Load a language-appropriate TTS model.
- Generate audio from the card target text.
- Play generated audio in the browser.
- Cache or reuse the loaded TTS pipeline for the selected language.
- Show loading state when a voice model is first loaded.

Initial language strategy:

- Start with one language for the first TTS implementation, preferably Spanish.
- Expand to English, French, and German after the first path works.
- Maintain a model map from language code to TTS model id.

Fallback policy:

- The primary goal is local model-backed TTS.
- Browser `SpeechSynthesis` may be used only as a clearly labeled fallback for unsupported devices or missing local model support.

## 7. Suggested Tech Stack

- React for UI.
- Vite for local development and bundling.
- Plain CSS or CSS modules for styling.
- WebLLM for local LLM generation.
- Transformers.js for local TTS.
- Web Workers for model operations.
- IndexedDB for saved cards and generated history.
- localStorage for lightweight preferences.

## 8. Data Model

### 8.1 LangTok Card

```json
{
  "id": "local-generated-id",
  "language": "Spanish",
  "languageCode": "es",
  "type": "word",
  "targetText": "todavia",
  "translation": "still / yet",
  "phoneticSpelling": "toh-dah-VEE-ah",
  "example": "Todavia estoy aprendiendo.",
  "exampleTranslation": "I am still learning.",
  "tags": ["daily-life", "adverb"],
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
  "label": "Spanish",
  "code": "es",
  "generationName": "Spanish",
  "ttsModel": "Xenova/mms-tts-spa",
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
- Language filter.
- Type filter.
- Audio replay button.
- Remove saved item button.
- Entry point into Review Mode.

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

- Transformers.js pipelines.
- Model loading progress.
- Audio playback from generated model output.
- Browser model performance constraints.

Deliverables:

- TTS service module or worker.
- One working local TTS model.
- Audio playback button.
- Loading and error states.

Acceptance criteria:

- Clicking audio loads the model if needed.
- The app plays generated pronunciation audio.
- The UI remains responsive while audio is prepared.

### Milestone 4: WebLLM Generation Prototype

Learning focus:

- WebLLM model loading.
- Prompt design.
- Structured JSON generation.
- Runtime validation.

Deliverables:

- WebLLM worker.
- Generate-card-batch function.
- JSON parsing and validation.
- Append generated cards to the feed.

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
Generate 8 beginner-friendly language learning cards for Spanish.
Mix useful words and short phrases.
Return only valid JSON with this shape:
{
  "cards": [
    {
      "type": "word" | "phrase",
      "targetText": "string",
      "translation": "string",
      "phoneticSpelling": "string",
      "example": "string",
      "exampleTranslation": "string",
      "tags": ["string"]
    }
  ]
}
Do not include duplicates. Do not include offensive, adult, or overly obscure content.
```

## 12. Validation Rules

Generated cards must be rejected unless:

- `targetText`, `translation`, `example`, and `exampleTranslation` are non-empty strings.
- `type` is `word` or `phrase`.
- `phoneticSpelling` is either absent or a non-empty string explaining how to say the item phonetically.
- `tags` is an array of short strings.
- The target text is not already present in the current session for the selected language.

## 13. UX Principles

- The first screen should be the actual feed, not a landing page.
- Controls should be minimal and familiar.
- Cards should be readable on mobile.
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
- Local LLM output may be malformed or linguistically imperfect.
- Running both LLM generation and TTS in the same browser session can be memory-intensive.

Mitigations:

- Start with static cards.
- Add one local model at a time.
- Use workers for model work.
- Validate all generated data.
- Show model loading progress and retry states.
- Keep model choices configurable.

## 16. Documentation References

- WebLLM Basic Usage: https://webllm.mlc.ai/docs/user/basic_usage.html
- WebLLM Advanced Use Cases: https://webllm.mlc.ai/docs/user/advanced_usage.html
- Transformers.js Overview: https://huggingface.co/docs/transformers.js/index
- Transformers.js SpeechT5 TTS model: https://huggingface.co/Xenova/speecht5_tts
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
