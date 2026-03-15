"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  loginRequest,
  logoutRequest,
  refreshAccessToken,
  setAccessToken,
  UserInfo,
} from "@/lib/auth";

interface AuthContextValue {
  user: UserInfo | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount, try to restore session via refresh token cookie
  useEffect(() => {
    refreshAccessToken().then((token) => {
      if (token) {
        setAccessToken(token);
        const payload = parseJwtPayload(token);
        if (payload) {
          setUser({ id: payload.sub, email: payload.email, role: payload.role });
        }
      }
      setIsLoading(false);
    });
  }, []);

  async function login(email: string, password: string) {
    const data = await loginRequest(email, password);
    setAccessToken(data.access_token);
    setUser(data.user);
  }

  async function logout() {
    await logoutRequest();
    setUser(null);
    // Hard redirect so the proxy re-evaluates the missing cookie
    window.location.href = "/login";
  }

  // Prevent flash of protected content while checking session
  if (isLoading) {
    return null;
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

function parseJwtPayload(
  token: string,
): { sub: string; email: string; role: string } | null {
  try {
    const base64 = token.split(".")[1];
    const json = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}
