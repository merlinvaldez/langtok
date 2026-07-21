export const TTS_LANGUAGE_CONFIG = {
  it: {
    label: "Italian",
    code: "it",
    direction: "ltr",
    sampleWord: "ancora",
    samplePhrase: "Sto ancora imparando.",
    primary: "Supertonic 3 web",
    modelId: null,
    fallbackSpeechLang: "it-IT",
    status: "Supertonic candidate",
    note: "Supertonic 3 lists Italian, but its multilingual web path needs model assets before it is wired here.",
  },
  ar: {
    label: "Arabic",
    code: "ar",
    direction: "rtl",
    sampleWord: "شكرا",
    samplePhrase: "شكرا على المساعدة.",
    primary: "MMS / Transformers.js",
    modelId: "Xenova/mms-tts-ara",
    fallbackSpeechLang: "ar",
    status: "Runnable",
    note: "Browser-compatible MMS ONNX model.",
  },
  fa: {
    label: "Farsi",
    code: "fa",
    direction: "rtl",
    sampleWord: "سلام",
    samplePhrase: "سلام، حال شما چطور است؟",
    primary: "MMS validation target",
    modelId: "facebook/mms-tts-fas",
    fallbackSpeechLang: "fa-IR",
    status: "Needs validation",
    note: "Persian MMS exists, but this verifies whether the current browser runtime can load it directly.",
  },
  fr: {
    label: "French",
    code: "fr",
    direction: "ltr",
    sampleWord: "bientôt",
    samplePhrase: "Le train arrive bientôt.",
    primary: "MMS / Transformers.js",
    modelId: "Xenova/mms-tts-fra",
    fallbackSpeechLang: "fr-FR",
    status: "Runnable",
    note: "Browser-compatible MMS ONNX model.",
  },
};

export const TTS_TEST_CASES = Object.values(TTS_LANGUAGE_CONFIG);

export function getTtsLanguageConfig(languageCode) {
  return TTS_LANGUAGE_CONFIG[languageCode] ?? null;
}
