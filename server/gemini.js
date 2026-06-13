// Turns a free-text feeling into a playlist concept via the Gemini API.

const GEMINI_URL = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    playlistName: {
      type: "STRING",
      description: "A short, evocative playlist name (max 6 words). No quotes.",
    },
    description: {
      type: "STRING",
      description:
        "One sentence describing the vibe of the playlist, written to the listener.",
    },
    tracks: {
      type: "ARRAY",
      description: "20 real, well-known songs that match the mood.",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          artist: { type: "STRING" },
        },
        required: ["title", "artist"],
      },
    },
  },
  required: ["playlistName", "description", "tracks"],
};

// Tried in order when a model is overloaded (503) or rate-limited (429).
const FALLBACK_MODELS = ["gemini-2.5-flash-lite", "gemini-2.0-flash"];

export async function generatePlaylistIdea(feeling) {
  const primary = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const models = [primary, ...FALLBACK_MODELS.filter((m) => m !== primary)];

  const prompt = [
    "You are a brilliant music curator. A listener just told you how they are feeling:",
    `"${feeling}"`,
    "",
    "Create a playlist for them:",
    "- Pick exactly 20 real songs that exist on Spotify and genuinely fit this emotional state.",
    "- Mix familiar picks with a few deeper cuts. Vary the artists (no more than 2 songs per artist).",
    "- If the feeling implies an activity (gym, studying, heartbreak, driving at night), lean into it.",
    "- Give the playlist a short evocative name and a one-sentence description addressed to the listener.",
    "- Use the artist's primary name as credited on Spotify.",
  ].join("\n");

  let lastErr;
  for (const model of models) {
    try {
      return await callModel(model, prompt);
    } catch (err) {
      lastErr = err;
      // Only fall through on overload/rate-limit; other errors won't fix themselves.
      if (err.status !== 503 && err.status !== 429) throw err;
      console.warn(`Gemini ${model} unavailable (${err.status}), trying next model…`);
    }
  }
  throw lastErr;
}

async function callModel(model, prompt) {
  const res = await fetch(GEMINI_URL(model), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 1.0,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`Gemini API error ${res.status}: ${body.slice(0, 500)}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned no content");
  }

  const idea = JSON.parse(text);
  if (!Array.isArray(idea.tracks) || idea.tracks.length === 0) {
    throw new Error("Gemini returned no tracks");
  }
  return idea;
}
