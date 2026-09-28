"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";

import {
  ApiError,
  getAccessToken,
  getMe,
  login,
  setAccessToken,
} from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(
    searchParams.get("registered") === "1"
      ? "Account created. Sign in to continue."
      : ""
  );
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    async function redirectIfAuthenticated() {
      const token = getAccessToken();

      if (!token) {
        setCheckingSession(false);
        return;
      }

      try {
        await getMe(false);
        router.replace("/");
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          // Token is invalid; stay on login.
        }

        setCheckingSession(false);
      }
    }

    void redirectIfAuthenticated();
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const data = await login(email.trim(), password);
      setAccessToken(data.access_token);
      window.location.replace("/");
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Login failed");
      }

      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#090b10] text-zinc-400">
        Checking session...
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090b10] px-4 text-white">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-xl font-bold text-black">
            AI
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Sign in to continue to Nova AI
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#111318] p-7 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm text-zinc-300">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                className="w-full rounded-xl border border-white/10 bg-[#181b21] px-4 py-3 outline-none transition placeholder:text-zinc-600 focus:border-white/30"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm text-zinc-300"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                className="w-full rounded-xl border border-white/10 bg-[#181b21] px-4 py-3 outline-none transition placeholder:text-zinc-600 focus:border-white/30"
              />
            </div>

            {success && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                {success}
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-white px-4 py-3 font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-zinc-500">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="font-medium text-white hover:underline">
              Create account
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#090b10] text-zinc-400">
          Loading...
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
