"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Github } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { registerRequest } from "@/lib/auth";

export default function LandingPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function openModal(initialMode: "login" | "register") {
    setMode(initialMode);
    setError(null);
    setEmail("");
    setPassword("");
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "register") {
        await registerRequest(email, password);
      }
      await login(email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="h-screen overflow-hidden flex flex-col bg-white text-black"
      style={{ fontFamily: "var(--font-space-grotesk)" }}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-5 shrink-0">
        <Image
          src="/yosemite_logo.png"
          alt="Yosemite"
          width={36}
          height={36}
          className="object-contain"
        />

        {/* Right nav: Log In + Sign Up | GitHub */}
        <div className="flex items-center gap-4">
          <div className="flex items-center">
            <button
              onClick={() => openModal("login")}
              className="border border-black w-24 py-2 text-xs font-medium tracking-widest lowercase hover:bg-black hover:text-white transition-colors"
            >
              Log In
            </button>
            <button
              onClick={() => openModal("register")}
              className="border border-black border-l-0 w-24 py-2 text-xs font-medium tracking-widest lowercase hover:bg-black hover:text-white transition-colors"
            >
              Sign Up
            </button>
          </div>
          <a
            href="https://github.com/anthonytoyco/arrt"
            target="_blank"
            rel="noopener noreferrer"
            className="aspect-square py-2 flex items-center justify-center hover:text-black/50 transition-colors"
            aria-label="GitHub"
          >
            <Github size={18} strokeWidth={1.5} />
          </a>
        </div>
      </header>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Yosemite wordmark — sits flush at the bottom */}
      <div className="shrink-0 flex justify-center" style={{ height: "24vw" }}>
        <span
          className="leading-none select-none"
          style={{
            fontFamily: "var(--font-space-grotesk)",
            fontWeight: 700,
            fontSize: "20vw",
            letterSpacing: "-0.03em",
            whiteSpace: "nowrap",
          }}
        >
          yosem
          <span className="relative inline-block">
            {/* Dotless i (U+0131) — logo replaces the tittle */}
            &#305;
            <Image
              src="/yosemite_logo.png"
              alt=""
              width={48}
              height={48}
              className="absolute pointer-events-none"
              style={{
                width: "0.28em",
                height: "auto",
                top: "0.04em",
                left: "50%",
                transform: "translateX(-50%)",
              }}
            />
          </span>
          te
        </span>
      </div>

      {/* Auth Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 backdrop-blur-[2px]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div className="bg-white border border-black w-full max-w-sm">
            {/* Modal header */}
            <div className="flex items-center justify-between px-7 py-5 border-b border-black">
              <span className="text-xs font-medium tracking-widest lowercase">
                {mode === "login" ? "Sign In" : "Create Account"}
              </span>
              <button
                onClick={() => setModalOpen(false)}
                className="text-black/40 hover:text-black transition-colors text-lg leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Modal form */}
            <form onSubmit={handleSubmit} className="px-7 py-6 space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="text-[11px] font-medium tracking-widest lowercase text-black/60"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-black bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black placeholder:text-black/30"
                  placeholder="you@example.com"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="text-[11px] font-medium tracking-widest lowercase text-black/60"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete={
                    mode === "register" ? "new-password" : "current-password"
                  }
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-black bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black placeholder:text-black/30"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <p className="text-xs text-red-600 tracking-wide">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-black text-white py-2.5 text-xs font-medium tracking-widest lowercase hover:bg-black/80 disabled:opacity-50 transition-colors mt-2"
              >
                {loading
                  ? mode === "login"
                    ? "Signing in…"
                    : "Creating account…"
                  : mode === "login"
                    ? "Sign In"
                    : "Create Account"}
              </button>
            </form>

            {/* Toggle mode */}
            <div className="px-7 pb-6">
              <p className="text-center text-[11px] text-black/50 tracking-wide">
                {mode === "login"
                  ? "don't have an account?"
                  : "already have an account?"}{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === "login" ? "register" : "login");
                    setError(null);
                  }}
                  className="text-black underline underline-offset-2 hover:text-black/60 transition-colors"
                >
                  {mode === "login" ? "Sign up" : "Sign in"}
                </button>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
