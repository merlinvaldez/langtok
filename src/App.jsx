import { ArrowLeft, Bookmark, BookmarkCheck, Grid2X2, Languages, Volume2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LANGUAGES, SAMPLE_CARDS } from "./data.js";
import { getTtsLanguageConfig, TTS_TEST_CASES } from "./ttsConfig.js";
import { getTtsEngineLabel, speak } from "./ttsService.js";

const SAVED_CARD_IDS_STORAGE_KEY = "langtok:savedCardIds";
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

function getLanguageDirection(languageCode) {
  return LANGUAGES.find((language) => language.code === languageCode)?.direction ?? "ltr";
}

function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function formatMs(milliseconds) {
  if (typeof milliseconds !== "number") {
    return "";
  }

  return milliseconds >= 1000 ? `${(milliseconds / 1000).toFixed(1)}s` : `${milliseconds}ms`;
}

function buildSpeechStatusMessage(languageConfig, status) {
  if (!languageConfig) {
    return status.message ?? "Preparing audio";
  }

  if (status.phase === "fallback") {
    return `${languageConfig.label}: ${status.message}`;
  }

  return `${languageConfig.label}: ${status.message ?? "Preparing audio"}`;
}

function buildResultMessage(languageConfig, result) {
  const engineLabel = getTtsEngineLabel(result);

  if (result.engine === "speech-synthesis") {
    return `${languageConfig.label}: played with ${engineLabel}`;
  }

  return `${languageConfig.label}: ${engineLabel} loaded ${formatMs(
    result.metrics?.loadMs,
  )}, generated ${formatMs(result.metrics?.synthMs)}`;
}

function App() {
  const [selectedLanguage, setSelectedLanguage] = useState("it");
  const [savedCardIds, setSavedCardIds] = useState(loadSavedCardIds);
  const [activeView, setActiveView] = useState("feed");
  const [activeSpeechKey, setActiveSpeechKey] = useState(null);
  const [speechStatus, setSpeechStatus] = useState(null);
  const [ttsResults, setTtsResults] = useState({});

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

  function toggleSaved(cardId) {
    setSavedCardIds((currentIds) =>
      currentIds.includes(cardId)
        ? currentIds.filter((id) => id !== cardId)
        : [...currentIds, cardId],
    );
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
      setTtsResults((currentResults) => ({
        ...currentResults,
        [resultKey]: {
          message: initialMessage,
          sampleLabel,
          tone: "loading",
        },
      }));
    }

    try {
      const result = await speak({
        languageCode,
        onStatus: (status) => {
          const message = buildSpeechStatusMessage(languageConfig, status);

          setSpeechStatus({
            message,
            tone: "loading",
          });

          if (resultKey) {
            setTtsResults((currentResults) => ({
              ...currentResults,
              [resultKey]: {
                message,
                sampleLabel,
                tone: "loading",
              },
            }));
          }
        },
        text,
      });

      const message = buildResultMessage(languageConfig, result);

      setSpeechStatus({
        message,
        tone: "success",
      });

      if (resultKey) {
        setTtsResults((currentResults) => ({
          ...currentResults,
          [resultKey]: {
            fallbackReason: result.fallbackReason,
            message,
            result,
            sampleLabel,
            tone: result.engine === "speech-synthesis" ? "fallback" : "success",
          },
        }));
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
        setTtsResults((currentResults) => ({
          ...currentResults,
          [resultKey]: {
            message,
            sampleLabel,
            tone: "error",
          },
        }));
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
          onBackToFeed={() => setActiveView("feed")}
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
              text: card.targetText,
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
                          text: card.targetText,
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

function TtsHarness({ activeSpeechKey, onBackToFeed, onSpeak, results }) {
  return (
    <section className="tts-harness" aria-label="TTS test harness">
      <div className="tts-harness-inner">
        <ViewHeader onBackToFeed={onBackToFeed} title="TTS" />

        <div className="tts-grid">
          {TTS_TEST_CASES.map((testCase) => {
            const result = results[testCase.code];
            const wordSpeechKey = `tts:${testCase.code}:word`;
            const phraseSpeechKey = `tts:${testCase.code}:phrase`;

            return (
              <article className="tts-card" key={testCase.code}>
                <div className="tts-card-main">
                  <h3>{testCase.label}</h3>
                  <p>{testCase.primary}</p>
                </div>

                <div className="tts-samples">
                  <p dir={testCase.direction}>{testCase.sampleWord}</p>
                  <p dir={testCase.direction}>{testCase.samplePhrase}</p>
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
                        text: testCase.sampleWord,
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
                        text: testCase.samplePhrase,
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
                  <p>{result?.message ?? `${testCase.status}: ${testCase.note}`}</p>
                  {result?.fallbackReason ? <p>{result.fallbackReason}</p> : null}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ViewHeader({ onBackToFeed, title }) {
  return (
    <div className="view-header">
      <button className="back-button" type="button" onClick={onBackToFeed}>
        <ArrowLeft aria-hidden="true" size={18} />
        <span>Feed</span>
      </button>

      <div>
        <h2>{title}</h2>
      </div>
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
