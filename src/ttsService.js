import { getTtsLanguageConfig } from "./ttsConfig.js";

const pendingRequests = new Map();

let activeWorker = null;
let requestCounter = 0;
let sharedAudioContext = null;

function createRequestId() {
  requestCounter += 1;
  return `tts-${Date.now()}-${requestCounter}`;
}

function getWorker() {
  if (activeWorker) {
    return activeWorker;
  }

  activeWorker = new Worker(new URL("./ttsWorker.js", import.meta.url), {
    type: "module",
  });

  activeWorker.addEventListener("message", (event) => {
    const payload = event.data ?? {};
    const pendingRequest = pendingRequests.get(payload.requestId);

    if (!pendingRequest) {
      return;
    }

    if (payload.type === "status") {
      pendingRequest.onStatus?.({
        message: payload.message,
        phase: payload.phase,
        progress: payload.progress,
        source: "model",
      });
      return;
    }

    pendingRequests.delete(payload.requestId);

    if (payload.type === "result") {
      pendingRequest.resolve({
        audio: new Float32Array(payload.audio),
        engine: "mms-transformers",
        metrics: payload.metrics,
        modelId: payload.modelId,
        samplingRate: payload.samplingRate,
      });
      return;
    }

    pendingRequest.reject(new Error(payload.message || "TTS synthesis failed."));
  });

  activeWorker.addEventListener("error", (event) => {
    const error = new Error(event.message || "TTS worker failed.");

    for (const pendingRequest of pendingRequests.values()) {
      pendingRequest.reject(error);
    }

    pendingRequests.clear();
    activeWorker = null;
  });

  return activeWorker;
}

function getAudioContext() {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextConstructor) {
    throw new Error("This browser does not support Web Audio playback.");
  }

  if (!sharedAudioContext) {
    sharedAudioContext = new AudioContextConstructor();
  }

  return sharedAudioContext;
}

async function playFloatAudio(audio, samplingRate) {
  const audioContext = getAudioContext();

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  const audioBuffer = audioContext.createBuffer(1, audio.length, samplingRate);
  audioBuffer.copyToChannel(audio, 0);

  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);

  await new Promise((resolve) => {
    source.addEventListener("ended", resolve, { once: true });
    source.start();
  });
}

function chooseSpeechSynthesisVoice(languageConfig) {
  const voices = window.speechSynthesis.getVoices();
  const exactMatch = voices.find((voice) => voice.lang === languageConfig.fallbackSpeechLang);

  if (exactMatch) {
    return exactMatch;
  }

  return voices.find((voice) =>
    voice.lang.toLowerCase().startsWith(languageConfig.code.toLowerCase()),
  );
}

function speakWithSpeechSynthesis(text, languageConfig) {
  return new Promise((resolve, reject) => {
    if (!("speechSynthesis" in window)) {
      reject(new Error("This browser does not expose SpeechSynthesis fallback voices."));
      return;
    }

    const startedAt = performance.now();
    const utterance = new SpeechSynthesisUtterance(text);
    const matchingVoice = chooseSpeechSynthesisVoice(languageConfig);

    utterance.lang = languageConfig.fallbackSpeechLang;
    utterance.rate = 0.92;

    if (matchingVoice) {
      utterance.voice = matchingVoice;
    }

    utterance.addEventListener(
      "end",
      () => {
        resolve({
          engine: "speech-synthesis",
          metrics: {
            loadMs: 0,
            synthMs: 0,
            totalMs: Math.round(performance.now() - startedAt),
          },
          modelId: null,
          samplingRate: null,
        });
      },
      { once: true },
    );

    utterance.addEventListener(
      "error",
      (event) => {
        reject(new Error(`SpeechSynthesis failed: ${event.error}`));
      },
      { once: true },
    );

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

function synthesizeWithModel({ modelId, onStatus, text }) {
  const requestId = createRequestId();

  return new Promise((resolve, reject) => {
    pendingRequests.set(requestId, {
      onStatus,
      reject,
      resolve,
    });

    getWorker().postMessage({
      modelId,
      requestId,
      text,
      type: "synthesize",
    });
  });
}

export async function speak({ languageCode, onStatus, text }) {
  const languageConfig = getTtsLanguageConfig(languageCode);

  if (!languageConfig) {
    throw new Error(`No TTS language config exists for ${languageCode}.`);
  }

  if (languageConfig.modelId) {
    try {
      const result = await synthesizeWithModel({
        modelId: languageConfig.modelId,
        onStatus,
        text,
      });

      await playFloatAudio(result.audio, result.samplingRate);
      return result;
    } catch (error) {
      onStatus?.({
        message: "Trying system voice fallback",
        phase: "fallback",
        source: "speech-synthesis",
      });

      const fallbackResult = await speakWithSpeechSynthesis(text, languageConfig);

      return {
        ...fallbackResult,
        fallbackReason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  onStatus?.({
    message: "Using system voice fallback",
    phase: "fallback",
    source: "speech-synthesis",
  });

  return speakWithSpeechSynthesis(text, languageConfig);
}

export function getTtsEngineLabel(result) {
  if (!result) {
    return "";
  }

  if (result.engine === "speech-synthesis") {
    return "system voice";
  }

  return result.modelId ?? "local model";
}
