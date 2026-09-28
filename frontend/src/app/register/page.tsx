"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { login, register, setAccessToken } from "@/lib/api";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      await register(name.trim(), email.trim(), password);
      const token = await login(email.trim(), password);
      setAccessToken(token.access_token);
      window.location.replace("/");
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Registration failed");
      }

      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090b10] px-4 text-white">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-xl font-bold text-black">
            AI
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Create account</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Start chatting with Nova AI
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#111318] p-7 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="name" className="mb-2 block text-sm text-zinc-300">
                Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                autoComplete="name"
                required
                className="w-full rounded-xl border border-white/10 bg-[#181b21] px-4 py-3 outline-none transition placeholder:text-zinc-600 focus:border-white/30"
              />
            </div>

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
                placeholder="Create a password"
                autoComplete="new-password"
                required
                className="w-full rounded-xl border border-white/10 bg-[#181b21] px-4 py-3 outline-none transition placeholder:text-zinc-600 focus:border-white/30"
              />
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="mb-2 block text-sm text-zinc-300"
              >
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Repeat your password"
                autoComplete="new-password"
                required
                className="w-full rounded-xl border border-white/10 bg-[#181b21] px-4 py-3 outline-none transition placeholder:text-zinc-600 focus:border-white/30"
              />
            </div>

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
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-zinc-500">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-white hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
