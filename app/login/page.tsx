"use client";

import { Suspense, useState } from "react";
import { BellRing, Eye, EyeOff } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input, Label } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

const DEFAULT_EMAIL = process.env.NEXT_PUBLIC_EMAIL ?? process.env.EMAIL ?? "";
const DEFAULT_PASSWORD = process.env.NEXT_PUBLIC_PASSWORD ?? process.env.PASSWORD ?? "";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm defaultEmail={DEFAULT_EMAIL} defaultPassword={DEFAULT_PASSWORD} />
    </Suspense>
  );
}

function LoginForm({ defaultEmail, defaultPassword }: { defaultEmail: string; defaultPassword: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState(defaultPassword);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push(searchParams.get("next") || "/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b1422] px-4 py-6 text-white">
      <div className="w-full max-w-[360px]">
        <div className="flex items-center justify-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f2c678] shadow-[0_0_20px_rgba(242,198,120,0.28)]">
            <BellRing size={18} className="text-[#0f172a]" />
          </div>
          <span className="text-[1.7rem] font-semibold tracking-tight text-white">FCM Broadcast</span>
        </div>

        <p className="mt-5 text-center text-sm text-slate-200">
          Broadcast to every app you manage, from one place.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="h-12 rounded-xl border border-slate-500 bg-[#111c2a] px-3 text-base text-white placeholder:text-slate-300/70"
            />
          </div>

          <div>
            <Label>Password</Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-12 rounded-xl border border-slate-500 bg-[#111c2a] px-3 pr-10 text-base text-white placeholder:text-slate-300/70"
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 transition hover:text-white"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <Button type="submit" disabled={loading} className="mt-1 h-11 w-full rounded-xl bg-[#f2c678] text-sm font-medium text-[#0f172a] hover:bg-[#f7d489]">
            {loading ? "Signing in..." : "Login"}
          </Button>
        </form>
      </div>
    </div>
  );
}
