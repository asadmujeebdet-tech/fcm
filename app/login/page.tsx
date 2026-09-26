"use client";

import { Suspense, useState } from "react";
import { BellRing, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input, Label } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

const DEFAULT_EMAIL = process.env.NEXT_PUBLIC_EMAIL ?? process.env.EMAIL ?? "";
const DEFAULT_PASSWORD = process.env.NEXT_PUBLIC_PASSWORD ?? process.env.PASSWORD ?? "";
const WHATSAPP_ICON = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS90_MbyAab03ginKOTiuz932RR0tJmH-J7KzSxk65CQ&s=10";

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
    <main className="login-preview-page">
      <section className="login-preview-shell">
        <div className="login-form-panel">
          <div className="login-form-inner">
            <div className="login-brand">
              <div className="login-brand-icon">
                <BellRing size={17} />
              </div>
              <span>FCM Broadcast</span>
            </div>

            <div className="login-copy">
              <span className="login-kicker">FCM WORKSPACE</span>
              <h1>Welcome back</h1>
              <p>Broadcast to every app you manage, from one place.</p>
            </div>

            <form onSubmit={handleSubmit} className="login-fields">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="login-input"
                />
              </div>

              <div>
                <Label>Password</Label>
                <div className="login-password-wrap">
                  <Input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="login-input"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="login-eye"
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              {error && <p className="login-error">{error}</p>}

              <Button type="submit" disabled={loading} className="login-button">
                {loading ? "Signing in..." : "Login"}
              </Button>
            </form>

            <div className="login-secure">
              <LockKeyhole size={15} />
              <span>Secure authentication</span>
            </div>
          </div>
        </div>

        <div className="login-phone-panel">
          <div className="phone-stage">
            <div className="phone">
              <div className="phone-screen">
                <div className="phone-status">
                  <span>9:41</span>
                  <div className="dynamic-island"><i /></div>
                  <div className="status-icons">
                    <b>▮▮▮</b><span>⌁</span><em />
                  </div>
                </div>

                <div className="lock-date">Tue, 23 Sep</div>
                <div className="lock-time">9:41</div>

                <div className="notification-card">
                  <div className="notification-text">
                    <div className="notification-title">
                      <strong>+16024590820</strong>
                      <span> · WhatsApp · Now</span>
                    </div>
                    <div className="notification-body">
                      <div>🎤 Voice message (00:10)</div>
                      <div>🎤 Voice message (00:20)</div>
                    </div>
                  </div>
                  <img src={WHATSAPP_ICON} alt="WhatsApp" className="whatsapp-icon" />
                </div>

                <div className="lock-shortcuts">
                  <span>▮</span>
                  <span>●</span>
                </div>
                <div className="home-indicator" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
