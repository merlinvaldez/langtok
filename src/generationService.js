import { LANGUAGES } from "./data.js";

export const GEMMA_GENERATION_MODEL_ID = "litert-community/gemma-4-E2B-it-litert-lm";
export const GEMMA_GENERATION_MODEL_FILE = "gemma-4-E2B-it-web.task";
export const GEMMA_GENERATION_MODEL_URL =
  "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.task";

const GENAI_WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.29/wasm";
const GEMMA_CACHE_NAME = "langtok:gemma-4-e2b:v1";
const DEFAULT_BATCH_SIZE = 1;
const MAX_EXISTING_TERMS_IN_PROMPT = 80;
const MAX_GENERATION_ATTEMPTS = 2;

let llmPromise = null;

function hasCacheApi() {
  return typeof window !== "undefined" && "caches" in window;
}

function getLanguage(languageCode) {
  return LANGUAGES.find((language) => language.code === languageCode) ?? null;
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function supportsWebGpu() {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

async function openGemmaCache() {
  if (!hasCacheApi()) {
    return null;
  }

  return window.caches.open(GEMMA_CACHE_NAME);
}

async function getCachedGemmaResponse() {
  const cache = await openGemmaCache();

  if (!cache) {
    return null;
  }

  return cache.match(GEMMA_GENERATION_MODEL_URL);
}

async function getCachedGemmaModelAsset() {
  const cachedResponse = await getCachedGemmaResponse();

  if (!cachedResponse) {
    throw new Error("Gemma 4 E2B must be downloaded in setup before generation.");
  }

  if (cachedResponse.body && typeof ReadableStreamDefaultReader !== "undefined") {
    return cachedResponse.body.getReader();
  }

  return new Uint8Array(await cachedResponse.arrayBuffer());
}

export async function getGemmaCacheStatus() {
  const cache = await openGemmaCache();
  const cached = cache ? Boolean(await cache.match(GEMMA_GENERATION_MODEL_URL)) : false;

  return {
    cached,
    cachedCount: cached ? 1 : 0,
    checked: true,
    modelFile: GEMMA_GENERATION_MODEL_FILE,
    modelId: GEMMA_GENERATION_MODEL_ID,
    progress: cached ? 1 : 0,
    supportsCache: Boolean(cache),
    supportsWebGpu: supportsWebGpu(),
    total: 1,
  };
}

export async function preloadGemmaModel({ onStatus } = {}) {
  const cache = await openGemmaCache();

  if (!cache) {
    throw new Error("This browser does not support persistent model caching.");
  }

  if (!supportsWebGpu()) {
    throw new Error("Gemma 4 E2B web generation requires a WebGPU-capable browser.");
  }

  const cachedResponse = await cache.match(GEMMA_GENERATION_MODEL_URL);

  if (cachedResponse) {
    onStatus?.({
      cached: true,
      cachedCount: 1,
      message: "Gemma 4 E2B cached",
      phase: "cache",
      progress: 1,
      source: "gemma",
      total: 1,
    });

    return getGemmaCacheStatus();
  }

  onStatus?.({
    message: "Downloading Gemma 4 E2B",
    phase: "download",
    progress: 0,
    source: "gemma",
  });

  const response = await fetch(GEMMA_GENERATION_MODEL_URL, { mode: "cors" });

  if (!response.ok) {
    throw new Error(`Could not download Gemma 4 E2B: ${response.status}`);
  }

  const totalBytes = Number(response.headers.get("content-length")) || 0;
  const cacheWrite = cache.put(GEMMA_GENERATION_MODEL_URL, response.clone());

  if (response.body) {
    const reader = response.body.getReader();
    let loadedBytes = 0;

    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      loadedBytes += value.byteLength;
      onStatus?.({
        loadedBytes,
        message: "Downloading Gemma 4 E2B",
        phase: "download",
        progress: totalBytes ? Math.min(loadedBytes / totalBytes, 1) : 0,
        source: "gemma",
        totalBytes,
      });
    }
  }

  await cacheWrite;

  onStatus?.({
    cached: true,
    cachedCount: 1,
    message: "Gemma 4 E2B cached",
    phase: "cache",
    progress: 1,
    source: "gemma",
    total: 1,
  });

  return getGemmaCacheStatus();
}

export function normalizeTargetText(text) {
  return text
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function makeGeneratedCardId(languageCode, targetText, index) {
  const slug = normalizeTargetText(targetText)
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);

  return `gemma-${languageCode}-${Date.now()}-${index}-${slug || "card"}`;
}

async function loadLlm(onStatus) {
  if (llmPromise) {
    return llmPromise;
  }

  llmPromise = (async () => {
    if (typeof navigator === "undefined" || !("gpu" in navigator)) {
      throw new Error("Gemma 4 E2B web generation requires a WebGPU-capable browser.");
    }

    onStatus?.({
      message: "Loading Gemma runtime",
      phase: "loading",
      source: "gemma",
    });

    const { FilesetResolver, LlmInference } = await import("@mediapipe/tasks-genai");
    const genai = await FilesetResolver.forGenAiTasks(GENAI_WASM_URL);

    onStatus?.({
      message: "Loading Gemma 4 E2B",
      phase: "loading",
      source: "gemma",
    });

    const modelAssetBuffer = await getCachedGemmaModelAsset();

    return LlmInference.createFromOptions(genai, {
      baseOptions: {
        modelAssetBuffer,
      },
      maxTokens: 650,
      randomSeed: Math.floor(Math.random() * 2147483647),
      temperature: 0.75,
      topK: 40,
    });
  })().catch((error) => {
    llmPromise = null;
    throw error;
  });

  return llmPromise;
}

function buildPrompt({ count, existingCards, language }) {
  const existingTargets = existingCards
    .map((card) => card.targetText)
    .filter(Boolean)
    .slice(-MAX_EXISTING_TERMS_IN_PROMPT);

  const arabicRules =
    language.code === "ar"
      ? "For Arabic, use Arabic script for targetText and example. Include vocalized Arabic in ttsText when it improves pronunciation. The phoneticSpelling must match ttsText."
      : "Use ttsText only when pronunciation needs a cleaner spoken form; otherwise repeat targetText.";
  const scriptRule =
    language.code === "ar" ? "- Do not include romanized targetText for Arabic; use Arabic script." : "";

  const countInstruction =
    count === 1
      ? `Generate exactly 1 beginner-friendly ${language.label} language learning card.`
      : `Generate exactly ${count} beginner-friendly ${language.label} language learning cards.`;

  return `${countInstruction}
Choose either one useful vocabulary word or one practical short phrase.
Avoid these existing targetText values: ${existingTargets.join(", ") || "none"}.

Return only valid minified JSON on one line. Do not include markdown, comments, notes, or trailing commas.
Use exactly this shape:
{
  "card": {
    "targetText": "string",
    "ttsText": "string",
    "translation": "string",
    "phoneticSpelling": "string",
    "example": "string",
    "exampleTranslation": "string"
  }
}

Rules:
- languageCode is ${language.code}; do not generate another language.
- Keep every card practical for a casual beginner.
- Do not include offensive, adult, religiously sensitive, political, medical, legal, or financial content.
${scriptRule}
- Keep targetText under 32 characters when possible.
- Keep translations short.
- The phoneticSpelling must describe the exact spoken form in ttsText.
- ${arabicRules}`;
}

function normalizeJsonText(text) {
  return text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function extractBalancedJsonObject(text) {
  const firstBrace = text.indexOf("{");

  if (firstBrace === -1) {
    return "";
  }

  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = firstBrace; index < text.length; index += 1) {
    const character = text[index];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (character === "\\") {
      isEscaped = true;
      continue;
    }

    if (character === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return text.slice(firstBrace, index + 1);
      }
    }
  }

  return "";
}

function extractJsonObject(text) {
  const cleanedText = normalizeJsonText(text);

  try {
    return JSON.parse(cleanedText);
  } catch {
    const jsonObjectText = extractBalancedJsonObject(cleanedText);

    if (!jsonObjectText) {
      throw new Error("Gemma did not return JSON.");
    }

    return JSON.parse(jsonObjectText);
  }
}

function requiredString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getRawGeneratedCards(parsedResult) {
  if (Array.isArray(parsedResult?.cards)) {
    return parsedResult.cards;
  }

  if (parsedResult?.card) {
    return [parsedResult.card];
  }

  if (Array.isArray(parsedResult)) {
    return parsedResult;
  }

  return [];
}

function validateGeneratedCards({ existingCards, language, parsedResult }) {
  const rawCards = getRawGeneratedCards(parsedResult);

  if (rawCards.length === 0) {
    throw new Error("Gemma returned JSON without a card.");
  }

  const seenTargets = new Set(existingCards.map((card) => normalizeTargetText(card.targetText)));
  const acceptedCards = [];
  const createdAt = new Date().toISOString();

  for (const [index, rawCard] of rawCards.entries()) {
    const targetText = requiredString(rawCard?.targetText);
    const translation = requiredString(rawCard?.translation);
    const example = requiredString(rawCard?.example);
    const exampleTranslation = requiredString(rawCard?.exampleTranslation);
    const phoneticSpelling = requiredString(rawCard?.phoneticSpelling);
    const ttsText = requiredString(rawCard?.ttsText) || targetText;
    const normalizedTarget = normalizeTargetText(targetText);

    if (
      !targetText ||
      !translation ||
      !example ||
      !exampleTranslation ||
      !phoneticSpelling ||
      !ttsText ||
      !normalizedTarget ||
      seenTargets.has(normalizedTarget)
    ) {
      continue;
    }

    seenTargets.add(normalizedTarget);
    acceptedCards.push({
      createdAt,
      example,
      exampleTranslation,
      id: makeGeneratedCardId(language.code, targetText, index),
      language: language.label,
      languageCode: language.code,
      phoneticSpelling,
      source: "gemma-4-e2b",
      targetText,
      translation,
      ttsText,
    });

    if (acceptedCards.length === 1) {
      break;
    }
  }

  if (acceptedCards.length === 0) {
    throw new Error("Gemma returned no valid new cards.");
  }

  return acceptedCards;
}

export async function generateLanguageCards({
  count = DEFAULT_BATCH_SIZE,
  existingCards,
  languageCode,
  onStatus,
}) {
  const language = getLanguage(languageCode);

  if (!language) {
    throw new Error(`No generation language config exists for ${languageCode}.`);
  }

  const startedAt = performance.now();
  const llm = await loadLlm(onStatus);
  const prompt = buildPrompt({ count: Math.max(1, Math.min(count, 1)), existingCards, language });

  onStatus?.({
    message: `Generating ${language.label} card`,
    phase: "generating",
    source: "gemma",
  });

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    let partialResponse = "";
    const response = await llm.generateResponse(prompt, (partialResult, done) => {
      if (typeof partialResult === "string") {
        partialResponse += partialResult;
      }

      if (!done) {
        onStatus?.({
          message: `Generating ${language.label} card`,
          phase: "generating",
          source: "gemma",
        });
      }
    });
    const rawResponse = response || partialResponse;

    try {
      const parsedResult = extractJsonObject(rawResponse);
      const cards = validateGeneratedCards({
        existingCards,
        language,
        parsedResult,
      });

      return {
        cards,
        metrics: {
          attempts: attempt,
          totalMs: Math.round(performance.now() - startedAt),
        },
        modelId: GEMMA_GENERATION_MODEL_ID,
      };
    } catch (error) {
      lastError = error;

      if (attempt < MAX_GENERATION_ATTEMPTS) {
        onStatus?.({
          message: `Retrying ${language.label} card`,
          phase: "generating",
          source: "gemma",
        });
      }
    }
  }

  console.warn("Gemma returned an unusable card response.", lastError);
  throw new Error("Gemma returned a malformed card. Scroll again to retry.");
}
