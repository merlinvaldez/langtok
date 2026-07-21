import { getTtsLanguageConfig } from "./ttsConfig.js";

let audioContext = null;
let supertonicModulePromise = null;

function getSupertonicModule() {
  if (!supertonicModulePromise) {
    supertonicModulePromise = import("./supertonicRuntime.js");
  }

  return supertonicModulePromise;
}

function getAudioContext() {
  if (!audioContext) {
    const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext;

    if (!AudioContextConstructor) {
      throw new Error("This browser does not support Web Audio playback.");
    }

    audioContext = new AudioContextConstructor();
  }

  return audioContext;
}

async function unlockAudioContext() {
  const context = getAudioContext();

  if (context.state === "suspended") {
    await context.resume();
  }
}

async function playAudio(audio, samplingRate) {
  const context = getAudioContext();

  if (context.state === "suspended") {
    await context.resume();
  }

  const buffer = context.createBuffer(1, audio.length, samplingRate);
  buffer.copyToChannel(audio, 0);

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);

  await new Promise((resolve, reject) => {
    source.addEventListener("ended", resolve, { once: true });

    try {
      source.start();
    } catch (error) {
      reject(error);
    }
  });
}

export async function getSupertonicCacheStatus() {
  const supertonic = await getSupertonicModule();

  return supertonic.getSupertonicCacheStatus();
}

export async function prepareTtsModel({ onStatus } = {}) {
  const supertonic = await getSupertonicModule();

  await supertonic.preloadSupertonicAssets({ onStatus });
  const { runtime } = await supertonic.loadSupertonicRuntime({ onStatus });

  return {
    backend: runtime.backend,
    cached: true,
    modelId: supertonic.SUPERTONIC_MODEL_ID,
    voiceName: supertonic.SUPERTONIC_VOICE_STYLE,
  };
}

export async function cacheTtsModelAssets({ onStatus } = {}) {
  const supertonic = await getSupertonicModule();

  return supertonic.preloadSupertonicAssets({ onStatus });
}

export async function speak({ languageCode, onStatus, text }) {
  const languageConfig = getTtsLanguageConfig(languageCode);

  if (!languageConfig) {
    throw new Error(`No TTS language config exists for ${languageCode}.`);
  }

  await unlockAudioContext();

  onStatus?.({
    message: "Preparing Supertonic",
    phase: "loading",
    source: "supertonic",
  });

  const supertonic = await getSupertonicModule();
  const result = await supertonic.synthesizeWithSupertonic({
    languageCode: languageConfig.supertonicLang,
    onStatus,
    text,
  });

  await playAudio(result.audio, result.samplingRate);

  return {
    backend: result.backend,
    engine: "supertonic-3",
    metrics: result.metrics,
    modelId: result.modelId,
    samplingRate: result.samplingRate,
    voiceName: result.voiceName,
  };
}

export function getTtsEngineLabel(result) {
  if (!result) {
    return "";
  }

  return result.backend ? `Supertonic 3 (${result.backend})` : "Supertonic 3";
}
