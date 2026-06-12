// Spotify Web API helpers: OAuth token exchange, search, playlist creation.

const ACCOUNTS_BASE = "https://accounts.spotify.com";
const API_BASE = "https://api.spotify.com/v1";

export const SCOPES = [
  "playlist-modify-public",
  "playlist-modify-private",
  "user-read-private",
].join(" ");

function clientCredentials() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

export function authorizeUrl(state) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: `${process.env.BASE_URL}/auth/callback`,
    state,
  });
  return `${ACCOUNTS_BASE}/authorize?${params}`;
}

async function tokenRequest(body) {
  const res = await fetch(`${ACCOUNTS_BASE}/api/token`, {
    method: "POST",
    headers: {
      Authorization: clientCredentials(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify token error ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

export function exchangeCode(code) {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: `${process.env.BASE_URL}/auth/callback`,
  });
}

export function refreshAccessToken(refreshToken) {
  return tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

async function api(accessToken, path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(
      `Spotify API ${path} -> ${res.status}: ${text.slice(0, 300)}`
    );
    err.status = res.status;
    throw err;
  }
  // 201/200 with body expected everywhere we call this
  return res.json();
}

export function getMe(accessToken) {
  return api(accessToken, "/me");
}

// Search for one suggested track; returns a slim track object or null.
export async function findTrack(accessToken, { title, artist }) {
  const exact = `track:"${title}" artist:"${artist}"`;
  let result = await searchOnce(accessToken, exact);
  if (!result) {
    // Fall back to a loose query — handles remaster suffixes, featured artists, etc.
    result = await searchOnce(accessToken, `${title} ${artist}`);
  }
  return result;
}

async function searchOnce(accessToken, q) {
  const params = new URLSearchParams({ q, type: "track", limit: "1" });
  const data = await api(accessToken, `/search?${params}`);
  const track = data?.tracks?.items?.[0];
  if (!track) return null;
  return {
    uri: track.uri,
    name: track.name,
    artists: track.artists.map((a) => a.name).join(", "),
    albumArt: track.album?.images?.at(-1)?.url ?? null,
    previewUrl: track.preview_url,
  };
}

export async function createPlaylist(accessToken, userId, { name, description }) {
  return api(accessToken, `/users/${encodeURIComponent(userId)}/playlists`, {
    method: "POST",
    body: JSON.stringify({ name, description, public: false }),
  });
}

export async function addTracks(accessToken, playlistId, uris) {
  return api(accessToken, `/playlists/${playlistId}/tracks`, {
    method: "POST",
    body: JSON.stringify({ uris }),
  });
}
