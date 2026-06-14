import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import { generatePlaylistIdea } from "./gemini.js";
import * as spotify from "./spotify.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

for (const key of ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "GEMINI_API_KEY", "BASE_URL"]) {
  if (!process.env[key]) {
    console.error(`Missing ${key} — copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
}

const app = express();
app.use(express.json());
app.use(cookieParser());

// In-memory sessions: sessionId -> { accessToken, refreshToken, expiresAt, user }
// Fine for a hobby server; restartting logs everyone out, they just tap "Connect" again.
const sessions = new Map();

function getSession(req) {
  const id = req.cookies.sid;
  return id ? sessions.get(id) : undefined;
}

async function freshAccessToken(session) {
  if (Date.now() < session.expiresAt - 60_000) return session.accessToken;
  const data = await spotify.refreshAccessToken(session.refreshToken);
  session.accessToken = data.access_token;
  session.expiresAt = Date.now() + data.expires_in * 1000;
  if (data.refresh_token) session.refreshToken = data.refresh_token;
  return session.accessToken;
}

// ---------- Auth ----------

app.get("/auth/login", (_req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  // Set oauth_state as cross-site to survive the OAuth redirect chain
  res.cookie("oauth_state", state, {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    maxAge: 600_000,
  });
  res.redirect(spotify.authorizeUrl(state));
});

app.get("/auth/callback", async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect("/?error=" + encodeURIComponent(error));
  if (!state || state !== req.cookies.oauth_state) {
    return res.status(400).send("State mismatch — try logging in again.");
  }
  res.clearCookie("oauth_state");

  try {
    const tokens = await spotify.exchangeCode(code);
    const me = await spotify.getMe(tokens.access_token);
    console.log(`Spotify login: ${me.id} (${me.display_name}) — scopes granted: ${tokens.scope}`);

    const sid = crypto.randomBytes(24).toString("hex");
    sessions.set(sid, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      scope: tokens.scope,
      user: { id: me.id, name: me.display_name || me.id },
    });
    // Set session cookie for the API domain; allow cross-site requests from the static site
    res.cookie("sid", sid, {
      httpOnly: true,
      sameSite: "none",
      secure: true,
      maxAge: 30 * 24 * 3600 * 1000,
    });
    // Redirect back to the client UI (if provided) so users land on the static site
    res.redirect(process.env.CLIENT_URL || "/");
  } catch (err) {
    console.error("OAuth callback failed:", err);
    res.redirect("/?error=login_failed");
  }
});

app.post("/api/logout", (req, res) => {
  sessions.delete(req.cookies.sid);
  res.clearCookie("sid");
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const session = getSession(req);
  if (!session) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, user: session.user });
});

// ---------- The main event ----------

app.post("/api/playlist", async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Not logged in" });

  const feeling = (req.body?.feeling || "").trim().slice(0, 500);
  if (!feeling) return res.status(400).json({ error: "Tell me how you're feeling first." });

  try {
    const token = await freshAccessToken(session);

    // 1. Gemini turns the feeling into a playlist concept
    const idea = await generatePlaylistIdea(feeling);

    // 2. Resolve each suggestion to a real Spotify track (parallel, misses dropped)
    const results = await Promise.all(
      idea.tracks.map((t) => spotify.findTrack(token, t).catch(() => null))
    );
    const seen = new Set();
    const tracks = results.filter((t) => {
      if (!t || seen.has(t.uri)) return false;
      seen.add(t.uri);
      return true;
    });

    if (tracks.length < 3) {
      return res.status(502).json({
        error: "Couldn't find enough of those songs on Spotify — try describing your mood differently.",
      });
    }

    // 3. Create the playlist on the user's account and add the tracks
    const playlist = await spotify.createPlaylist(token, {
      name: idea.playlistName,
      description: `${idea.description} (made by Moodify from: "${feeling}")`.slice(0, 300),
    });
    await spotify.addTracks(token, playlist.id, tracks.map((t) => t.uri));

    res.json({
      name: idea.playlistName,
      description: idea.description,
      url: playlist.external_urls?.spotify,
      uri: playlist.uri,
      tracks: tracks.map(({ name, artists, albumArt }) => ({ name, artists, albumArt })),
    });
  } catch (err) {
    console.error("Playlist creation failed:", err);
    if (err.status === 401) {
      sessions.delete(req.cookies.sid);
      return res.status(401).json({ error: "Spotify session expired — log in again." });
    }
    if (err.status === 403) {
      return res.status(403).json({
        error:
          "Spotify refused (403). If this account isn't the app owner, add it under User Management in the Spotify developer dashboard.",
      });
    }
    if (err.status === 503 || err.status === 429) {
      return res.status(503).json({
        error: "The AI is overloaded right now — wait a minute and try again.",
      });
    }
    res.status(500).json({ error: "Something went wrong making your playlist. Try again." });
  }
});

// ---------- Static client (production build) ----------

const dist = path.join(__dirname, "..", "client", "dist");
app.use(express.static(dist));
app.get(/^\/(?!api|auth).*/, (_req, res) => {
  res.sendFile(path.join(dist, "index.html"), (err) => {
    if (err) res.status(404).send("Client not built yet — run: npm run build");
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Moodify running:`);
  console.log(`  Local:  http://127.0.0.1:${PORT}`);
  console.log(`  Public: ${process.env.BASE_URL}  (share this with phones)`);
});
