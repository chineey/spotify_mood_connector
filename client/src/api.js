async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const getMe = () => request("/api/me");
export const logout = () => request("/api/logout", { method: "POST" });
export const createPlaylist = (feeling) =>
  request("/api/playlist", {
    method: "POST",
    body: JSON.stringify({ feeling }),
  });
