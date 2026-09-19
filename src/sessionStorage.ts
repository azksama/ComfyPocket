export function readStored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}

/** Session recovery is best effort; storage failure must not cancel an accepted PC job. */
export function writeStored(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeStored(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Storage can be unavailable in a WebView. */
  }
}

export function getClientId(): string {
  try {
    const saved = localStorage.getItem("clientId");
    if (saved) return saved;
  } catch {
    /* Keep an in-memory session when persistent storage is unavailable. */
  }
  const id = crypto.randomUUID();
  try {
    localStorage.setItem("clientId", id);
  } catch {
    /* Reconnection will use this session's ID. */
  }
  return id;
}
