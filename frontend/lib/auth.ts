const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

const ACCESS_TOKEN_KEY = "arrt_access_token";

export interface UserInfo {
  id: string;
  email: string;
  role: string;
}

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  if (accessToken) return accessToken;
  if (typeof window !== "undefined") {
    try {
      const stored = sessionStorage.getItem(ACCESS_TOKEN_KEY);
      if (stored) {
        accessToken = stored;
        return stored;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (typeof window !== "undefined") {
    try {
      if (token) sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
      else sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    } catch {
      // ignore
    }
  }
}

export async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      setAccessToken(null);
      return null;
    }
    const data: { access_token: string } = await res.json();
    setAccessToken(data.access_token);
    return data.access_token;
  } catch {
    setAccessToken(null);
    return null;
  }
}

export async function loginRequest(
  email: string,
  password: string,
): Promise<{ access_token: string; user: UserInfo }> {
  const res = await fetch(`${BACKEND_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Login failed" }));
    throw new Error(err.error ?? "Login failed");
  }
  return res.json();
}

export async function logoutRequest(): Promise<void> {
  await fetch(`${BACKEND_URL}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
  accessToken = null;
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    } catch {
      // ignore
    }
  }
}

export async function registerRequest(
  email: string,
  password: string,
): Promise<{ user_id: string; email: string; role: string }> {
  const res = await fetch(`${BACKEND_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Registration failed" }));
    throw new Error(err.error ?? "Registration failed");
  }
  return res.json();
}
