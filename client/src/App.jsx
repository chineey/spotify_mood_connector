import { useEffect, useRef, useState } from "react";
import { getMe, logout, createPlaylist } from "./api.js";

const LOADING_LINES = [
  "Reading the room…",
  "Asking Gemini about your vibe…",
  "Digging through the crates…",
  "Matching songs on Spotify…",
  "Sequencing the tracklist…",
  "Almost there…",
];

const SUGGESTIONS = [
  "heartbroken but pretending I'm fine",
  "hyped for the gym",
  "rainy Sunday, coffee, no plans",
  "main character energy",
  "can't sleep, brain won't stop",
];

export default function App() {
  const [me, setMe] = useState(null); // null = loading, {loggedIn, user?}
  const [feeling, setFeeling] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | working | done
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getMe().then(setMe).catch(() => setMe({ loggedIn: false }));
    const params = new URLSearchParams(window.location.search);
    if (params.get("error")) {
      setError("Spotify login didn't go through. Give it another try.");
      window.history.replaceState({}, "", "/");
    }
  }, []);

  async function submit(text) {
    const trimmed = text.trim();
    if (!trimmed || phase === "working") return;
    setError(null);
    setPhase("working");
    try {
      const playlist = await createPlaylist(trimmed);
      setResult(playlist);
      setPhase("done");
    } catch (err) {
      setError(err.message);
      setPhase("idle");
      if (err.status === 401) setMe({ loggedIn: false });
    }
  }

  function reset() {
    setResult(null);
    setFeeling("");
    setError(null);
    setPhase("idle");
  }

  if (me === null) return <Shell />;
  if (!me.loggedIn) return <Login error={error} />;
  if (phase === "working") return <Working feeling={feeling} />;
  if (phase === "done") return <Result result={result} onReset={reset} />;

  return (
    <MoodInput
      user={me.user}
      feeling={feeling}
      setFeeling={setFeeling}
      onSubmit={submit}
      onLogout={async () => {
        await logout();
        setMe({ loggedIn: false });
      }}
      error={error}
    />
  );
}

function Shell({ children }) {
  return (
    <div className="shell">
      <header className="brand">
        <span className="brand-dot" /> Moodify
      </header>
      {children}
    </div>
  );
}

function Login({ error }) {
  return (
    <Shell>
      <main className="hero">
        <h1>
          Feelings in.
          <br />
          <span className="accent">Playlist out.</span>
        </h1>
        <p className="sub">
          Tell us how you feel — Gemini curates a playlist and drops it straight
          into your Spotify.
        </p>
        {error && <p className="error">{error}</p>}
        <a className="btn btn-spotify" href="/auth/login">
          <SpotifyIcon /> Connect Spotify
        </a>
        <p className="fineprint">
          We only get permission to create playlists. Nothing else is touched.
        </p>
      </main>
    </Shell>
  );
}

function MoodInput({ user, feeling, setFeeling, onSubmit, onLogout, error }) {
  const { supported, listening, toggle } = useSpeech(setFeeling);

  return (
    <Shell>
      <main className="panel">
        <div className="userline">
          <span>
            Hey, <strong>{user.name}</strong>
          </span>
          <button className="linkish" onClick={onLogout}>
            log out
          </button>
        </div>

        <h2>How are you feeling right now?</h2>

        <div className="inputwrap">
          <textarea
            value={feeling}
            onChange={(e) => setFeeling(e.target.value)}
            placeholder="say anything… 'just got promoted', 'missing someone', 'need to focus for 2 hours'"
            rows={4}
            maxLength={500}
            autoFocus
          />
          {supported && (
            <button
              className={`mic ${listening ? "mic-on" : ""}`}
              onClick={toggle}
              aria-label={listening ? "Stop listening" : "Speak your mood"}
            >
              <MicIcon />
            </button>
          )}
        </div>
        {listening && <p className="listening">Listening… speak your mood</p>}

        <div className="chips">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="chip" onClick={() => setFeeling(s)}>
              {s}
            </button>
          ))}
        </div>

        {error && <p className="error">{error}</p>}

        <button
          className="btn btn-go"
          disabled={!feeling.trim()}
          onClick={() => onSubmit(feeling)}
        >
          Make my playlist ✦
        </button>
      </main>
    </Shell>
  );
}

function Working({ feeling }) {
  const [line, setLine] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setLine((l) => Math.min(l + 1, LOADING_LINES.length - 1)),
      2600
    );
    return () => clearInterval(t);
  }, []);

  return (
    <Shell>
      <main className="working">
        <div className="eq">
          <span /><span /><span /><span /><span />
        </div>
        <p className="working-line">{LOADING_LINES[line]}</p>
        <p className="working-feeling">“{feeling.trim()}”</p>
      </main>
    </Shell>
  );
}

function Result({ result, onReset }) {
  return (
    <Shell>
      <main className="result">
        <p className="kicker">Your playlist is live on Spotify</p>
        <h2>{result.name}</h2>
        <p className="desc">{result.description}</p>

        <div className="actions">
          <a
            className="btn btn-spotify"
            href={result.url}
            target="_blank"
            rel="noreferrer"
          >
            <SpotifyIcon /> Open in Spotify
          </a>
          <button className="btn btn-ghost" onClick={onReset}>
            New mood
          </button>
        </div>

        <ul className="tracklist">
          {result.tracks.map((t, i) => (
            <li key={i}>
              {t.albumArt ? (
                <img src={t.albumArt} alt="" loading="lazy" />
              ) : (
                <div className="art-placeholder" />
              )}
              <div>
                <div className="t-name">{t.name}</div>
                <div className="t-artist">{t.artists}</div>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </Shell>
  );
}

// Voice input via the Web Speech API (Chrome/Safari on most phones).
function useSpeech(onText) {
  const Rec =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);
  const recRef = useRef(null);
  const [listening, setListening] = useState(false);

  function toggle() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new Rec();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    rec.onresult = (e) => {
      const text = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join("");
      onText(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  return { supported: Boolean(Rec), listening, toggle };
}

function SpotifyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.5 17.34a.75.75 0 0 1-1.03.25c-2.82-1.73-6.37-2.12-10.55-1.16a.75.75 0 1 1-.33-1.46c4.57-1.05 8.5-.6 11.66 1.34.35.21.46.67.25 1.03zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.23-1.99-8.16-2.56-11.98-1.4a.94.94 0 1 1-.55-1.79c4.37-1.33 9.8-.69 13.51 1.6.44.27.58.85.31 1.28zm.13-3.4C15.24 8.37 8.84 8.16 5.15 9.28a1.12 1.12 0 1 1-.65-2.15c4.24-1.28 11.28-1.04 15.72 1.6a1.13 1.13 0 0 1-1.12 1.94z" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
      <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" />
    </svg>
  );
}
