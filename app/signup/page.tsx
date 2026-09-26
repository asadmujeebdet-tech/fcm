"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Input, Label } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setDone(true);
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-md bg-signal/15">
            <span className="h-2 w-2 rounded-full bg-signal" />
            <span className="absolute h-2 w-2 animate-ping2 rounded-full bg-signal" />
          </div>
          <span className="text-base font-semibold tracking-tight text-white">FCM Broadcast</span>
        </div>

        {done ? (
          <>
            <h1 className="text-xl font-semibold text-white">Check your email</h1>
            <p className="mt-2 text-sm text-ink2">
              We sent a confirmation link to <span className="text-white">{email}</span>. Follow it, then
              sign in.
            </p>
            <Link href="/login" className="mt-6 inline-block text-sm text-signal hover:underline">
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-white">Create an account</h1>
            <p className="mt-1 text-sm text-ink2">Set up your broadcast console.</p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                />
              </div>
              <div>
                <Label>Password</Label>
                <Input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                />
              </div>

              {error && <p className="text-xs text-danger">{error}</p>}

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Creating account..." : "Create account"}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-ink2">
              Already have an account?{" "}
              <Link href="/login" className="text-signal hover:underline">
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
