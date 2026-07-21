import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Download,
  Grid2X2,
  Languages,
  Trash2,
  Volume2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LANGUAGES, SAMPLE_CARDS } from "./data.js";
import { TTS_TEST_CASES, getTtsLanguageConfig } from "./ttsConfig.js";
import {
  getSupertonicCacheStatus,
  getTtsEngineLabel,
  prepareTtsModel,
  speak,
} from "./ttsService.js";

const SAVED_CARD_IDS_STORAGE_KEY = "langtok:savedCardIds";
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

function App() {
  const [selectedLanguage, setSelectedLanguage] = useState("it");
  const [savedCardIds, setSavedCardIds] = useState(loadSavedCardIds);
  const [activeView, setActiveView] = useState("feed");
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

  const visibleCards = useMemo(
    () => SAMPLE_CARDS.filter((card) => card.languageCode === selectedLanguage),
    [selectedLanguage],
  );

  const savedCards = useMemo(() => {
    const savedIds = new Set(savedCardIds);

    return SAMPLE_CARDS.filter((card) => savedIds.has(card.id)).sort((firstCard, secondCard) =>
      firstCard.targetText.localeCompare(secondCard.targetText, undefined, {
        sensitivity: "base",
      }),
    );
  }, [savedCardIds]);

  useEffect(() => {
    window.localStorage.setItem(SAVED_CARD_IDS_STORAGE_KEY, JSON.stringify(savedCardIds));
  }, [savedCardIds]);

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

  async function refreshModelCacheStatus() {
    const status = await getSupertonicCacheStatus();
    setModelCacheStatus(status);
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
        <section className="feed" aria-label="For You language feed">
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

function LanguageCard({ activeSpeechKey, card, isSaved, onSpeak, onToggleSaved }) {
  const speechKey = `feed:${card.id}`;
  const isSpeaking = activeSpeechKey === speechKey;
  const textDirection = getLanguageDirection(card.languageCode);

  return (
    <article className="language-card">
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
