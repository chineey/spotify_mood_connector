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

export async function generatePlaylistIdea(feeling) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

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

  const res = await fetch(GEMINI_URL(model), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
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
    throw new Error(`Gemini API error ${res.status}: ${body.slice(0, 500)}`);
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
