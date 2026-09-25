// sessionStorage is per-tab and survives a reload, which is exactly the lifetime we want
// for a simulated device. Every access is wrapped: storage can throw in private windows
// or when site data is blocked, and the app must keep working (just without reload
// persistence) when it does.

export const tabStorage = {
  get(key: string): string | null {
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },

  set(key: string, value: string): void {
    try {
      window.sessionStorage.setItem(key, value);
    } catch {
      // Storage unavailable — state lives in memory only for this page load.
    }
  },

  remove(key: string): void {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  },

  getJson<T>(key: string): T | null {
    const raw = tabStorage.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  setJson(key: string, value: unknown): void {
    tabStorage.set(key, JSON.stringify(value));
  },
};
