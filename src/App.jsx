import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Download,
  Grid2X2,
  Languages,
  Sparkles,
  Trash2,
  Volume2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LANGUAGES, SAMPLE_CARDS } from "./data.js";
import { generateLanguageCards, getQwenCacheStatus, preloadQwenModel } from "./generationService.js";
import { TTS_TEST_CASES, getTtsLanguageConfig } from "./ttsConfig.js";
import {
  cacheTtsModelAssets,
  getSupertonicCacheStatus,
  getTtsEngineLabel,
  prepareTtsModel,
  speak,
} from "./ttsService.js";

const SAVED_CARD_IDS_STORAGE_KEY = "langtok:savedCardIds";
const GENERATED_CARDS_STORAGE_KEY = "langtok:generatedCards";
const GENERATED_CARDS_STORAGE_VERSION = 1;
const TTS_RESULTS_STORAGE_KEY = "langtok:ttsResults";
const TTS_RESULTS_STORAGE_VERSION = 4;
const SPEECH_STATUS_CLEAR_DELAY_MS = 5200;

function loadSavedCardIds() {
  try {
    const savedValue = window.localStorage.getItem(SAVED_CARD_IDS_STORAGE_KEY);
    const parsedValue = savedValue ? JSON.parse(savedValue) : [];

    return Array.isArray(parsedValue) ? parsedValue.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function loadTtsResults() {
  try {
    const savedValue = window.localStorage.getItem(TTS_RESULTS_STORAGE_KEY);
    const parsedValue = savedValue ? JSON.parse(savedValue) : {};

    if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) {
      return {};
    }

    if (parsedValue.version !== TTS_RESULTS_STORAGE_VERSION) {
      return {};
    }

    return parsedValue.results && typeof parsedValue.results === "object" ? parsedValue.results : {};
  } catch {
    return {};
  }
}

function loadGeneratedCardsByLanguage() {
  try {
    const savedValue = window.localStorage.getItem(GENERATED_CARDS_STORAGE_KEY);
    const parsedValue = savedValue ? JSON.parse(savedValue) : {};

    if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) {
      return {};
    }

    if (parsedValue.version !== GENERATED_CARDS_STORAGE_VERSION) {
      return {};
    }

    return parsedValue.cardsByLanguage && typeof parsedValue.cardsByLanguage === "object"
      ? sanitizeGeneratedCardsByLanguage(parsedValue.cardsByLanguage)
      : {};
  } catch {
    return {};
  }
}

function sanitizeGeneratedCardsByLanguage(cardsByLanguage) {
  const validLanguageCodes = new Set(LANGUAGES.map((language) => language.code));
  const sanitizedCardsByLanguage = {};

  for (const [languageCode, cards] of Object.entries(cardsByLanguage)) {
    if (!validLanguageCodes.has(languageCode) || !Array.isArray(cards)) {
      continue;
    }

    sanitizedCardsByLanguage[languageCode] = cards.filter(
      (card) =>
        card &&
        typeof card === "object" &&
        card.id &&
        card.targetText &&
        card.languageCode === languageCode,
    );
  }

  return sanitizedCardsByLanguage;
}

function persistGeneratedCardsByLanguage(cardsByLanguage) {
  try {
    window.localStorage.setItem(
      GENERATED_CARDS_STORAGE_KEY,
      JSON.stringify({
        cardsByLanguage,
        version: GENERATED_CARDS_STORAGE_VERSION,
      }),
    );
  } catch (error) {
    console.warn("LangTok could not persist generated cards.", error);
  }
}

function persistTtsResults(results) {
  window.localStorage.setItem(
    TTS_RESULTS_STORAGE_KEY,
    JSON.stringify({
      results,
      version: TTS_RESULTS_STORAGE_VERSION,
    }),
  );
}

function getLanguageDirection(languageCode) {
  return LANGUAGES.find((language) => language.code === languageCode)?.direction ?? "ltr";
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function getGenerationDebug(error) {
  return error && typeof error === "object" && "generationDebug" in error
    ? error.generationDebug
    : null;
}

function formatMs(milliseconds) {
  if (typeof milliseconds !== "number") {
    return "";
  }

  return milliseconds >= 1000 ? `${(milliseconds / 1000).toFixed(1)}s` : `${milliseconds}ms`;
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(timestamp));
}

function buildStatusMessage(languageConfig, status) {
  const prefix = languageConfig ? languageConfig.label : "Supertonic";

  return `${prefix}: ${status.message ?? "Preparing audio"}`;
}

function buildResultMessage(languageConfig, result) {
  const engineLabel = getTtsEngineLabel(result);
  const loadText = result.metrics?.loadMs ? `loaded ${formatMs(result.metrics.loadMs)}, ` : "";

  return `${languageConfig.label}: ${engineLabel} ${loadText}generated ${formatMs(
    result.metrics?.synthMs,
  )}`;
}

function buildIdleTtsMessage(modelCacheStatus) {
  if (!modelCacheStatus.checked) {
    return "Checking model";
  }

  if (modelCacheStatus.cached) {
    return "Ready";
  }

  if (!modelCacheStatus.supportsCache) {
    return "Ready without persistent cache";
  }

  return `Cached ${modelCacheStatus.cachedCount}/${modelCacheStatus.total}`;
}

function buildTtsLogEntry({ languageCode, message, result, sampleLabel, text, tone }) {
  const testedAt = new Date().toISOString();

  return {
    backend: result?.backend ?? null,
    engine: result?.engine ?? null,
    engineLabel: result ? getTtsEngineLabel(result) : null,
    languageCode,
    loadMs: result?.metrics?.loadMs ?? null,
    message,
    modelId: result?.modelId ?? null,
    sampleLabel,
    samplingRate: result?.samplingRate ?? null,
    synthMs: result?.metrics?.synthMs ?? null,
    testedAt,
    text,
    tone,
    totalMs: result?.metrics?.totalMs ?? null,
    voiceName: result?.voiceName ?? null,
  };
}

function findCardElementById(container, cardId) {
  if (!container || !cardId) {
    return null;
  }

  return (
    Array.from(container.querySelectorAll("[data-card-id]")).find(
      (element) => element.dataset.cardId === cardId,
    ) ?? null
  );
}

function devFlagIsEnabled(flagName) {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return false;
  }

  const params = new URLSearchParams(window.location.search);

  return params.get(flagName) === "1" || params.get("devMode") === "1";
}

function createReadyDevDependency(label) {
  return {
    cached: true,
    cachedCount: 1,
    checked: true,
    label,
    loadedBytes: 0,
    message: "Cached",
    progress: 1,
    supportsCache: true,
    supportsWebGpu: true,
    total: 1,
    totalBytes: 0,
  };
}

function createDevGeneratedCard({ existingCards, languageCode }) {
  const languageConfig = LANGUAGES.find((language) => language.code === languageCode);
  const sequence = existingCards.length + 1;
  const baseCard = {
    createdAt: new Date().toISOString(),
    id: `dev-${languageCode}-${Date.now()}-${sequence}`,
    language: languageConfig?.label ?? languageCode,
    languageCode,
    source: "dev-mock",
  };

  if (languageCode === "ar") {
    return {
      ...baseCard,
      example: `هذه بطاقة رقم ${sequence}.`,
      exampleTranslation: `This is card number ${sequence}.`,
      phoneticSpelling: `bi-TAH-qah ${sequence}`,
      targetText: `بطاقة ${sequence}`,
      translation: `card ${sequence}`,
      ttsText: `بِطَاقَة ${sequence}`,
    };
  }

  if (languageCode === "fr") {
    return {
      ...baseCard,
      example: `Voici la carte ${sequence}.`,
      exampleTranslation: `Here is card ${sequence}.`,
      phoneticSpelling: `kart ${sequence}`,
      targetText: `carte ${sequence}`,
      translation: `card ${sequence}`,
      ttsText: `carte ${sequence}`,
    };
  }

  return {
    ...baseCard,
    example: `Questa e la carta ${sequence}.`,
    exampleTranslation: `This is card ${sequence}.`,
    phoneticSpelling: `KAR-tah ${sequence}`,
    targetText: `carta ${sequence}`,
    translation: `card ${sequence}`,
    ttsText: `carta ${sequence}`,
  };
}

async function generateFeedCards({ count, existingCards, languageCode, onStatus }) {
  if (!devFlagIsEnabled("mockGeneration")) {
    return generateLanguageCards({
      count,
      existingCards,
      languageCode,
      onStatus,
    });
  }

  const languageConfig = LANGUAGES.find((language) => language.code === languageCode);

  onStatus?.({
    message: `Generating ${languageConfig?.label ?? "language"} card`,
    phase: "generating",
    source: "dev-mock",
  });
  await new Promise((resolve) => window.setTimeout(resolve, 120));

  const card = createDevGeneratedCard({ existingCards, languageCode });

  return {
    cards: [card],
    debug: {
      attempt: 1,
      expected: "dev mock generation",
      problem: "Dev mock output accepted.",
      rawResponse: JSON.stringify({ card }, null, 2),
      repairResponse: "",
      stage: "accepted",
    },
    metrics: {
      attempts: 1,
      repaired: false,
      totalMs: 120,
    },
    modelId: "dev-mock",
  };
}

function clampProgress(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return Math.min(Math.max(value, 0), 1);
}

function formatBytes(bytes) {
  if (!bytes) {
    return "";
  }

  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.round(bytes / 1024)} KB`;
}

function createSetupDependency(label) {
  return {
    cached: false,
    cachedCount: 0,
    checked: false,
    label,
    loadedBytes: 0,
    message: "Checking",
    progress: 0,
    supportsCache: true,
    supportsWebGpu: true,
    total: 1,
    totalBytes: 0,
  };
}

function createInitialSetupStatus() {
  return {
    dependencies: {
      qwen: createSetupDependency("Qwen2.5 1.5B"),
      supertonic: createSetupDependency("Supertonic 3"),
    },
    error: "",
    phase: "checking",
  };
}

function progressFromCacheStatus(status, fallbackProgress = 0) {
  if (typeof status.progress === "number") {
    return status.progress;
  }

  if (status.cached) {
    return 1;
  }

  if (status.total) {
    return (status.cachedCount ?? 0) / status.total;
  }

  return fallbackProgress;
}

function mergeDependencyStatus(currentDependency, status) {
  const progress = progressFromCacheStatus(status, currentDependency.progress);

  return {
    ...currentDependency,
    cached: status.cached ?? currentDependency.cached,
    cachedCount: status.cachedCount ?? currentDependency.cachedCount,
    checked: status.checked ?? true,
    loadedBytes: status.loadedBytes ?? currentDependency.loadedBytes,
    message: status.message ?? currentDependency.message,
    progress: clampProgress(progress),
    supportsCache: status.supportsCache ?? currentDependency.supportsCache,
    supportsWebGpu: status.supportsWebGpu ?? currentDependency.supportsWebGpu,
    total: status.total ?? currentDependency.total,
    totalBytes: status.totalBytes ?? currentDependency.totalBytes,
  };
}

function setupDependenciesAreReady(dependencies) {
  return (
    dependencies.qwen.cached &&
    dependencies.qwen.supportsCache &&
    dependencies.qwen.supportsWebGpu &&
    dependencies.supertonic.cached &&
    dependencies.supertonic.supportsCache
  );
}

function setupHasBlockingIssue(dependencies) {
  return (
    !dependencies.qwen.supportsCache ||
    !dependencies.qwen.supportsWebGpu ||
    !dependencies.supertonic.supportsCache
  );
}

function buildSetupDependencies(qwenStatus, supertonicStatus) {
  const initialStatus = createInitialSetupStatus();

  return {
    qwen: mergeDependencyStatus(initialStatus.dependencies.qwen, qwenStatus),
    supertonic: mergeDependencyStatus(initialStatus.dependencies.supertonic, supertonicStatus),
  };
}

function App() {
  const [selectedLanguage, setSelectedLanguage] = useState("it");
  const [savedCardIds, setSavedCardIds] = useState(loadSavedCardIds);
  const [generatedCardsByLanguage, setGeneratedCardsByLanguage] = useState(
    loadGeneratedCardsByLanguage,
  );
  const [setupStatus, setSetupStatus] = useState(createInitialSetupStatus);
  const [hasEnteredApp, setHasEnteredApp] = useState(false);
  const [activeView, setActiveView] = useState("feed");
  const [generationStatus, setGenerationStatus] = useState(null);
  const [isGeneratingCards, setIsGeneratingCards] = useState(false);
  const [activeSpeechKey, setActiveSpeechKey] = useState(null);
  const [speechStatus, setSpeechStatus] = useState(null);
  const [ttsResults, setTtsResults] = useState(loadTtsResults);
  const [modelCacheStatus, setModelCacheStatus] = useState({
    cached: false,
    cachedCount: 0,
    checked: false,
    supportsCache: true,
    total: 7,
  });
  const feedRef = useRef(null);
  const feedEndRef = useRef(null);
  const feedSentinelIsIntersectingRef = useRef(false);
  const isGeneratingCardsRef = useRef(false);
  const lastGeneratedCardIdRef = useRef(null);
  const selectedLanguageRef = useRef(selectedLanguage);

  useEffect(() => {
    let isActive = true;

    async function checkSetupDependencies() {
      try {
        if (devFlagIsEnabled("devReady")) {
          const dependencies = {
            qwen: createReadyDevDependency("Qwen2.5 1.5B"),
            supertonic: createReadyDevDependency("Supertonic 3"),
          };

          setModelCacheStatus(dependencies.supertonic);
          setSetupStatus({
            dependencies,
            error: "",
            phase: "ready",
          });
          return;
        }

        const [qwenStatus, supertonicStatus] = await Promise.all([
          getQwenCacheStatus(),
          getSupertonicCacheStatus(),
        ]);

        if (!isActive) {
          return;
        }

        const dependencies = buildSetupDependencies(qwenStatus, supertonicStatus);
        setModelCacheStatus(supertonicStatus);
        setSetupStatus({
          dependencies,
          error: "",
          phase: setupDependenciesAreReady(dependencies) ? "ready" : "needs-setup",
        });
      } catch (error) {
        if (!isActive) {
          return;
        }

        setSetupStatus((currentStatus) => ({
          ...currentStatus,
          error: getErrorMessage(error),
          phase: "error",
        }));
      }
    }

    checkSetupDependencies();

    return () => {
      isActive = false;
    };
  }, []);

  const visibleCards = useMemo(() => {
    const seedCards = SAMPLE_CARDS.filter((card) => card.languageCode === selectedLanguage);
    const generatedCards = generatedCardsByLanguage[selectedLanguage] ?? [];

    return [...seedCards, ...generatedCards];
  }, [generatedCardsByLanguage, selectedLanguage]);

  const allCards = useMemo(
    () => [...SAMPLE_CARDS, ...Object.values(generatedCardsByLanguage).flat()],
    [generatedCardsByLanguage],
  );

  const savedCards = useMemo(() => {
    const savedIds = new Set(savedCardIds);

    return allCards.filter((card) => savedIds.has(card.id)).sort((firstCard, secondCard) =>
      firstCard.targetText.localeCompare(secondCard.targetText, undefined, {
        sensitivity: "base",
      }),
    );
  }, [allCards, savedCardIds]);

  useEffect(() => {
    window.localStorage.setItem(SAVED_CARD_IDS_STORAGE_KEY, JSON.stringify(savedCardIds));
  }, [savedCardIds]);

  useEffect(() => {
    if (devFlagIsEnabled("mockGeneration")) {
      return;
    }

    persistGeneratedCardsByLanguage(generatedCardsByLanguage);
  }, [generatedCardsByLanguage]);

  useEffect(() => {
    selectedLanguageRef.current = selectedLanguage;
    feedSentinelIsIntersectingRef.current = false;
    lastGeneratedCardIdRef.current = null;
    setGenerationStatus(null);
  }, [selectedLanguage]);

  useEffect(() => {
    if (
      activeView !== "feed" ||
      !lastGeneratedCardIdRef.current ||
      typeof window === "undefined"
    ) {
      return undefined;
    }

    const cardElement = findCardElementById(feedRef.current, lastGeneratedCardIdRef.current);

    if (!cardElement) {
      return undefined;
    }

    lastGeneratedCardIdRef.current = null;
    const frameId = window.requestAnimationFrame(() => {
      cardElement.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeView, visibleCards]);

  useEffect(() => {
    if (!speechStatus || speechStatus.tone === "loading") {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setSpeechStatus(null);
    }, SPEECH_STATUS_CLEAR_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [speechStatus]);

  useEffect(() => {
    if (activeView === "tts") {
      refreshModelCacheStatus();
    }
  }, [activeView]);

  useEffect(() => {
    if (
      !hasEnteredApp ||
      activeView !== "feed" ||
      !feedEndRef.current ||
      typeof window === "undefined" ||
      !("IntersectionObserver" in window)
    ) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const sentinelIsIntersecting = entries.some((entry) => entry.isIntersecting);

        if (!sentinelIsIntersecting) {
          feedSentinelIsIntersectingRef.current = false;
          return;
        }

        if (!feedSentinelIsIntersectingRef.current) {
          feedSentinelIsIntersectingRef.current = true;
          handleGenerateMoreCards();
        }
      },
      {
        root: feedRef.current,
        rootMargin: "80px 0px",
        threshold: 0.01,
      },
    );

    observer.observe(feedEndRef.current);

    return () => observer.disconnect();
  }, [activeView, hasEnteredApp, selectedLanguage, visibleCards.length]);

  async function refreshModelCacheStatus() {
    const status = await getSupertonicCacheStatus();
    setModelCacheStatus(status);
  }

  async function handleSetupModels() {
    setSetupStatus((currentStatus) => ({
      ...currentStatus,
      error: "",
      phase: "downloading",
    }));

    try {
      let qwenStatus = await getQwenCacheStatus();
      let supertonicStatus = await getSupertonicCacheStatus();

      setSetupStatus((currentStatus) => ({
        ...currentStatus,
        dependencies: buildSetupDependencies(qwenStatus, supertonicStatus),
        phase: "downloading",
      }));

      if (!qwenStatus.cached) {
        qwenStatus = await preloadQwenModel({
          onStatus: (status) => {
            setSetupStatus((currentStatus) => ({
              ...currentStatus,
              dependencies: {
                ...currentStatus.dependencies,
                qwen: mergeDependencyStatus(currentStatus.dependencies.qwen, status),
              },
              phase: "downloading",
            }));
          },
        });
      }

      setSetupStatus((currentStatus) => ({
        ...currentStatus,
        dependencies: {
          ...currentStatus.dependencies,
          qwen: mergeDependencyStatus(currentStatus.dependencies.qwen, qwenStatus),
        },
      }));

      if (!supertonicStatus.cached) {
        supertonicStatus = await cacheTtsModelAssets({
          onStatus: (status) => {
            setSetupStatus((currentStatus) => ({
              ...currentStatus,
              dependencies: {
                ...currentStatus.dependencies,
                supertonic: mergeDependencyStatus(
                  currentStatus.dependencies.supertonic,
                  status,
                ),
              },
              phase: "downloading",
            }));
          },
        });
      }

      setModelCacheStatus(supertonicStatus);

      const dependencies = buildSetupDependencies(qwenStatus, supertonicStatus);
      setSetupStatus({
        dependencies,
        error: "",
        phase: setupDependenciesAreReady(dependencies) ? "ready" : "needs-setup",
      });
    } catch (error) {
      setSetupStatus((currentStatus) => ({
        ...currentStatus,
        error: getErrorMessage(error),
        phase: "error",
      }));
    }
  }

  function toggleSaved(cardId) {
    setSavedCardIds((currentIds) =>
      currentIds.includes(cardId)
        ? currentIds.filter((id) => id !== cardId)
        : [...currentIds, cardId],
    );
  }

  function updateTtsResult(resultKey, result, shouldPersist = false) {
    setTtsResults((currentResults) => {
      const nextResults = {
        ...currentResults,
        [resultKey]: result,
      };

      if (shouldPersist) {
        persistTtsResults(nextResults);
      }

      return nextResults;
    });
  }

  function clearTtsResults() {
    window.localStorage.removeItem(TTS_RESULTS_STORAGE_KEY);
    setTtsResults({});
  }

  async function handleGenerateMoreCards() {
    if (isGeneratingCardsRef.current) {
      return;
    }

    const languageCode = selectedLanguage;
    const languageConfig = LANGUAGES.find((language) => language.code === languageCode);
    const existingCards = [
      ...SAMPLE_CARDS.filter((card) => card.languageCode === languageCode),
      ...(generatedCardsByLanguage[languageCode] ?? []),
    ];

    isGeneratingCardsRef.current = true;
    setIsGeneratingCards(true);
    setGenerationStatus({
      debug: null,
      message: `Generating next ${languageConfig?.label ?? "language"} card`,
      tone: "loading",
    });

    try {
      const result = await generateFeedCards({
        count: 1,
        existingCards,
        languageCode,
        onStatus: (status) => {
          if (selectedLanguageRef.current !== languageCode) {
            return;
          }

          setGenerationStatus((currentStatus) => ({
            debug: status.debug ?? currentStatus?.debug ?? null,
            message: status.message ?? "Generating next card",
            tone: "loading",
          }));
        },
      });
      const generatedCardId = result.cards[0]?.id ?? null;

      if (selectedLanguageRef.current === languageCode) {
        lastGeneratedCardIdRef.current = generatedCardId;
      }

      setGeneratedCardsByLanguage((currentCardsByLanguage) => {
        const currentCards = currentCardsByLanguage[languageCode] ?? [];

        return {
          ...currentCardsByLanguage,
          [languageCode]: [...currentCards, ...result.cards],
        };
      });

      if (selectedLanguageRef.current === languageCode) {
        setGenerationStatus({
          debug: result.debug ?? null,
          message: "Added next card",
          tone: "success",
        });
      }
    } catch (error) {
      if (selectedLanguageRef.current === languageCode) {
        setGenerationStatus((currentStatus) => ({
          debug: getGenerationDebug(error) ?? currentStatus?.debug ?? null,
          message: getErrorMessage(error),
          tone: "error",
        }));
      }
    } finally {
      isGeneratingCardsRef.current = false;
      setIsGeneratingCards(false);
    }
  }

  async function handlePrepareModel() {
    const speechKey = "tts:prepare";

    setActiveSpeechKey(speechKey);
    setSpeechStatus({
      message: "Supertonic: preparing model",
      tone: "loading",
    });

    try {
      await prepareTtsModel({
        onStatus: (status) => {
          setSpeechStatus({
            message: buildStatusMessage(null, status),
            tone: "loading",
          });
        },
      });

      await refreshModelCacheStatus();

      setSpeechStatus({
        message: "Supertonic: ready",
        tone: "success",
      });
    } catch (error) {
      setSpeechStatus({
        message: `Supertonic: ${getErrorMessage(error)}`,
        tone: "error",
      });
    } finally {
      setActiveSpeechKey((currentKey) => (currentKey === speechKey ? null : currentKey));
    }
  }

  async function handleSpeak({ languageCode, resultKey, sampleLabel, speechKey, text }) {
    const languageConfig = getTtsLanguageConfig(languageCode);
    const initialMessage = languageConfig
      ? `${languageConfig.label}: preparing audio`
      : "Preparing audio";

    setActiveSpeechKey(speechKey);
    setSpeechStatus({
      message: initialMessage,
      tone: "loading",
    });

    if (resultKey) {
      updateTtsResult(resultKey, {
        languageCode,
        message: initialMessage,
        sampleLabel,
        text,
        tone: "loading",
      });
    }

    try {
      const result = await speak({
        languageCode,
        onStatus: (status) => {
          const message = buildStatusMessage(languageConfig, status);

          setSpeechStatus({
            message,
            tone: "loading",
          });

          if (resultKey) {
            updateTtsResult(resultKey, {
              languageCode,
              message,
              sampleLabel,
              text,
              tone: "loading",
            });
          }
        },
        text,
      });

      await refreshModelCacheStatus();

      const message = buildResultMessage(languageConfig, result);

      setSpeechStatus({
        message,
        tone: "success",
      });

      if (resultKey) {
        updateTtsResult(
          resultKey,
          buildTtsLogEntry({
            languageCode,
            message,
            result,
            sampleLabel,
            text,
            tone: "success",
          }),
          true,
        );
      }
    } catch (error) {
      const message = languageConfig
        ? `${languageConfig.label}: ${getErrorMessage(error)}`
        : getErrorMessage(error);

      setSpeechStatus({
        message,
        tone: "error",
      });

      if (resultKey) {
        updateTtsResult(
          resultKey,
          buildTtsLogEntry({
            languageCode,
            message,
            result: null,
            sampleLabel,
            text,
            tone: "error",
          }),
          true,
        );
      }
    } finally {
      setActiveSpeechKey((currentKey) => (currentKey === speechKey ? null : currentKey));
    }
  }

  if (!hasEnteredApp) {
    return (
      <SetupScreen
        onEnter={() => {
          setActiveView("feed");
          setHasEnteredApp(true);
        }}
        onSetup={handleSetupModels}
        setupStatus={setupStatus}
      />
    );
  }

  return (
    <main className="app-shell">
      <header className="top-bar" aria-label="LangTok controls">
        <h1>LangTok</h1>

        <div className="header-actions">
          <label className="language-picker">
            <Languages aria-hidden="true" size={18} />
            <span className="sr-only">Target language</span>
            <select
              value={selectedLanguage}
              onChange={(event) => setSelectedLanguage(event.target.value)}
            >
              {LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.label}
                </option>
              ))}
            </select>
          </label>

          <button
            className="header-icon-button"
            type="button"
            aria-label="Open TTS test harness"
            onClick={() => setActiveView("tts")}
          >
            <Volume2 aria-hidden="true" size={18} />
          </button>

          <button
            className="word-wall-button"
            type="button"
            aria-label="Open Word Wall"
            onClick={() => setActiveView("wordWall")}
          >
            <Grid2X2 aria-hidden="true" size={18} />
            <span>{savedCards.length}</span>
          </button>
        </div>
      </header>

      {activeView === "feed" ? (
        <section className="feed" aria-label="For You language feed" ref={feedRef}>
          {visibleCards.map((card) => (
            <LanguageCard
              activeSpeechKey={activeSpeechKey}
              card={card}
              isSaved={savedCardIds.includes(card.id)}
              key={card.id}
              onSpeak={handleSpeak}
              onToggleSaved={toggleSaved}
            />
          ))}
          <FeedGenerationCard
            generationStatus={generationStatus}
            isGenerating={isGeneratingCards}
            sentinelRef={feedEndRef}
          />
        </section>
      ) : null}

      {activeView === "wordWall" ? (
        <WordWall
          activeSpeechKey={activeSpeechKey}
          onBackToFeed={() => setActiveView("feed")}
          onSpeak={handleSpeak}
          onToggleSaved={toggleSaved}
          savedCards={savedCards}
        />
      ) : null}

      {activeView === "tts" ? (
        <TtsHarness
          activeSpeechKey={activeSpeechKey}
          modelCacheStatus={modelCacheStatus}
          onBackToFeed={() => setActiveView("feed")}
          onClearResults={clearTtsResults}
          onPrepareModel={handlePrepareModel}
          onSpeak={handleSpeak}
          results={ttsResults}
        />
      ) : null}

      <SpeechStatus status={speechStatus} />
    </main>
  );
}

function SetupScreen({ onEnter, onSetup, setupStatus }) {
  const { dependencies, error, phase } = setupStatus;
  const ready = setupDependenciesAreReady(dependencies);
  const blockingIssue = setupHasBlockingIssue(dependencies);
  const isChecking = phase === "checking";
  const isDownloading = phase === "downloading";
  const buttonLabel = ready ? "Enter LangTok" : "Download models";
  const buttonDisabled = isChecking || isDownloading || blockingIssue;
  const setupMessage = ready
    ? "Models cached"
    : isDownloading
      ? "Downloading models"
      : "Download Qwen and Supertonic before entering.";

  return (
    <main className="setup-shell">
      <section className="setup-content" aria-label="LangTok setup">
        <div className="setup-heading">
          <p>LangTok</p>
          <h1>Local setup</h1>
        </div>

        <div className="setup-dependencies">
          <DependencyProgress dependency={dependencies.qwen} kind="qwen" />
          <DependencyProgress dependency={dependencies.supertonic} kind="supertonic" />
        </div>

        <p className={`setup-message ${error ? "error" : ""}`}>{error || setupMessage}</p>

        <button
          className="setup-button"
          type="button"
          disabled={buttonDisabled}
          onClick={ready ? onEnter : onSetup}
        >
          {ready ? <Sparkles aria-hidden="true" size={18} /> : <Download aria-hidden="true" size={18} />}
          <span>{isDownloading ? "Downloading" : buttonLabel}</span>
        </button>
      </section>
    </main>
  );
}

function DependencyProgress({ dependency, kind }) {
  const percent = Math.round(clampProgress(dependency.progress) * 100);
  let message = dependency.message;

  if (!dependency.supportsCache) {
    message = "Cache unavailable";
  } else if (kind === "qwen" && !dependency.supportsWebGpu) {
    message = "WebGPU required";
  } else if (dependency.cached) {
    message = "Cached";
  } else if (dependency.totalBytes && dependency.loadedBytes) {
    message = `${formatBytes(dependency.loadedBytes)} / ${formatBytes(dependency.totalBytes)}`;
  } else if (!dependency.checked) {
    message = "Checking";
  } else if (dependency.total > 1) {
    message = `Cached ${dependency.cachedCount}/${dependency.total}`;
  } else {
    message = "Not cached";
  }

  return (
    <div className="dependency-row">
      <div className="dependency-copy">
        <span>{dependency.label}</span>
        <small>{message}</small>
      </div>
      <div
        aria-label={`${dependency.label} setup progress`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        className="progress-track"
        role="progressbar"
      >
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function FeedGenerationCard({ generationStatus, isGenerating, sentinelRef }) {
  const tone = generationStatus?.tone ?? "idle";
  const message =
    generationStatus?.message ?? (isGenerating ? "Generating next card" : "Scroll for more");
  const debug = generationStatus?.debug ?? null;

  return (
    <article className={`feed-status-card ${tone}`}>
      <div className="feed-status-content">
        <Sparkles aria-hidden="true" className={isGenerating ? "is-pulsing" : ""} size={24} />
        <p>{message}</p>
      </div>
      <GenerationDebugPanel debug={debug} />
      <span aria-hidden="true" className="feed-sentinel" ref={sentinelRef} />
    </article>
  );
}

function GenerationDebugPanel({ debug }) {
  if (!debug) {
    return null;
  }

  const open =
    debug.stage === "repairing" ||
    debug.stage === "validating-repair" ||
    debug.stage === "rejected-repair" ||
    debug.stage === "retrying";
  const attemptLabel = debug.attempt ? `Attempt ${debug.attempt}` : "Contract";

  return (
    <details className="generation-debug" open={open}>
      <summary>
        <span>Inspect</span>
        <small>{attemptLabel}</small>
      </summary>

      <div className="generation-debug-grid">
        <GenerationDebugBlock title="Expected" value={debug.expected} />
        <GenerationDebugBlock
          title="Qwen output"
          value={debug.rawResponse || "Waiting for Qwen output."}
        />
        {debug.repairResponse ? (
          <GenerationDebugBlock title="Repair output" value={debug.repairResponse} />
        ) : null}
        {debug.problem ? <GenerationDebugBlock title="Problem" value={debug.problem} /> : null}
      </div>
    </details>
  );
}

function GenerationDebugBlock({ title, value }) {
  return (
    <div className="generation-debug-block">
      <span>{title}</span>
      <pre>{value}</pre>
    </div>
  );
}

function LanguageCard({ activeSpeechKey, card, isSaved, onSpeak, onToggleSaved }) {
  const speechKey = `feed:${card.id}`;
  const isSpeaking = activeSpeechKey === speechKey;
  const textDirection = getLanguageDirection(card.languageCode);

  return (
    <article className="language-card" data-card-id={card.id}>
      <div className="card-content">
        <div className="phrase-block">
          <p className="target-text" dir={textDirection}>
            {card.targetText}
          </p>
          <p className="translation">{card.translation}</p>
        </div>

        <dl className="card-details">
          <div>
            <dt>Say it</dt>
            <dd>{card.phoneticSpelling}</dd>
          </div>
          <div>
            <dt>Example</dt>
            <dd dir={textDirection}>{card.example}</dd>
          </div>
          <div>
            <dt>Meaning</dt>
            <dd>{card.exampleTranslation}</dd>
          </div>
        </dl>
      </div>

      <div className="card-actions" aria-label={`${card.targetText} actions`}>
        <button
          className="icon-button"
          type="button"
          aria-busy={isSpeaking}
          aria-label={`Play ${card.targetText}`}
          disabled={Boolean(activeSpeechKey)}
          onClick={() =>
            onSpeak({
              languageCode: card.languageCode,
              speechKey,
              text: card.ttsText ?? card.targetText,
            })
          }
        >
          <Volume2 aria-hidden="true" className={isSpeaking ? "is-pulsing" : ""} size={24} />
        </button>

        <button
          className="icon-button"
          type="button"
          aria-label={isSaved ? `Unsave ${card.targetText}` : `Save ${card.targetText}`}
          onClick={() => onToggleSaved(card.id)}
        >
          {isSaved ? (
            <BookmarkCheck aria-hidden="true" size={24} />
          ) : (
            <Bookmark aria-hidden="true" size={24} />
          )}
        </button>
      </div>
    </article>
  );
}

function WordWall({ activeSpeechKey, onBackToFeed, onSpeak, onToggleSaved, savedCards }) {
  return (
    <section className="word-wall" aria-label="Saved Word Wall">
      <div className="word-wall-inner">
        <ViewHeader onBackToFeed={onBackToFeed} title="Word Wall" />

        {savedCards.length === 0 ? (
          <div className="empty-state">
            <h3>No saved cards yet</h3>
            <p>Save words and phrases from the feed to collect them here alphabetically.</p>
          </div>
        ) : (
          <div className="saved-grid">
            {savedCards.map((card) => {
              const speechKey = `wall:${card.id}`;
              const isSpeaking = activeSpeechKey === speechKey;
              const textDirection = getLanguageDirection(card.languageCode);

              return (
                <article className="saved-card" key={card.id}>
                  <div className="saved-card-main">
                    <h3 dir={textDirection}>{card.targetText}</h3>
                    <p>{card.translation}</p>
                  </div>

                  <dl className="saved-card-details">
                    <div>
                      <dt>Say it</dt>
                      <dd>{card.phoneticSpelling}</dd>
                    </div>
                    <div>
                      <dt>Example</dt>
                      <dd dir={textDirection}>{card.example}</dd>
                    </div>
                  </dl>

                  <div className="saved-card-actions">
                    <button
                      className="icon-button"
                      type="button"
                      aria-busy={isSpeaking}
                      aria-label={`Play ${card.targetText}`}
                      disabled={Boolean(activeSpeechKey)}
                      onClick={() =>
                        onSpeak({
                          languageCode: card.languageCode,
                          speechKey,
                          text: card.ttsText ?? card.targetText,
                        })
                      }
                    >
                      <Volume2
                        aria-hidden="true"
                        className={isSpeaking ? "is-pulsing" : ""}
                        size={22}
                      />
                    </button>

                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`Remove ${card.targetText} from Word Wall`}
                      onClick={() => onToggleSaved(card.id)}
                    >
                      <BookmarkCheck aria-hidden="true" size={22} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function TtsHarness({
  activeSpeechKey,
  modelCacheStatus,
  onBackToFeed,
  onClearResults,
  onPrepareModel,
  onSpeak,
  results,
}) {
  const hasResults = Object.keys(results).length > 0;
  const isPreparing = activeSpeechKey === "tts:prepare";

  return (
    <section className="tts-harness" aria-label="TTS test harness">
      <div className="tts-harness-inner">
        <ViewHeader onBackToFeed={onBackToFeed} title="TTS">
          <div className="view-header-actions">
            <button
              className="clear-button"
              type="button"
              disabled={Boolean(activeSpeechKey)}
              onClick={onPrepareModel}
            >
              <Download aria-hidden="true" className={isPreparing ? "is-pulsing" : ""} size={17} />
              <span>{modelCacheStatus.cached ? "Ready" : "Download"}</span>
            </button>

            {hasResults ? (
              <button className="clear-button" type="button" onClick={onClearResults}>
                <Trash2 aria-hidden="true" size={17} />
                <span>Clear</span>
              </button>
            ) : null}
          </div>
        </ViewHeader>

        <div className="tts-grid">
          {TTS_TEST_CASES.map((testCase) => {
            const result = results[testCase.code];
            const wordSpeechKey = `tts:${testCase.code}:word`;
            const phraseSpeechKey = `tts:${testCase.code}:phrase`;

            return (
              <article className="tts-card" key={testCase.code}>
                <div className="tts-card-main">
                  <h3>{testCase.label}</h3>
                  <p>{buildIdleTtsMessage(modelCacheStatus)}</p>
                </div>

                <div className="tts-samples">
                  <p dir={testCase.direction}>{testCase.sampleWord}</p>
                  <small>{testCase.sampleWordPhonetic}</small>
                  <p dir={testCase.direction}>{testCase.samplePhrase}</p>
                  <small>{testCase.samplePhrasePhonetic}</small>
                </div>

                <div className="tts-actions">
                  <button
                    className="sample-button"
                    type="button"
                    disabled={Boolean(activeSpeechKey)}
                    onClick={() =>
                      onSpeak({
                        languageCode: testCase.code,
                        resultKey: testCase.code,
                        sampleLabel: "word",
                        speechKey: wordSpeechKey,
                        text: testCase.sampleTtsWord ?? testCase.sampleWord,
                      })
                    }
                  >
                    <Volume2
                      aria-hidden="true"
                      className={activeSpeechKey === wordSpeechKey ? "is-pulsing" : ""}
                      size={18}
                    />
                    <span>Word</span>
                  </button>

                  <button
                    className="sample-button"
                    type="button"
                    disabled={Boolean(activeSpeechKey)}
                    onClick={() =>
                      onSpeak({
                        languageCode: testCase.code,
                        resultKey: testCase.code,
                        sampleLabel: "phrase",
                        speechKey: phraseSpeechKey,
                        text: testCase.sampleTtsPhrase ?? testCase.samplePhrase,
                      })
                    }
                  >
                    <Volume2
                      aria-hidden="true"
                      className={activeSpeechKey === phraseSpeechKey ? "is-pulsing" : ""}
                      size={18}
                    />
                    <span>Phrase</span>
                  </button>
                </div>

                <div className={`tts-result ${result?.tone ?? "idle"}`} aria-live="polite">
                  <p>{result?.message ?? buildIdleTtsMessage(modelCacheStatus)}</p>
                  <TtsResultDetails result={result} />
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TtsResultDetails({ result }) {
  if (!result || result.tone === "loading") {
    return null;
  }

  const engineLabel = result.engineLabel ?? "not recorded";
  const testedAtLabel = formatTimestamp(result.testedAt);

  return (
    <dl className="tts-metrics">
      <div>
        <dt>Sample</dt>
        <dd>{result.sampleLabel}</dd>
      </div>
      <div>
        <dt>Engine</dt>
        <dd>{engineLabel}</dd>
      </div>
      {result.voiceName ? (
        <div>
          <dt>Voice</dt>
          <dd>{result.voiceName}</dd>
        </div>
      ) : null}
      {result.loadMs !== null ? (
        <div>
          <dt>Load</dt>
          <dd>{formatMs(result.loadMs)}</dd>
        </div>
      ) : null}
      {result.synthMs !== null ? (
        <div>
          <dt>Generate</dt>
          <dd>{formatMs(result.synthMs)}</dd>
        </div>
      ) : null}
      {result.totalMs !== null ? (
        <div>
          <dt>Total</dt>
          <dd>{formatMs(result.totalMs)}</dd>
        </div>
      ) : null}
      {testedAtLabel ? (
        <div>
          <dt>Last</dt>
          <dd>{testedAtLabel}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function ViewHeader({ children, onBackToFeed, title }) {
  return (
    <div className="view-header">
      <button className="back-button" type="button" onClick={onBackToFeed}>
        <ArrowLeft aria-hidden="true" size={18} />
        <span>Feed</span>
      </button>

      <div>
        <h2>{title}</h2>
      </div>

      {children}
    </div>
  );
}

function SpeechStatus({ status }) {
  if (!status) {
    return null;
  }

  return (
    <div className={`speech-toast ${status.tone}`} role="status">
      {status.message}
    </div>
  );
}

export default App;
