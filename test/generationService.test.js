import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExpectedCardFormat,
  buildPrompt,
  buildCardsFromRawResponse,
  generateLanguageCardsWithLlm,
  getQwenLoadFailureMessage,
  parseGeneratedCardResponse,
} from "../src/generationService.js";

const italian = { code: "it", label: "Italian" };
const arabic = { code: "ar", label: "Arabic" };
const french = { code: "fr", label: "French" };

function validItalianCardText(targetText = "grazie") {
  return `TARGET: ${targetText}
TTS: ${targetText}
TRANSLATION: thank you
PHONETIC: GRAHT-see-eh
EXAMPLE: Grazie per il caffe.
EXAMPLE_TRANSLATION: Thank you for the coffee.`;
}

function validItalianCardJson(targetText = "grazie") {
  return JSON.stringify({
    card: {
      targetText,
      ttsText: targetText,
      translation: "thank you",
      phoneticSpelling: "GRAHT-see-eh",
      example: "Grazie per il caffe.",
      exampleTranslation: "Thank you for the coffee.",
    },
  });
}

function validArabicCardJson(targetText = "\u0623\u0647\u0644\u0627") {
  return JSON.stringify({
    card: {
      targetText,
      ttsText: targetText,
      translation: "hello",
      phoneticSpelling: "AH-lan",
      example: `${targetText} \u064a\u0627 \u0633\u0627\u0631\u0629.`,
      exampleTranslation: "Hello, Sara.",
    },
  });
}

function createFakeLlm(responses) {
  const prompts = [];
  const requests = [];

  return {
    prompts,
    requests,
    chat: {
      completions: {
        async create(request) {
          requests.push(request);
          prompts.push(request.messages.at(-1).content);

          if (responses.length === 0) {
            throw new Error("No fake LLM response queued.");
          }

          return {
            choices: [
              {
                message: {
                  content: responses.shift(),
                },
              },
            ],
          };
        },
      },
    },
  };
}

function getCardSchemaFromFirstRequest(llm) {
  return JSON.parse(llm.requests[0].response_format.schema).properties.card;
}

test("builds a JSON-first prompt contract for WebLLM", () => {
  const prompt = buildPrompt({
    count: 1,
    existingCards: [{ targetText: "ciao" }],
    language: italian,
  });

  assert.match(prompt, /Return only one valid JSON object/);
  assert.match(prompt, /"card"/);
  assert.match(prompt, /"targetText"/);
  assert.match(prompt, /Avoid these existing targetText values: ciao/);
  assert.doesNotMatch(prompt, /labeled lines/);
});

test("adds Arabic script instructions to Arabic prompts", () => {
  const prompt = buildPrompt({
    count: 1,
    existingCards: [],
    language: arabic,
  });

  assert.match(prompt, /Arabic script/);
  assert.match(prompt, /Do not include romanized targetText/);
  assert.match(prompt, /never Arabic script/);
});

test("builds the expected frontend card contract", () => {
  assert.deepEqual(JSON.parse(buildExpectedCardFormat(french)), {
    card: {
      targetText: "[French word or short phrase]",
      ttsText: "[exact text Supertonic should speak]",
      translation: "[short English meaning]",
      phoneticSpelling: "[how to say the ttsText phonetically]",
      example: "[short French example sentence]",
      exampleTranslation: "[short English example meaning]",
    },
  });
});

test("shows a Latin phonetic placeholder for Arabic expected output", () => {
  assert.match(
    JSON.parse(buildExpectedCardFormat(arabic)).card.phoneticSpelling,
    /Latin-letter phonetic guide/,
  );
});

test("parses the legacy labeled LangTok card contract", () => {
  const parsed = parseGeneratedCardResponse(validItalianCardText());

  assert.equal(parsed.card.targetText, "grazie");
  assert.equal(parsed.card.ttsText, "grazie");
  assert.equal(parsed.card.translation, "thank you");
  assert.equal(parsed.card.phoneticSpelling, "GRAHT-see-eh");
  assert.equal(parsed.card.example, "Grazie per il caffe.");
  assert.equal(parsed.card.exampleTranslation, "Thank you for the coffee.");
});

test("parses one-line labeled output when a model ignores line breaks", () => {
  const parsed = parseGeneratedCardResponse(
    "target: bonjour; tts: bonjour; translation: hello; phonetic: bohn-ZHOOR; example: Bonjour, Marie.; example translation: Hello, Marie.",
  );

  assert.equal(parsed.card.targetText, "bonjour");
  assert.equal(parsed.card.exampleTranslation, "Hello, Marie.");
});

test("parses text-wrapped JSON responses", () => {
  const parsed = parseGeneratedCardResponse(`Here is the card:
{"card":{"targetText":"merci","ttsText":"merci","translation":"thanks","phoneticSpelling":"mehr-SEE","example":"Merci beaucoup.","exampleTranslation":"Thank you very much."}}`);

  assert.equal(parsed.card.targetText, "merci");
  assert.equal(parsed.card.phoneticSpelling, "mehr-SEE");
});

test("normalizes a parsed response into an app-ready generated card", () => {
  const cards = buildCardsFromRawResponse({
    existingCards: [],
    language: french,
    rawResponse: `TARGET: bonjour
TTS: bonjour
TRANSLATION: hello
PHONETIC: bohn-ZHOOR
EXAMPLE: Bonjour, Nadia.
EXAMPLE_TRANSLATION: Hello, Nadia.`,
  });

  assert.equal(cards.length, 1);
  assert.equal(cards[0].languageCode, "fr");
  assert.equal(cards[0].source, "qwen2.5-1.5b-webllm");
  assert.match(cards[0].id, /^qwen-fr-/);
});

test("rejects an Arabic card that does not use Arabic script", () => {
  assert.throws(
    () =>
      buildCardsFromRawResponse({
        existingCards: [],
        language: arabic,
        rawResponse: `TARGET: shukran
TTS: shukran
TRANSLATION: thank you
PHONETIC: SHOOK-ran
EXAMPLE: shukran jazeelan
EXAMPLE_TRANSLATION: Thank you very much.`,
      }),
    /no valid new cards/,
  );
});

test("accepts an Arabic card when target, TTS, and example use Arabic script", () => {
  const cards = buildCardsFromRawResponse({
    existingCards: [],
    language: arabic,
    rawResponse: `TARGET: \u0634\u0643\u0631\u0627
TTS: \u0634\u064f\u0643\u0652\u0631\u064b\u0627
TRANSLATION: thank you
PHONETIC: SHOOK-ran
EXAMPLE: \u0634\u0643\u0631\u0627 \u062c\u0632\u064a\u0644\u0627.
EXAMPLE_TRANSLATION: Thank you very much.`,
  });

  assert.equal(cards[0].languageCode, "ar");
  assert.equal(cards[0].targetText, "\u0634\u0643\u0631\u0627");
});

test("rejects Arabic phonetic spelling written in Arabic script with a specific reason", () => {
  const rawResponse = JSON.stringify({
    card: {
      targetText: "\u0645\u0631\u062d\u0628\u0627",
      ttsText: "\u0645\u0631\u062d\u0628\u0627",
      translation: "Hello",
      phoneticSpelling: "\u0645\u064f\u0631\u0652\u062d\u064e\u0651\u0627\u0628\u064c",
      example: "\u0645\u0631\u062d\u0628\u0627 \u0628\u0627\u0644\u0639\u0627\u0644\u0645!",
      exampleTranslation: "Hello, world!",
    },
  });

  assert.throws(
    () =>
      buildCardsFromRawResponse({
        existingCards: [{ targetText: "\u0645\u0631\u062d\u0628\u0627" }],
        language: arabic,
        rawResponse,
      }),
    /targetText ".+" is already in the feed; phoneticSpelling must use Latin phonetic text/,
  );
});

test("rejects parseable cards with rambling fields", () => {
  const longTarget = "word ".repeat(30);

  assert.throws(
    () =>
      buildCardsFromRawResponse({
        existingCards: [],
        language: italian,
        rawResponse: validItalianCardText(longTarget),
      }),
    /no valid new cards/,
  );
});

test("repairs malformed JSON before returning a card", async () => {
  const llm = createFakeLlm([
    '{"card":{"targetText":"grazie" "translation":"thank you"}}',
    validItalianCardJson("per favore"),
  ]);
  const statuses = [];

  const result = await generateLanguageCardsWithLlm({
    existingCards: [],
    language: italian,
    llm,
    onStatus: (status) => statuses.push(status),
  });

  assert.equal(result.cards[0].targetText, "per favore");
  assert.equal(result.metrics.repaired, true);
  assert.equal(result.debug.rawResponse, '{"card":{"targetText":"grazie" "translation":"thank you"}}');
  assert.equal(JSON.parse(result.debug.repairResponse).card.targetText, "per favore");
  assert.match(result.debug.expected, /"exampleTranslation"/);
  assert.equal(llm.prompts.length, 2);
  assert.match(llm.prompts[1], /RAW_MODEL_OUTPUT:/);
  assert.equal(llm.requests[0].response_format.type, "json_object");
  assert.ok(statuses.some((status) => status.message === "Repairing Italian card"));
  assert.ok(statuses.some((status) => status.debug?.problem?.includes("Expected") || status.debug?.problem?.includes("JSON")));
});

test("uses deterministic WebLLM JSON request settings", async () => {
  const llm = createFakeLlm([validItalianCardJson("salve")]);

  await generateLanguageCardsWithLlm({
    existingCards: [],
    language: italian,
    llm,
  });

  assert.equal(llm.requests[0].response_format.type, "json_object");
  assert.equal(llm.requests[0].stream, false);
  assert.equal(llm.requests[0].temperature, 0);
  assert.equal(llm.requests[0].top_p, 1);
  assert.equal(llm.requests[0].max_tokens, 420);
  assert.equal("seed" in llm.requests[0], false);
});

test("sends a conservative Arabic JSON schema to WebLLM", async () => {
  const llm = createFakeLlm([validArabicCardJson("\u0634\u0643\u0631\u0627")]);

  await generateLanguageCardsWithLlm({
    existingCards: [],
    language: arabic,
    llm,
  });

  const schema = getCardSchemaFromFirstRequest(llm);

  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, [
    "targetText",
    "ttsText",
    "translation",
    "phoneticSpelling",
    "example",
    "exampleTranslation",
  ]);
  assert.equal(schema.properties.targetText.type, "string");
  assert.equal("minLength" in schema.properties.targetText, false);
  assert.equal("maxLength" in schema.properties.targetText, false);
  assert.match(schema.properties.targetText.description, /Arabic script/);
  assert.match(schema.properties.phoneticSpelling.description, /Never use Arabic script/);
});

test("does not send Arabic-only phonetic instructions for Latin-language cards", async () => {
  const llm = createFakeLlm([validItalianCardJson("salve")]);

  await generateLanguageCardsWithLlm({
    existingCards: [],
    language: italian,
    llm,
  });

  const schema = getCardSchemaFromFirstRequest(llm);

  assert.match(schema.properties.phoneticSpelling.description, /Plain-English phonetic spelling/);
  assert.doesNotMatch(schema.properties.phoneticSpelling.description, /Arabic script/);
});

test("explains Qwen network load failures separately from card validation failures", () => {
  assert.equal(
    getQwenLoadFailureMessage(new Error("Failed to fetch")),
    "Could not download Qwen2.5 1.5B model files. Check Hugging Face/network access, then retry.",
  );

  assert.equal(
    getQwenLoadFailureMessage(new Error("WebGPU unavailable")),
    "Could not load Qwen2.5 1.5B: WebGPU unavailable",
  );
});

test("repair prompt tells Qwen to replace duplicate Arabic cards and use Latin phonetics", async () => {
  const llm = createFakeLlm([
    JSON.stringify({
      card: {
        targetText: "\u0645\u0631\u062d\u0628\u0627",
        ttsText: "\u0645\u0631\u062d\u0628\u0627",
        translation: "Hello",
        phoneticSpelling: "\u0645\u064f\u0631\u0652\u062d\u064e\u0651\u0627\u0628\u064c",
        example: "\u0645\u0631\u062d\u0628\u0627 \u0628\u0627\u0644\u0639\u0627\u0644\u0645!",
        exampleTranslation: "Hello, world!",
      },
    }),
    validArabicCardJson("\u0623\u0647\u0644\u0627"),
  ]);

  const result = await generateLanguageCardsWithLlm({
    existingCards: [{ targetText: "\u0645\u0631\u062d\u0628\u0627" }],
    language: arabic,
    llm,
  });

  assert.equal(result.cards[0].targetText, "\u0623\u0647\u0644\u0627");
  assert.equal(result.metrics.repaired, true);
  assert.match(llm.prompts[1], /If the problem says the card is a duplicate/);
  assert.match(llm.prompts[1], /phoneticSpelling must use Latin letters/);
  assert.match(llm.prompts[1], /Avoid these existing targetText values: \u0645\u0631\u062d\u0628\u0627/);
});

test("retries when the first raw response and its repair are both unusable", async () => {
  const llm = createFakeLlm(["not a card", "still not a card", validItalianCardJson("scusi")]);

  const result = await generateLanguageCardsWithLlm({
    existingCards: [],
    language: italian,
    llm,
  });

  assert.equal(result.cards[0].targetText, "scusi");
  assert.equal(result.metrics.attempts, 2);
  assert.equal(result.metrics.repaired, false);
  assert.equal(llm.prompts.length, 3);
});
