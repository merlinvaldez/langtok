const synthesizerCache = new Map();

function postStatus(requestId, status) {
  self.postMessage({
    requestId,
    type: "status",
    ...status,
  });
}

function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function summarizeProgress(event) {
  if (!event || typeof event !== "object") {
    return "Loading model";
  }

  if (event.status === "progress" && typeof event.progress === "number") {
    return `Loading ${Math.round(event.progress)}%`;
  }

  if (typeof event.status === "string") {
    return event.status.replaceAll("_", " ");
  }

  return "Loading model";
}

async function loadSynthesizer(modelId, requestId) {
  if (synthesizerCache.has(modelId)) {
    return synthesizerCache.get(modelId);
  }

  const synthesizerPromise = import("@huggingface/transformers")
    .then(({ env, pipeline }) => {
      env.allowLocalModels = false;
      env.allowRemoteModels = true;

      return pipeline("text-to-speech", modelId, {
        progress_callback: (event) => {
          postStatus(requestId, {
            message: summarizeProgress(event),
            phase: "loading",
            progress: typeof event?.progress === "number" ? event.progress : null,
          });
        },
      });
    })
    .catch((error) => {
      synthesizerCache.delete(modelId);
      throw error;
    });

  synthesizerCache.set(modelId, synthesizerPromise);
  return synthesizerPromise;
}

self.addEventListener("message", async (event) => {
  const { modelId, requestId, text, type } = event.data ?? {};

  if (type !== "synthesize") {
    return;
  }

  if (!modelId || !requestId || !text) {
    self.postMessage({
      message: "Missing TTS request data.",
      requestId,
      type: "error",
    });
    return;
  }

  const startedAt = performance.now();

  try {
    postStatus(requestId, {
      message: "Loading voice",
      phase: "loading",
      progress: null,
    });

    const loadStartedAt = performance.now();
    const synthesizer = await loadSynthesizer(modelId, requestId);
    const loadFinishedAt = performance.now();

    postStatus(requestId, {
      message: "Generating speech",
      phase: "generating",
      progress: null,
    });

    const synthStartedAt = performance.now();
    const output = await synthesizer(text);
    const synthFinishedAt = performance.now();

    const audio = output.audio instanceof Float32Array ? output.audio : new Float32Array(output.audio);
    const audioBuffer = audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength);

    self.postMessage(
      {
        audio: audioBuffer,
        metrics: {
          loadMs: Math.round(loadFinishedAt - loadStartedAt),
          synthMs: Math.round(synthFinishedAt - synthStartedAt),
          totalMs: Math.round(synthFinishedAt - startedAt),
        },
        modelId,
        requestId,
        samplingRate: output.sampling_rate,
        type: "result",
      },
      [audioBuffer],
    );
  } catch (error) {
    self.postMessage({
      message: getErrorMessage(error),
      modelId,
      requestId,
      type: "error",
    });
  }
});
