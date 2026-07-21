import { LANGUAGES } from "./data.js";

export const QWEN_GENERATION_MODEL_ID = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";
export const QWEN_GENERATION_MODEL_LABEL = "Qwen2.5 1.5B";

const DEFAULT_BATCH_SIZE = 1;
const MAX_EXISTING_TERMS_IN_PROMPT = 36;
const MAX_GENERATION_ATTEMPTS = 2;
const MAX_DEBUG_RESPONSE_LENGTH = 6000;
const MAX_RAW_RESPONSE_IN_REPAIR_PROMPT = 900;
const QWEN_READY_STORAGE_KEY = "langtok:qwen2.5-1.5b-webllm:ready";
const QWEN_SOURCE = "qwen2.5-1.5b-webllm";

const CARD_FIELD_LABELS = {
  example: ["EXAMPLE", "SENTENCE"],
  exampleTranslation: [
    "EXAMPLE_TRANSLATION",
    "EXAMPLE_TRANSLATION_ENGLISH",
    "EXAMPLE_MEANING",
    "SENTENCE_TRANSLATION",
  ],
  phoneticSpelling: ["PHONETIC", "PHONETIC_SPELLING", "SAY_IT", "HOW_TO_SAY"],
  targetText: ["TARGET", "TARGET_TEXT", "TERM", "WORD", "PHRASE"],
  translation: ["TRANSLATION", "ENGLISH", "MEANING"],
  ttsText: ["TTS", "TTS_TEXT", "SPEAK"],
};

const CARD_LABEL_TO_FIELD = new Map(
  Object.entries(CARD_FIELD_LABELS).flatMap(([field, labels]) =>
    labels.map((label) => [label, field]),
  ),
);

const CARD_FIELD_LIMITS = {
  example: 180,
  exampleTranslation: 180,
  phoneticSpelling: 120,
  targetText: 80,
  translation: 120,
  ttsText: 100,
};

const CARD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["card"],
  properties: {
    card: {
      type: "object",
      additionalProperties: false,
      required: [
        "targetText",
        "ttsText",
        "translation",
        "phoneticSpelling",
        "example",
        "exampleTranslation",
      ],
      properties: {
        targetText: {
          type: "string",
          description: "The target word or short phrase in the selected language.",
        },
        ttsText: {
          type: "string",
          description: "The exact text Supertonic should speak in the selected language.",
        },
        translation: {
          type: "string",
          description: "Short English meaning of targetText.",
        },
        phoneticSpelling: {
          type: "string",
          description: "Plain-English phonetic spelling of ttsText.",
        },
        example: {
          type: "string",
          description: "Short example sentence in the selected language.",
        },
        exampleTranslation: {
          type: "string",
          description: "Short English meaning of example.",
        },
      },
    },
  },
};

const QWEN_RESPONSE_FORMAT = {
  type: "json_object",
  schema: JSON.stringify(CARD_SCHEMA),
};

let llmPromise = null;
let webLlmModulePromise = null;

function hasCacheApi() {
  return typeof window !== "undefined" && "caches" in window;
}

function hasLocalStorage() {
  return typeof window !== "undefined" && "localStorage" in window;
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

function clampUnit(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return Math.min(Math.max(value, 0), 1);
}

function getStoredQwenReadyMarker() {
  if (!hasLocalStorage()) {
    return false;
  }

  try {
    return window.localStorage.getItem(QWEN_READY_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function setStoredQwenReadyMarker(value) {
  if (!hasLocalStorage()) {
    return;
  }

  try {
    if (value) {
      window.localStorage.setItem(QWEN_READY_STORAGE_KEY, "true");
    } else {
      window.localStorage.removeItem(QWEN_READY_STORAGE_KEY);
    }
  } catch {
    // Best effort only. WebLLM's cache remains the source of truth.
  }
}

async function getWebLlmModule() {
  if (!webLlmModulePromise) {
    webLlmModulePromise = import("@mlc-ai/web-llm");
  }

  return webLlmModulePromise;
}

async function hasQwenModelInCache() {
  if (!hasCacheApi()) {
    return false;
  }

  try {
    const { hasModelInCache } = await getWebLlmModule();

    return hasModelInCache(QWEN_GENERATION_MODEL_ID);
  } catch (error) {
    console.warn("LangTok could not inspect the WebLLM cache.", error);
    return getStoredQwenReadyMarker();
  }
}

function buildQwenStatus({
  cached,
  checked = true,
  loadedBytes = 0,
  message,
  phase = "cache",
  progress,
  totalBytes = 0,
} = {}) {
  const isCached = Boolean(cached);

  return {
    cached: isCached,
    cachedCount: isCached ? 1 : 0,
    checked,
    loadedBytes,
    message: message ?? (isCached ? `${QWEN_GENERATION_MODEL_LABEL} cached` : "Not cached"),
    modelId: QWEN_GENERATION_MODEL_ID,
    phase,
    progress: typeof progress === "number" ? clampUnit(progress) : isCached ? 1 : 0,
    supportsCache: hasCacheApi(),
    supportsWebGpu: supportsWebGpu(),
    total: 1,
    totalBytes,
  };
}

export async function getQwenCacheStatus() {
  const cached = await hasQwenModelInCache();

  return buildQwenStatus({ cached });
}

export async function preloadQwenModel({ onStatus } = {}) {
  if (!hasCacheApi()) {
    throw new Error("This browser does not support persistent WebLLM model caching.");
  }

  if (!supportsWebGpu()) {
    throw new Error(`${QWEN_GENERATION_MODEL_LABEL} requires a WebGPU-capable browser.`);
  }

  const cacheStatus = await getQwenCacheStatus();

  if (cacheStatus.cached) {
    onStatus?.(buildQwenStatus({ cached: true, message: `${QWEN_GENERATION_MODEL_LABEL} cached` }));
    return cacheStatus;
  }

  onStatus?.(
    buildQwenStatus({
      cached: false,
      message: `Downloading ${QWEN_GENERATION_MODEL_LABEL}`,
      phase: "download",
      progress: 0,
    }),
  );

  await loadLlm(onStatus);
  setStoredQwenReadyMarker(true);

  const finalStatus = await getQwenCacheStatus();
  const readyStatus = buildQwenStatus({
    ...finalStatus,
    cached: true,
    message: `${QWEN_GENERATION_MODEL_LABEL} cached`,
    progress: 1,
  });

  onStatus?.(readyStatus);

  return readyStatus;
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

  return `qwen-${languageCode}-${Date.now()}-${index}-${slug || "card"}`;
}

async function loadLlm(onStatus) {
  if (llmPromise) {
    return llmPromise;
  }

  llmPromise = (async () => {
    if (!supportsWebGpu()) {
      throw new Error(`${QWEN_GENERATION_MODEL_LABEL} requires a WebGPU-capable browser.`);
    }

    onStatus?.(
      buildQwenStatus({
        checked: true,
        message: "Loading WebLLM runtime",
        phase: "loading",
        progress: 0,
      }),
    );

    const { CreateMLCEngine } = await getWebLlmModule();

    return CreateMLCEngine(
      QWEN_GENERATION_MODEL_ID,
      {
        initProgressCallback: (report) => {
          const progress = clampUnit(report?.progress ?? 0);
          const message = report?.text || `Loading ${QWEN_GENERATION_MODEL_LABEL}`;

          onStatus?.(
            buildQwenStatus({
              checked: true,
              message,
              phase: "download",
              progress,
            }),
          );
        },
      },
      {
        repetition_penalty: 1.05,
        temperature: 0.2,
        top_p: 0.8,
      },
    );
  })().catch((error) => {
    llmPromise = null;
    throw error;
  });

  return llmPromise;
}

export function buildPrompt({ count, existingCards, language }) {
  const existingTargets = existingCards
    .map((card) => card.targetText)
    .filter(Boolean)
    .slice(-MAX_EXISTING_TERMS_IN_PROMPT);

  const arabicRules =
    language.code === "ar"
      ? "For Arabic, use Arabic script for targetText, ttsText, and example. Use vocal marks in ttsText when they improve pronunciation. The phoneticSpelling must be a Latin-letter pronunciation guide such as mar-HA-ban, never Arabic script, and it must match ttsText exactly."
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

Return only one valid JSON object. Do not return markdown, code fences, comments, explanations, bullets, or fields outside the schema.
The JSON must match this exact shape:
${buildExpectedCardFormat(language)}

Rules:
- languageCode is ${language.code}; do not generate another language.
- Keep every card practical for a casual beginner.
- Do not include offensive, adult, religiously sensitive, political, medical, legal, or financial content.
${scriptRule}
- Keep targetText under 32 characters when possible.
- Keep translations short.
- targetText, ttsText, and example must be in ${language.label}.
- translation and exampleTranslation must be in English.
- phoneticSpelling must describe the exact spoken form in ttsText.
- Do not add metadata, difficulty, part of speech, use labels, or explanations.
- ${arabicRules}`;
}

export function buildExpectedCardFormat(language) {
  const phoneticSpelling =
    language.code === "ar"
      ? "[Latin-letter phonetic guide for ttsText, e.g. mar-HA-ban]"
      : "[how to say the ttsText phonetically]";

  return JSON.stringify(
    {
      card: {
        targetText: `[${language.label} word or short phrase]`,
        ttsText: "[exact text Supertonic should speak]",
        translation: "[short English meaning]",
        phoneticSpelling,
        example: `[short ${language.label} example sentence]`,
        exampleTranslation: "[short English example meaning]",
      },
    },
    null,
    2,
  );
}

function normalizeGeneratedText(text) {
  return String(text ?? "")
    .trim()
    .replace(/^```(?:json|text)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function normalizeJsonText(text) {
  return normalizeGeneratedText(text);
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
      throw new Error("Qwen did not return JSON.");
    }

    return JSON.parse(jsonObjectText);
  }
}

function normalizeCardFieldLabel(label) {
  return label
    .replace(/^[\d.\-*\s]+/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w]/g, "")
    .toUpperCase();
}

function cleanCardValue(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/^[`"']+/g, "")
    .replace(/[`"',;|]+$/g, "")
    .trim();
}

function parseLabeledCard(text) {
  const cleanedText = normalizeGeneratedText(text);

  if (!cleanedText) {
    return null;
  }

  const fieldPattern =
    /(?:^|[\n\r;|])\s*(?:[-*]|\d+[.)])?\s*([A-Za-z][A-Za-z_ -]{1,44})\s*[:=]\s*/g;
  const matches = [];
  let match = fieldPattern.exec(cleanedText);

  while (match) {
    const normalizedLabel = normalizeCardFieldLabel(match[1]);
    const field = CARD_LABEL_TO_FIELD.get(normalizedLabel);

    if (field) {
      matches.push({
        field,
        markerStart: match.index,
        valueStart: fieldPattern.lastIndex,
      });
    }

    match = fieldPattern.exec(cleanedText);
  }

  if (matches.length === 0) {
    return null;
  }

  const card = {};

  for (const [index, fieldMatch] of matches.entries()) {
    const nextMatch = matches[index + 1];
    const valueEnd = nextMatch ? nextMatch.markerStart : cleanedText.length;
    const value = cleanCardValue(cleanedText.slice(fieldMatch.valueStart, valueEnd));

    if (value && !card[fieldMatch.field]) {
      card[fieldMatch.field] = value;
    }
  }

  if (!card.ttsText && card.targetText) {
    card.ttsText = card.targetText;
  }

  if (
    !card.targetText ||
    !card.translation ||
    !card.phoneticSpelling ||
    !card.example ||
    !card.exampleTranslation
  ) {
    return null;
  }

  return { card };
}

export function parseGeneratedCardResponse(text) {
  try {
    return extractJsonObject(text);
  } catch (jsonError) {
    const labeledCard = parseLabeledCard(text);

    if (labeledCard) {
      return labeledCard;
    }

    throw jsonError;
  }
}

function truncateForPrompt(text) {
  const cleanedText = normalizeGeneratedText(text);

  return cleanedText.length > MAX_RAW_RESPONSE_IN_REPAIR_PROMPT
    ? `${cleanedText.slice(0, MAX_RAW_RESPONSE_IN_REPAIR_PROMPT)}...`
    : cleanedText;
}

function buildExistingTargetsText(existingCards = []) {
  return (
    existingCards
      .map((card) => card.targetText)
      .filter(Boolean)
      .slice(-MAX_EXISTING_TERMS_IN_PROMPT)
      .join(", ") || "none"
  );
}

function buildRepairPrompt({ existingCards, language, problem, rawResponse }) {
  return `Convert the raw model output into exactly one valid LangTok ${language.label} card.

Return only one valid JSON object. Do not return markdown, code fences, comments, explanations, bullets, or fields outside the schema.
The JSON must match this exact shape:
${buildExpectedCardFormat(language)}

Rules:
- targetText, ttsText, and example must be in ${language.label}.
- translation and exampleTranslation must be in English.
- phoneticSpelling must use Latin letters and must match ttsText.
- For Arabic, phoneticSpelling must be a readable Latin guide like SHOOK-ran or mar-HA-ban, never Arabic script.
- If the problem says the card is a duplicate, generate a different beginner-friendly targetText.
- Avoid these existing targetText values: ${buildExistingTargetsText(existingCards)}.
- Do not invent metadata, difficulty, part of speech, use labels, or explanations.

FIRST_PASS_PROBLEM:
${problem || "The first response did not pass LangTok validation."}

RAW_MODEL_OUTPUT:
${truncateForPrompt(rawResponse) || "empty"}`;
}

function truncateForDebug(text) {
  const cleanedText = normalizeGeneratedText(text);

  return cleanedText.length > MAX_DEBUG_RESPONSE_LENGTH
    ? `${cleanedText.slice(0, MAX_DEBUG_RESPONSE_LENGTH)}\n\n[truncated]`
    : cleanedText;
}

function createGenerationDebug({
  attempt,
  expected,
  problem = "",
  rawResponse = "",
  repairResponse = "",
  stage,
}) {
  return {
    attempt,
    expected,
    problem,
    rawResponse: truncateForDebug(rawResponse),
    repairResponse: truncateForDebug(repairResponse),
    stage,
  };
}

function emitGenerationDebug({ attempt, expected, message, onStatus, problem, rawResponse, repairResponse, stage }) {
  const debug = createGenerationDebug({
    attempt,
    expected,
    problem,
    rawResponse,
    repairResponse,
    stage,
  });

  onStatus?.({
    debug,
    message,
    phase: "generating",
    source: "qwen",
  });

  return debug;
}

function createGenerationError(message, debug) {
  const error = new Error(message);
  error.generationDebug = debug;

  return error;
}

function requiredString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hasArabicScript(value) {
  return /[\u0600-\u06FF]/.test(value);
}

function hasLatinScript(value) {
  return /[A-Za-z]/.test(value);
}

function phoneticSpellingMatchesContract({ language, phoneticSpelling }) {
  if (!hasLatinScript(phoneticSpelling)) {
    return false;
  }

  if (language.code === "ar") {
    return !hasArabicScript(phoneticSpelling);
  }

  return true;
}

function getLengthRejectionReasons(card) {
  return Object.entries(CARD_FIELD_LIMITS).flatMap(([field, maxLength]) => {
    const value = requiredString(card[field]);

    return value && value.length > maxLength
      ? [`${field} is too long (${value.length}/${maxLength} characters)`]
      : [];
  });
}

function getScriptRejectionReasons({ example, language, targetText, ttsText }) {
  if (language.code === "ar") {
    return [
      !hasArabicScript(targetText) ? "targetText must use Arabic script" : "",
      !hasArabicScript(ttsText) ? "ttsText must use Arabic script" : "",
      !hasArabicScript(example) ? "example must use Arabic script" : "",
    ].filter(Boolean);
  }

  if (language.code === "it" || language.code === "fr") {
    return [
      !hasLatinScript(targetText) ? "targetText must use Latin script" : "",
      !hasLatinScript(example) ? "example must use Latin script" : "",
    ].filter(Boolean);
  }

  return [];
}

function getCardRejectionReasons({ language, normalizedRawCard, normalizedTarget, seenTargets }) {
  const { example, exampleTranslation, phoneticSpelling, targetText, translation, ttsText } =
    normalizedRawCard;
  const reasons = [
    !targetText ? "targetText is missing" : "",
    !translation ? "translation is missing" : "",
    !example ? "example is missing" : "",
    !exampleTranslation ? "exampleTranslation is missing" : "",
    !phoneticSpelling ? "phoneticSpelling is missing" : "",
    !ttsText ? "ttsText is missing" : "",
    !normalizedTarget ? "targetText normalizes to an empty value" : "",
    normalizedTarget && seenTargets.has(normalizedTarget)
      ? `targetText "${targetText}" is already in the feed`
      : "",
    ...getLengthRejectionReasons(normalizedRawCard),
    ...getScriptRejectionReasons({ example, language, targetText, ttsText }),
    phoneticSpelling && !phoneticSpellingMatchesContract({ language, phoneticSpelling })
      ? "phoneticSpelling must use Latin phonetic text and match ttsText"
      : "",
  ].filter(Boolean);

  return reasons;
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
    throw new Error("Qwen returned a response without a card.");
  }

  const seenTargets = new Set(existingCards.map((card) => normalizeTargetText(card.targetText)));
  const acceptedCards = [];
  const createdAt = new Date().toISOString();
  const rejectionReasons = [];

  for (const [index, rawCard] of rawCards.entries()) {
    const targetText = requiredString(rawCard?.targetText);
    const translation = requiredString(rawCard?.translation);
    const example = requiredString(rawCard?.example);
    const exampleTranslation = requiredString(rawCard?.exampleTranslation);
    const phoneticSpelling = requiredString(rawCard?.phoneticSpelling);
    const ttsText = requiredString(rawCard?.ttsText) || targetText;
    const normalizedTarget = normalizeTargetText(targetText);
    const normalizedRawCard = {
      example,
      exampleTranslation,
      phoneticSpelling,
      targetText,
      translation,
      ttsText,
    };
    const cardRejectionReasons = getCardRejectionReasons({
      language,
      normalizedRawCard,
      normalizedTarget,
      seenTargets,
    });

    if (cardRejectionReasons.length > 0) {
      rejectionReasons.push(`card ${index + 1}: ${cardRejectionReasons.join("; ")}`);
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
      source: QWEN_SOURCE,
      targetText,
      translation,
      ttsText,
    });

    if (acceptedCards.length === 1) {
      break;
    }
  }

  if (acceptedCards.length === 0) {
    const detail = rejectionReasons.length ? ` ${rejectionReasons.join(" | ")}` : "";

    throw new Error(`Qwen returned no valid new cards:${detail}`);
  }

  return acceptedCards;
}

function buildQwenMessages({ language, prompt }) {
  return [
    {
      role: "system",
      content: `You are LangTok's local browser card generator. Return one valid JSON object for a beginner ${language.label} learning card. Never include markdown or prose outside JSON.`,
    },
    {
      role: "user",
      content: prompt,
    },
  ];
}

async function generateRawResponse({ language, llm, onStatus, prompt, statusMessage }) {
  onStatus?.({
    message: statusMessage,
    phase: "generating",
    source: "qwen",
  });

  if (llm?.chat?.completions?.create) {
    const response = await llm.chat.completions.create({
      max_tokens: 320,
      messages: buildQwenMessages({ language, prompt }),
      model: QWEN_GENERATION_MODEL_ID,
      repetition_penalty: 1.05,
      response_format: QWEN_RESPONSE_FORMAT,
      seed: Math.floor(Math.random() * 2147483647),
      temperature: 0.15,
      top_p: 0.8,
    });

    return requiredString(response?.choices?.[0]?.message?.content);
  }

  if (llm?.generateResponse) {
    return llm.generateResponse(prompt);
  }

  throw new Error("Qwen runtime is not available.");
}

export function buildCardsFromRawResponse({ existingCards, language, rawResponse }) {
  const parsedResult = parseGeneratedCardResponse(rawResponse);

  return validateGeneratedCards({
    existingCards,
    language,
    parsedResult,
  });
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

  return generateLanguageCardsWithLlm({
    count,
    existingCards,
    language,
    llm,
    onStatus,
    startedAt,
  });
}

export async function generateLanguageCardsWithLlm({
  count = DEFAULT_BATCH_SIZE,
  existingCards,
  language,
  llm,
  onStatus,
  startedAt = performance.now(),
}) {
  const expected = buildExpectedCardFormat(language);
  const prompt = buildPrompt({ count: Math.max(1, Math.min(count, 1)), existingCards, language });

  let lastDebug = emitGenerationDebug({
    attempt: 0,
    expected,
    message: `Generating ${language.label} card`,
    onStatus,
    problem: "Waiting for Qwen output.",
    stage: "waiting",
  });

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const rawResponse = await generateRawResponse({
      language,
      llm,
      onStatus,
      prompt,
      statusMessage: `Generating ${language.label} card`,
    });

    lastDebug = emitGenerationDebug({
      attempt,
      expected,
      message: `Validating ${language.label} card`,
      onStatus,
      problem: "Checking Qwen output against the LangTok card contract.",
      rawResponse,
      stage: "validating",
    });

    try {
      const cards = buildCardsFromRawResponse({
        existingCards,
        language,
        rawResponse,
      });
      lastDebug = createGenerationDebug({
        attempt,
        expected,
        problem: "Qwen output accepted.",
        rawResponse,
        stage: "accepted",
      });

      return {
        cards,
        debug: lastDebug,
        metrics: {
          attempts: attempt,
          repaired: false,
          totalMs: Math.round(performance.now() - startedAt),
        },
        modelId: QWEN_GENERATION_MODEL_ID,
      };
    } catch (error) {
      lastError = error;
      const problem = getErrorMessage(error);

      lastDebug = emitGenerationDebug({
        attempt,
        expected,
        message: `Repairing ${language.label} card`,
        onStatus,
        problem,
        rawResponse,
        stage: "repairing",
      });

      try {
        const repairPrompt = buildRepairPrompt({ existingCards, language, problem, rawResponse });
        const repairedRawResponse = await generateRawResponse({
          language,
          llm,
          onStatus,
          prompt: repairPrompt,
          statusMessage: `Repairing ${language.label} card`,
        });
        lastDebug = emitGenerationDebug({
          attempt,
          expected,
          message: `Validating repaired ${language.label} card`,
          onStatus,
          problem: "Checking repaired output against the LangTok card contract.",
          rawResponse,
          repairResponse: repairedRawResponse,
          stage: "validating-repair",
        });
        const cards = buildCardsFromRawResponse({
          existingCards,
          language,
          rawResponse: repairedRawResponse,
        });
        lastDebug = createGenerationDebug({
          attempt,
          expected,
          problem: "Repair output accepted.",
          rawResponse,
          repairResponse: repairedRawResponse,
          stage: "accepted-repair",
        });

        return {
          cards,
          debug: lastDebug,
          metrics: {
            attempts: attempt,
            repaired: true,
            totalMs: Math.round(performance.now() - startedAt),
          },
          modelId: QWEN_GENERATION_MODEL_ID,
        };
      } catch (repairError) {
        lastError = repairError;
        lastDebug = emitGenerationDebug({
          attempt,
          expected,
          message: `Rejected repaired ${language.label} card`,
          onStatus,
          problem: getErrorMessage(repairError),
          rawResponse,
          repairResponse: lastDebug.repairResponse,
          stage: "rejected-repair",
        });
      }

      if (attempt < MAX_GENERATION_ATTEMPTS) {
        lastDebug = emitGenerationDebug({
          attempt,
          expected,
          message: `Retrying ${language.label} card`,
          onStatus,
          problem: getErrorMessage(lastError),
          rawResponse: lastDebug.rawResponse,
          repairResponse: lastDebug.repairResponse,
          stage: "retrying",
        });
      }
    }
  }

  console.warn("Qwen returned an unusable card response.", lastError);
  throw createGenerationError("Qwen did not return a usable card. Keep scrolling to retry.", lastDebug);
}
