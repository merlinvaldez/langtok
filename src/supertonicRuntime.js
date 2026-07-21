import * as ort from "onnxruntime-web";

// Runtime flow adapted from the MIT-licensed Supertonic browser helper.
export const SUPERTONIC_MODEL_ID = "Supertone/supertonic-3";
export const SUPERTONIC_ASSET_BASE =
  "https://huggingface.co/Supertone/supertonic-3/resolve/main";
export const SUPERTONIC_VOICE_STYLE = "M1";

const SUPERTONIC_CACHE_NAME = "langtok:supertonic-3:v1";
const SUPPORTED_SUPERTONIC_LANGS = [
  "ar",
  "fr",
  "it",
];

const MODEL_ASSETS = [
  { label: "config", path: "onnx/tts.json", type: "json" },
  { label: "text index", path: "onnx/unicode_indexer.json", type: "json" },
  { label: "duration model", path: "onnx/duration_predictor.onnx", type: "onnx" },
  { label: "text encoder", path: "onnx/text_encoder.onnx", type: "onnx" },
  { label: "speech model", path: "onnx/vector_estimator.onnx", type: "onnx" },
  { label: "vocoder", path: "onnx/vocoder.onnx", type: "onnx" },
  { label: "voice style", path: `voice_styles/${SUPERTONIC_VOICE_STYLE}.json`, type: "json" },
];

let runtimePromise = null;
let runtime = null;

function hasCacheApi() {
  return typeof window !== "undefined" && "caches" in window;
}

function assetUrl(path) {
  return `${SUPERTONIC_ASSET_BASE}/${path}`;
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function assertSupportedLanguage(languageCode) {
  if (!SUPPORTED_SUPERTONIC_LANGS.includes(languageCode)) {
    throw new Error(`Supertonic is not enabled for ${languageCode}.`);
  }
}

async function openModelCache() {
  if (!hasCacheApi()) {
    return null;
  }

  return window.caches.open(SUPERTONIC_CACHE_NAME);
}

async function getCachedResponse(path) {
  const cache = await openModelCache();

  if (!cache) {
    return null;
  }

  return cache.match(assetUrl(path));
}

function buildAssetProgress({ assetIndex, assetTotal, loadedBytes, totalBytes }) {
  if (!assetIndex || !assetTotal) {
    return totalBytes ? Math.min(loadedBytes / totalBytes, 1) : 0;
  }

  const completedAssets = assetIndex - 1;
  const currentAssetProgress = totalBytes ? Math.min(loadedBytes / totalBytes, 1) : 0;

  return Math.min((completedAssets + currentAssetProgress) / assetTotal, 1);
}

async function fetchAsset(asset, onStatus, context = {}) {
  const url = assetUrl(asset.path);
  const cache = await openModelCache();
  const cachedResponse = cache ? await cache.match(url) : null;

  if (cachedResponse) {
    return cachedResponse.clone();
  }

  onStatus?.({
    assetIndex: context.assetIndex,
    assetTotal: context.assetTotal,
    message: `Downloading ${asset.label}`,
    phase: "download",
    progress: buildAssetProgress({
      assetIndex: context.assetIndex,
      assetTotal: context.assetTotal,
      loadedBytes: 0,
      totalBytes: 0,
    }),
    source: "supertonic",
  });

  const response = await fetch(url, { mode: "cors" });

  if (!response.ok) {
    throw new Error(`Could not download ${asset.label}: ${response.status}`);
  }

  if (cache) {
    const cacheWrite = cache.put(url, response.clone());
    const totalBytes = Number(response.headers.get("content-length")) || 0;

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
          assetIndex: context.assetIndex,
          assetTotal: context.assetTotal,
          loadedBytes,
          message: `Downloading ${asset.label}`,
          phase: "download",
          progress: buildAssetProgress({
            assetIndex: context.assetIndex,
            assetTotal: context.assetTotal,
            loadedBytes,
            totalBytes,
          }),
          source: "supertonic",
          totalBytes,
        });
      }
    }

    await cacheWrite;
    return cache.match(url);
  }

  return response;
}

async function readJsonAsset(path, onStatus) {
  const asset = MODEL_ASSETS.find((candidate) => candidate.path === path);
  const response = await fetchAsset(asset ?? { label: path, path, type: "json" }, onStatus);

  return response.json();
}

async function readModelAsset(path, onStatus) {
  const asset = MODEL_ASSETS.find((candidate) => candidate.path === path);
  const response = await fetchAsset(asset ?? { label: path, path, type: "onnx" }, onStatus);

  return response.arrayBuffer();
}

export async function getSupertonicCacheStatus() {
  if (!hasCacheApi()) {
    return {
      cached: false,
      cachedCount: 0,
      checked: true,
      modelId: SUPERTONIC_MODEL_ID,
      supportsCache: false,
      total: MODEL_ASSETS.length,
    };
  }

  const cachedFlags = await Promise.all(
    MODEL_ASSETS.map(async (asset) => Boolean(await getCachedResponse(asset.path))),
  );
  const cachedCount = cachedFlags.filter(Boolean).length;

  return {
    cached: cachedCount === MODEL_ASSETS.length,
    cachedCount,
    checked: true,
    modelId: SUPERTONIC_MODEL_ID,
    supportsCache: true,
    total: MODEL_ASSETS.length,
  };
}

export async function preloadSupertonicAssets({ onStatus } = {}) {
  for (const [index, asset] of MODEL_ASSETS.entries()) {
    const cachedResponse = await getCachedResponse(asset.path);

    if (!cachedResponse) {
      const response = await fetchAsset(asset, onStatus, {
        assetIndex: index + 1,
        assetTotal: MODEL_ASSETS.length,
      });

      if (asset.type === "json") {
        await response.text();
      } else {
        await response.arrayBuffer();
      }
    }

    onStatus?.({
      cachedCount: index + 1,
      message: `Cached ${index + 1}/${MODEL_ASSETS.length}`,
      phase: "cache",
      progress: (index + 1) / MODEL_ASSETS.length,
      source: "supertonic",
      total: MODEL_ASSETS.length,
    });
  }

  return getSupertonicCacheStatus();
}

class UnicodeProcessor {
  constructor(indexer) {
    this.indexer = indexer;
  }

  call(textList, langList) {
    const processedTexts = textList.map((text, index) =>
      this.preprocessText(text, langList[index]),
    );
    const textIdsLengths = processedTexts.map((text) => text.length);
    const maxLen = Math.max(...textIdsLengths);

    const textIds = processedTexts.map((text) => {
      const row = new Array(maxLen).fill(0);

      for (let index = 0; index < text.length; index += 1) {
        const codePoint = text.codePointAt(index);
        row[index] = codePoint < this.indexer.length ? this.indexer[codePoint] : -1;
      }

      return row;
    });

    return {
      textIds,
      textMask: this.getTextMask(textIdsLengths),
    };
  }

  preprocessText(text, lang) {
    assertSupportedLanguage(lang);

    let normalizedText = text.normalize("NFKD");
    normalizedText = normalizedText.replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu,
      "",
    );

    const replacements = {
      "–": "-",
      "‑": "-",
      "—": "-",
      _: " ",
      "\u201C": '"',
      "\u201D": '"',
      "\u2018": "'",
      "\u2019": "'",
      "´": "'",
      "`": "'",
      "[": " ",
      "]": " ",
      "|": " ",
      "/": " ",
      "#": " ",
      "→": " ",
      "←": " ",
    };

    for (const [target, replacement] of Object.entries(replacements)) {
      normalizedText = normalizedText.replaceAll(target, replacement);
    }

    normalizedText = normalizedText.replace(/[♥☆♡©\\]/g, "");

    const expressionReplacements = {
      "@": " at ",
      "e.g.,": "for example, ",
      "i.e.,": "that is, ",
    };

    for (const [target, replacement] of Object.entries(expressionReplacements)) {
      normalizedText = normalizedText.replaceAll(target, replacement);
    }

    normalizedText = normalizedText
      .replace(/ ,/g, ",")
      .replace(/ \./g, ".")
      .replace(/ !/g, "!")
      .replace(/ \?/g, "?")
      .replace(/ ;/g, ";")
      .replace(/ :/g, ":")
      .replace(/ '/g, "'")
      .replace(/\s+/g, " ")
      .trim();

    while (normalizedText.includes('""')) {
      normalizedText = normalizedText.replace('""', '"');
    }

    while (normalizedText.includes("''")) {
      normalizedText = normalizedText.replace("''", "'");
    }

    if (!/[.!?;:,'")\]}\u2026\u3002\u300D\u300F\u3011\u3009\u300B\u203A\u00BB]$/.test(normalizedText)) {
      normalizedText += ".";
    }

    return `<${lang}>${normalizedText}</${lang}>`;
  }

  getTextMask(textIdsLengths) {
    const maxLen = Math.max(...textIdsLengths);

    return textIdsLengths.map((length) => {
      const row = new Array(maxLen).fill(0.0);

      for (let index = 0; index < Math.min(length, maxLen); index += 1) {
        row[index] = 1.0;
      }

      return [row];
    });
  }
}

class Style {
  constructor(ttlTensor, dpTensor) {
    this.ttl = ttlTensor;
    this.dp = dpTensor;
  }
}

class TextToSpeech {
  constructor(cfgs, textProcessor, dpOrt, textEncOrt, vectorEstOrt, vocoderOrt) {
    this.cfgs = cfgs;
    this.textProcessor = textProcessor;
    this.dpOrt = dpOrt;
    this.textEncOrt = textEncOrt;
    this.vectorEstOrt = vectorEstOrt;
    this.vocoderOrt = vocoderOrt;
    this.sampleRate = cfgs.ae.sample_rate;
  }

  async infer(textList, langList, style, totalStep, speed = 1.05, progressCallback = null) {
    const batchSize = textList.length;
    const { textIds, textMask } = this.textProcessor.call(textList, langList);
    const textIdsTensor = new ort.Tensor(
      "int64",
      new BigInt64Array(textIds.flat().map((value) => BigInt(value))),
      [batchSize, textIds[0].length],
    );
    const textMaskTensor = new ort.Tensor(
      "float32",
      new Float32Array(textMask.flat(2)),
      [batchSize, 1, textMask[0][0].length],
    );

    const dpOutputs = await this.dpOrt.run({
      style_dp: style.dp,
      text_ids: textIdsTensor,
      text_mask: textMaskTensor,
    });
    const duration = Array.from(dpOutputs.duration.data).map((value) => value / speed);

    const textEncOutputs = await this.textEncOrt.run({
      style_ttl: style.ttl,
      text_ids: textIdsTensor,
      text_mask: textMaskTensor,
    });

    let { latentMask, xt } = this.sampleNoisyLatent(
      duration,
      this.sampleRate,
      this.cfgs.ae.base_chunk_size,
      this.cfgs.ttl.chunk_compress_factor,
      this.cfgs.ttl.latent_dim,
    );

    const latentMaskTensor = new ort.Tensor(
      "float32",
      new Float32Array(latentMask.flat(2)),
      [batchSize, 1, latentMask[0][0].length],
    );
    const totalStepTensor = new ort.Tensor("float32", new Float32Array(batchSize).fill(totalStep), [
      batchSize,
    ]);

    for (let step = 0; step < totalStep; step += 1) {
      progressCallback?.(step + 1, totalStep);

      const xtTensor = new ort.Tensor("float32", new Float32Array(xt.flat(2)), [
        batchSize,
        xt[0].length,
        xt[0][0].length,
      ]);
      const currentStepTensor = new ort.Tensor("float32", new Float32Array(batchSize).fill(step), [
        batchSize,
      ]);
      const vectorEstOutputs = await this.vectorEstOrt.run({
        current_step: currentStepTensor,
        latent_mask: latentMaskTensor,
        noisy_latent: xtTensor,
        style_ttl: style.ttl,
        text_emb: textEncOutputs.text_emb,
        text_mask: textMaskTensor,
        total_step: totalStepTensor,
      });
      const denoised = Array.from(vectorEstOutputs.denoised_latent.data);
      const latentDim = xt[0].length;
      const latentLen = xt[0][0].length;
      let denoisedIndex = 0;

      xt = [];

      for (let batchIndex = 0; batchIndex < batchSize; batchIndex += 1) {
        const batch = [];

        for (let dimIndex = 0; dimIndex < latentDim; dimIndex += 1) {
          const row = [];

          for (let timeIndex = 0; timeIndex < latentLen; timeIndex += 1) {
            row.push(denoised[denoisedIndex]);
            denoisedIndex += 1;
          }

          batch.push(row);
        }

        xt.push(batch);
      }
    }

    const finalXtTensor = new ort.Tensor("float32", new Float32Array(xt.flat(2)), [
      batchSize,
      xt[0].length,
      xt[0][0].length,
    ]);
    const vocoderOutputs = await this.vocoderOrt.run({ latent: finalXtTensor });

    return {
      duration,
      wav: Array.from(vocoderOutputs.wav_tts.data),
    };
  }

  async call(text, lang, style, totalStep, speed = 1.05, silenceDuration = 0.3, progressCallback) {
    if (style.ttl.dims[0] !== 1) {
      throw new Error("Single speaker TTS only supports one voice style.");
    }

    const maxLen = lang === "ja" ? 120 : 300;
    const textList = chunkText(text, maxLen);
    const langList = new Array(textList.length).fill(lang);
    let wavCat = [];
    let durationCat = 0;

    for (const [index, textChunk] of textList.entries()) {
      const { duration, wav } = await this.infer(
        [textChunk],
        [langList[index]],
        style,
        totalStep,
        speed,
        progressCallback,
      );

      if (wavCat.length === 0) {
        wavCat = wav;
        durationCat = duration[0];
      } else {
        const silence = new Array(Math.floor(silenceDuration * this.sampleRate)).fill(0);
        wavCat = [...wavCat, ...silence, ...wav];
        durationCat += duration[0] + silenceDuration;
      }
    }

    return { duration: [durationCat], wav: wavCat };
  }

  sampleNoisyLatent(duration, sampleRate, baseChunkSize, chunkCompress, latentDim) {
    const batchSize = duration.length;
    const maxDuration = Math.max(...duration);
    const wavLenMax = Math.floor(maxDuration * sampleRate);
    const wavLengths = duration.map((value) => Math.floor(value * sampleRate));
    const chunkSize = baseChunkSize * chunkCompress;
    const latentLen = Math.floor((wavLenMax + chunkSize - 1) / chunkSize);
    const latentDimValue = latentDim * chunkCompress;
    const xt = [];

    for (let batchIndex = 0; batchIndex < batchSize; batchIndex += 1) {
      const batch = [];

      for (let dimIndex = 0; dimIndex < latentDimValue; dimIndex += 1) {
        const row = [];

        for (let timeIndex = 0; timeIndex < latentLen; timeIndex += 1) {
          const firstRandom = Math.max(0.0001, Math.random());
          const secondRandom = Math.random();
          row.push(
            Math.sqrt(-2.0 * Math.log(firstRandom)) * Math.cos(2.0 * Math.PI * secondRandom),
          );
        }

        batch.push(row);
      }

      xt.push(batch);
    }

    const latentLengths = wavLengths.map((length) => Math.floor((length + chunkSize - 1) / chunkSize));
    const latentMask = this.lengthToMask(latentLengths, latentLen);

    for (let batchIndex = 0; batchIndex < batchSize; batchIndex += 1) {
      for (let dimIndex = 0; dimIndex < latentDimValue; dimIndex += 1) {
        for (let timeIndex = 0; timeIndex < latentLen; timeIndex += 1) {
          xt[batchIndex][dimIndex][timeIndex] *= latentMask[batchIndex][0][timeIndex];
        }
      }
    }

    return { latentMask, xt };
  }

  lengthToMask(lengths, maxLen = null) {
    const actualMaxLen = maxLen || Math.max(...lengths);

    return lengths.map((length) => {
      const row = new Array(actualMaxLen).fill(0.0);

      for (let index = 0; index < Math.min(length, actualMaxLen); index += 1) {
        row[index] = 1.0;
      }

      return [row];
    });
  }
}

async function loadVoiceStyle(onStatus) {
  const voiceStyle = await readJsonAsset(`voice_styles/${SUPERTONIC_VOICE_STYLE}.json`, onStatus);
  const ttlDims = voiceStyle.style_ttl.dims;
  const dpDims = voiceStyle.style_dp.dims;
  const ttlFlat = new Float32Array(voiceStyle.style_ttl.data.flat(Infinity));
  const dpFlat = new Float32Array(voiceStyle.style_dp.data.flat(Infinity));

  return new Style(
    new ort.Tensor("float32", ttlFlat, [1, ttlDims[1], ttlDims[2]]),
    new ort.Tensor("float32", dpFlat, [1, dpDims[1], dpDims[2]]),
  );
}

async function loadOnnxSession(path, sessionOptions, onStatus) {
  const modelBuffer = await readModelAsset(path, onStatus);

  return ort.InferenceSession.create(modelBuffer, sessionOptions);
}

async function createRuntime(sessionOptions, backend, onStatus) {
  const cfgs = await readJsonAsset("onnx/tts.json", onStatus);
  const indexer = await readJsonAsset("onnx/unicode_indexer.json", onStatus);
  const sessions = [];
  const modelPaths = [
    ["duration model", "onnx/duration_predictor.onnx"],
    ["text encoder", "onnx/text_encoder.onnx"],
    ["speech model", "onnx/vector_estimator.onnx"],
    ["vocoder", "onnx/vocoder.onnx"],
  ];

  for (const [index, [label, path]] of modelPaths.entries()) {
    onStatus?.({
      message: `Loading ${label}`,
      phase: "loading",
      source: "supertonic",
      step: index + 1,
      total: modelPaths.length,
    });
    sessions.push(await loadOnnxSession(path, sessionOptions, onStatus));
  }

  const [dpOrt, textEncOrt, vectorEstOrt, vocoderOrt] = sessions;
  const voiceStyle = await loadVoiceStyle(onStatus);
  const textToSpeech = new TextToSpeech(
    cfgs,
    new UnicodeProcessor(indexer),
    dpOrt,
    textEncOrt,
    vectorEstOrt,
    vocoderOrt,
  );

  return {
    backend,
    textToSpeech,
    voiceStyle,
  };
}

async function loadRuntime(onStatus) {
  const startedAt = performance.now();

  await preloadSupertonicAssets({ onStatus });

  if (typeof navigator !== "undefined" && "gpu" in navigator) {
    try {
      onStatus?.({
        message: "Loading WebGPU runtime",
        phase: "loading",
        source: "supertonic",
      });

      const webgpuRuntime = await createRuntime({ executionProviders: ["webgpu"] }, "webgpu", onStatus);

      return {
        ...webgpuRuntime,
        loadMs: Math.round(performance.now() - startedAt),
      };
    } catch (error) {
      onStatus?.({
        message: `WebGPU unavailable, loading WebAssembly: ${getErrorMessage(error)}`,
        phase: "loading",
        source: "supertonic",
      });
    }
  }

  const wasmRuntime = await createRuntime({ executionProviders: ["wasm"] }, "wasm", onStatus);

  return {
    ...wasmRuntime,
    loadMs: Math.round(performance.now() - startedAt),
  };
}

export async function loadSupertonicRuntime({ onStatus } = {}) {
  if (runtime) {
    return {
      loadMs: 0,
      runtime,
    };
  }

  if (!runtimePromise) {
    runtimePromise = loadRuntime(onStatus)
      .then((loadedRuntime) => {
        runtime = loadedRuntime;
        return loadedRuntime;
      })
      .catch((error) => {
        runtimePromise = null;
        throw error;
      });
  }

  const loadedRuntime = await runtimePromise;

  return {
    loadMs: loadedRuntime.loadMs,
    runtime: loadedRuntime,
  };
}

export async function synthesizeWithSupertonic({ languageCode, onStatus, text }) {
  assertSupportedLanguage(languageCode);

  const startedAt = performance.now();
  const { loadMs, runtime: loadedRuntime } = await loadSupertonicRuntime({ onStatus });
  const synthStartedAt = performance.now();

  onStatus?.({
    message: "Generating speech",
    phase: "generating",
    source: "supertonic",
  });

  const { duration, wav } = await loadedRuntime.textToSpeech.call(
    text,
    languageCode,
    loadedRuntime.voiceStyle,
    8,
    1.05,
    0.3,
    (step, total) => {
      onStatus?.({
        message: `Generating ${step}/${total}`,
        phase: "generating",
        source: "supertonic",
        step,
        total,
      });
    },
  );
  const synthMs = Math.round(performance.now() - synthStartedAt);
  const audioLength = Math.floor(loadedRuntime.textToSpeech.sampleRate * duration[0]);

  return {
    audio: Float32Array.from(wav.slice(0, audioLength)),
    backend: loadedRuntime.backend,
    duration: duration[0],
    metrics: {
      loadMs,
      synthMs,
      totalMs: Math.round(performance.now() - startedAt),
    },
    modelId: SUPERTONIC_MODEL_ID,
    samplingRate: loadedRuntime.textToSpeech.sampleRate,
    voiceName: SUPERTONIC_VOICE_STYLE,
  };
}

function chunkText(text, maxLen = 300) {
  if (typeof text !== "string") {
    throw new Error(`Expected text to be a string, got ${typeof text}.`);
  }

  const paragraphs = text
    .trim()
    .split(/\n\s*\n+/)
    .filter((paragraph) => paragraph.trim());
  const chunks = [];

  for (let paragraph of paragraphs) {
    paragraph = paragraph.trim();

    if (!paragraph) {
      continue;
    }

    const sentences = paragraph.split(
      /(?<!Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.|Sr\.|Jr\.|Ph\.D\.|etc\.|e\.g\.|i\.e\.|vs\.|Inc\.|Ltd\.|Co\.|Corp\.|St\.|Ave\.|Blvd\.)(?<!\b[A-Z]\.)(?<=[.!?])\s+/,
    );
    let currentChunk = "";

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length + 1 <= maxLen) {
        currentChunk += `${currentChunk ? " " : ""}${sentence}`;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }

        currentChunk = sentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
  }

  return chunks.length > 0 ? chunks : [text.trim()];
}
