import { Bookmark, BookmarkCheck, Grid2X2, Languages, Volume2 } from "lucide-react";
import { useMemo, useState } from "react";

const LANGUAGES = [
  { label: "Spanish", code: "es" },
  { label: "French", code: "fr" },
  { label: "German", code: "de" },
  { label: "English", code: "en" },
];

const SAMPLE_CARDS = [
  {
    id: "es-todavia",
    language: "Spanish",
    languageCode: "es",
    type: "word",
    targetText: "todavia",
    translation: "still / yet",
    phoneticSpelling: "toh-dah-VEE-ah",
    example: "Todavia estoy aprendiendo.",
    exampleTranslation: "I am still learning.",
    tags: ["daily life", "adverb"],
  },
  {
    id: "es-me-da-igual",
    language: "Spanish",
    languageCode: "es",
    type: "phrase",
    targetText: "me da igual",
    translation: "it does not matter to me",
    phoneticSpelling: "meh dah ee-GWAHL",
    example: "Me da igual si caminamos o tomamos el bus.",
    exampleTranslation: "It does not matter to me if we walk or take the bus.",
    tags: ["conversation", "opinion"],
  },
  {
    id: "fr-bientot",
    language: "French",
    languageCode: "fr",
    type: "word",
    targetText: "bientot",
    translation: "soon",
    phoneticSpelling: "byen-TOH",
    example: "Le train arrive bientot.",
    exampleTranslation: "The train is arriving soon.",
    tags: ["time", "travel"],
  },
  {
    id: "fr-ca-marche",
    language: "French",
    languageCode: "fr",
    type: "phrase",
    targetText: "ca marche",
    translation: "that works / okay",
    phoneticSpelling: "sah marsh",
    example: "On se voit a huit heures ? Ca marche.",
    exampleTranslation: "We meet at eight? That works.",
    tags: ["conversation", "agreement"],
  },
  {
    id: "de-genau",
    language: "German",
    languageCode: "de",
    type: "word",
    targetText: "genau",
    translation: "exactly",
    phoneticSpelling: "guh-NOW",
    example: "Genau, das habe ich gemeint.",
    exampleTranslation: "Exactly, that is what I meant.",
    tags: ["conversation", "clarity"],
  },
  {
    id: "de-keine-sorge",
    language: "German",
    languageCode: "de",
    type: "phrase",
    targetText: "keine Sorge",
    translation: "do not worry",
    phoneticSpelling: "KAI-nuh ZOR-guh",
    example: "Keine Sorge, ich helfe dir.",
    exampleTranslation: "Do not worry, I will help you.",
    tags: ["reassurance", "daily life"],
  },
  {
    id: "en-by-the-way",
    language: "English",
    languageCode: "en",
    type: "phrase",
    targetText: "by the way",
    translation: "used to add a related thought",
    phoneticSpelling: "bye thuh way",
    example: "By the way, your pronunciation is improving.",
    exampleTranslation: "By the way, your pronunciation is improving.",
    tags: ["conversation", "transition"],
  },
  {
    id: "en-gradually",
    language: "English",
    languageCode: "en",
    type: "word",
    targetText: "gradually",
    translation: "slowly over time",
    phoneticSpelling: "GRA-joo-uh-lee",
    example: "You will gradually remember more words.",
    exampleTranslation: "You will gradually remember more words.",
    tags: ["learning", "time"],
  },
];

function App() {
  const [selectedLanguage, setSelectedLanguage] = useState("es");
  const [savedCardIds, setSavedCardIds] = useState([]);

  const visibleCards = useMemo(
    () => SAMPLE_CARDS.filter((card) => card.languageCode === selectedLanguage),
    [selectedLanguage],
  );

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
        <div>
          <p className="eyebrow">Browser-local language lab</p>
          <h1>LangTok</h1>
        </div>

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

          <button className="word-wall-button" type="button" aria-label="Open Word Wall">
            <Grid2X2 aria-hidden="true" size={18} />
            <span>{savedCardIds.length}</span>
          </button>
        </div>
      </header>

      <section className="feed" aria-label="For You language feed">
        {visibleCards.map((card, index) => (
          <LanguageCard
            card={card}
            isSaved={savedCardIds.includes(card.id)}
            key={card.id}
            onToggleSaved={toggleSaved}
            position={index + 1}
            total={visibleCards.length}
          />
        ))}
      </section>
    </main>
  );
}

function LanguageCard({ card, isSaved, onToggleSaved, position, total }) {
  return (
    <article className="language-card">
      <div className="card-content">
        <div className="card-meta">
          <span>{card.language}</span>
          <span>{card.type}</span>
          <span>
            {position}/{total}
          </span>
        </div>

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

        <ul className="tag-list" aria-label="Topics">
          {card.tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
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

export default App;
