export const TTS_LANGUAGE_CONFIG = {
  it: {
    label: "Italian",
    code: "it",
    direction: "ltr",
    sampleWord: "ancora",
    sampleTtsWord: "ancora",
    sampleWordPhonetic: "ahn-KOH-rah",
    samplePhrase: "Va bene.",
    sampleTtsPhrase: "Va bene.",
    samplePhrasePhonetic: "vah BEH-neh",
    primary: "Supertonic 3",
    modelId: "Supertone/supertonic-3",
    supertonicLang: "it",
    status: "Enabled",
    note: "Runs through Supertonic 3 in the browser.",
  },
  ar: {
    label: "Arabic",
    code: "ar",
    direction: "rtl",
    sampleWord: "شكرا",
    sampleTtsWord: "شُكْرًا",
    sampleWordPhonetic: "SHOOK-ran",
    samplePhrase: "من فضلك",
    sampleTtsPhrase: "مِنْ فَضْلَك",
    samplePhrasePhonetic: "min FAD-lak",
    primary: "Supertonic 3",
    modelId: "Supertone/supertonic-3",
    supertonicLang: "ar",
    status: "Enabled",
    note: "Uses vocalized Arabic TTS text so playback matches the phonetic guide.",
  },
  fr: {
    label: "French",
    code: "fr",
    direction: "ltr",
    sampleWord: "bientôt",
    sampleTtsWord: "bientôt",
    sampleWordPhonetic: "byen-TOH",
    samplePhrase: "Ça marche.",
    sampleTtsPhrase: "Ça marche.",
    samplePhrasePhonetic: "sah marsh",
    primary: "Supertonic 3",
    modelId: "Supertone/supertonic-3",
    supertonicLang: "fr",
    status: "Enabled",
    note: "Runs through Supertonic 3 in the browser.",
  },
};

export const TTS_TEST_CASES = Object.values(TTS_LANGUAGE_CONFIG);

export function getTtsLanguageConfig(languageCode) {
  return TTS_LANGUAGE_CONFIG[languageCode] ?? null;
}
