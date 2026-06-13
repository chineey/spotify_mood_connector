# Moodify 🎧

Tell it how you're feeling → Gemini curates 20 songs → a playlist appears in your Spotify.

Mobile-first React web app. Run the server on your computer, friends open the URL on their
phones, log into **their own** Spotify, and get playlists on their own accounts.

## How it works

```
phone browser ──> React app ──> Express server ──> Gemini  (feeling → 20 song ideas)
                                       │
                                       └─────────> Spotify (search songs → create playlist)
```

API keys live only on the server. Each visitor authorizes via Spotify OAuth, so
playlists land in their account, not yours.

## Setup (one time)

### 1. Spotify app
1. Go to https://developer.spotify.com/dashboard → **Create app**.
2. Set **Redirect URI** to `http://127.0.0.1:3000/auth/callback` (add your tunnel
   URL later, see below). Select **Web API**.
3. Copy the **Client ID** and **Client Secret**.
4. ⚠️ New Spotify apps start in **Development Mode**: only users you add under
   *User Management* (up to 25) can log in. Add your friends' Spotify emails there.

### 2. Gemini key
Grab a free API key at https://aistudio.google.com/apikey.

### 3. Configure & install
```powershell
copy .env.example .env     # then fill in the three keys
npm run setup              # installs server + client deps, builds the client
```

## Run it

```powershell
npm start
```

Open http://127.0.0.1:3000 — connect Spotify, type a feeling, get a playlist.

## Let phones connect

Spotify requires **https** for login redirects (except 127.0.0.1), so a plain
`http://192.168.x.x` LAN address won't work for OAuth. Use a free tunnel:

```powershell
# option A: cloudflared (no account needed)
winget install Cloudflare.cloudflared
cloudflared tunnel --url http://127.0.0.1:3000

# option B: ngrok
ngrok http 3000
```

Then:
1. Copy the `https://...` URL it prints.
2. Put it in `.env` as `BASE_URL=https://...` and restart `npm start`.
3. Add `https://.../auth/callback` as a second Redirect URI in the Spotify dashboard.
4. Share the https URL — phones can now connect from anywhere.

## Development

```powershell
npm run dev                  # server with auto-reload (port 3000)
npm --prefix client run dev  # vite dev server with hot reload (port 5173)
```

Open http://127.0.0.1:5173 — Vite proxies `/api` and `/auth` to the server.
After UI changes, `npm run build` refreshes what `npm start` serves.

## Notes & limits

- Sessions are in-memory: restarting the server logs everyone out (they just reconnect).
- Playlists are created **private** by default (`server/index.js`, `createPlaylist`).
- Voice input (mic button) uses the browser's Web Speech API — works on Chrome for
  Android and iOS Safari; the button hides itself where unsupported.
- Uses the post-Feb-2026 Web API endpoints (`POST /me/playlists`,
  `POST /playlists/{id}/items`). Dev-mode apps get bare 403s from the older
  `/users/{id}/playlists` and `/playlists/{id}/tracks` — see Spotify's
  [migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide).
