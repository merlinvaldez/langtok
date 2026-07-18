import { ArrowLeft, Bookmark, BookmarkCheck, Grid2X2, Languages, Volume2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LANGUAGES, SAMPLE_CARDS } from "./data.js";

const SAVED_CARD_IDS_STORAGE_KEY = "langtok:savedCardIds";

function loadSavedCardIds() {
  try {
    const savedValue = window.localStorage.getItem(SAVED_CARD_IDS_STORAGE_KEY);
    const parsedValue = savedValue ? JSON.parse(savedValue) : [];

    return Array.isArray(parsedValue) ? parsedValue.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function App() {
  const [selectedLanguage, setSelectedLanguage] = useState("es");
  const [savedCardIds, setSavedCardIds] = useState(loadSavedCardIds);
  const [activeView, setActiveView] = useState("feed");

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

  function toggleSaved(cardId) {
    setSavedCardIds((currentIds) =>
      currentIds.includes(cardId)
        ? currentIds.filter((id) => id !== cardId)
        : [...currentIds, cardId],
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
              card={card}
              isSaved={savedCardIds.includes(card.id)}
              key={card.id}
              onToggleSaved={toggleSaved}
            />
          ))}
        </section>
      ) : (
        <WordWall
          savedCards={savedCards}
          onBackToFeed={() => setActiveView("feed")}
          onToggleSaved={toggleSaved}
        />
      )}
    </main>
  );
}

function LanguageCard({ card, isSaved, onToggleSaved }) {
  return (
    <article className="language-card">
      <div className="card-content">
        <div className="phrase-block">
          <p className="target-text">{card.targetText}</p>
          <p className="translation">{card.translation}</p>
        </div>

        <dl className="card-details">
          <div>
            <dt>Say it</dt>
            <dd>{card.phoneticSpelling}</dd>
          </div>
          <div>
            <dt>Example</dt>
            <dd>{card.example}</dd>
          </div>
          <div>
            <dt>Meaning</dt>
            <dd>{card.exampleTranslation}</dd>
          </div>
        </dl>
      </div>

      <div className="card-actions" aria-label={`${card.targetText} actions`}>
        <button className="icon-button" type="button" aria-label={`Play ${card.targetText}`}>
          <Volume2 aria-hidden="true" size={24} />
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

function WordWall({ savedCards, onBackToFeed, onToggleSaved }) {
  return (
    <section className="word-wall" aria-label="Saved Word Wall">
      <div className="word-wall-inner">
        <div className="word-wall-header">
          <button className="back-button" type="button" onClick={onBackToFeed}>
            <ArrowLeft aria-hidden="true" size={18} />
            <span>Feed</span>
          </button>

          <div>
            <h2>Word Wall</h2>
          </div>
        </div>

        {savedCards.length === 0 ? (
          <div className="empty-state">
            <h3>No saved cards yet</h3>
            <p>Save words and phrases from the feed to collect them here alphabetically.</p>
          </div>
        ) : (
          <div className="saved-grid">
            {savedCards.map((card) => (
              <article className="saved-card" key={card.id}>
                <div className="saved-card-main">
                  <h3>{card.targetText}</h3>
                  <p>{card.translation}</p>
                </div>

                <dl className="saved-card-details">
                  <div>
                    <dt>Say it</dt>
                    <dd>{card.phoneticSpelling}</dd>
                  </div>
                  <div>
                    <dt>Example</dt>
                    <dd>{card.example}</dd>
                  </div>
                </dl>

                <div className="saved-card-actions">
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`Play ${card.targetText}`}
                  >
                    <Volume2 aria-hidden="true" size={22} />
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
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default App;
