// Thin fetch wrapper. Uses EXPO_PUBLIC_BACKEND_URL. All routes are /api/*.
//
// Every request has a hard timeout: a cold/unreachable backend must NEVER freeze
// the UI (onboarding "Weiter" used to hang for seconds waiting on a sleeping server).

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL as string;
const TIMEOUT_MS = 6000;

async function request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/api${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`API ${method} ${path} failed: ${res.status} ${text}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
};
