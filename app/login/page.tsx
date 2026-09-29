"use client";

import { Suspense, useState } from "react";
import { BellRing, Eye, EyeOff } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input, Label } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

const DEFAULT_EMAIL = process.env.NEXT_PUBLIC_EMAIL ?? "";
// SECURITY: never prefill the password. NEXT_PUBLIC_* values are compiled into
// the browser bundle, and /login is public, so anyone could read it.
const WHATSAPP_ICON =
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS90_MbyAab03ginKOTiuz932RRf0tJmH-J7KzSxk65CQ&s=10";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm defaultEmail={DEFAULT_EMAIL} />
    </Suspense>
  );
}

function LoginForm({ defaultEmail }: { defaultEmail: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Invalid email or password.");
        setLoading(false);
        return;
      }

      window.location.assign(searchParams.get("next") || "/dashboard");
    } catch {
      setError("Unable to sign in. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="login-preview-page">
      <section className="login-preview-shell">
        <div className="login-form-panel">
          <div className="login-form-inner">
            <div className="login-brand">
              <div className="login-brand-icon"><BellRing size={17} /></div>
              <span>FCM Broadcast</span>
            </div>
            <div className="login-copy">
              <h1>Welcome back</h1>
              <p>Broadcast to every app you manage, from one place.</p>
            </div>
            <form onSubmit={handleSubmit} className="login-fields">
              <div>
                <Label>Email</Label>
                <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="login-input" />
              </div>
              <div>
                <Label>Password</Label>
                <div className="login-password-wrap">
                  <Input type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="login-input" />
                  <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((prev) => !prev)} className="login-eye">
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>
              {error && <p className="login-error">{error}</p>}
              <Button type="submit" disabled={loading} className="login-button">
                {loading ? "Signing in..." : "Login"}
              </Button>
            </form>
          </div>
        </div>
        <div className="login-phone-panel">
          <div className="phone-stage">
            <div className="phone">
              <div className="phone-screen">
                <div className="phone-status"><span>9:41</span><div className="dynamic-island"><i /></div><div className="status-icons"><b>▮▮▮</b><span>⌁</span><em /></div></div>
                <div className="lock-date">Tue, 23 Sep</div>
                <div className="lock-time">9:41</div>
                <div className="notification-card">
                  <div className="notification-text">
                    <div className="notification-title"><strong>+16024590820</strong><span> · WhatsApp · Now</span></div>
                    <div className="notification-body"><div>🎤 Voice message (00:10)</div><div>🎤 Voice message (00:20)</div></div>
                  </div>
                  <div className="whatsapp-icon-wrap">
                    <img src={WHATSAPP_ICON} alt="WhatsApp" className="whatsapp-icon" onError={(event) => { event.currentTarget.style.display = "none"; event.currentTarget.parentElement?.classList.add("whatsapp-fallback"); }} />
                    <svg className="whatsapp-fallback-icon" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="23" fill="#25D366" /><path fill="#fff" d="M34.8 28.2c-.5-.3-3-1.5-3.5 1.7-.5-.2-.8-.3-1.1.3-.3.5-1.2 1.7-1.4 2-.3.3-.5.4-1 .1-2.7-1.3-4.4-2.4-6.2-5.4-.5-.9.5-.8 1.5-2.6.2-.4.1-.7-.1-1-.1-.3-1.1-2.6-1.5-3.6-.4-.9-.8-.8-1.1-.8h-.9c-.3 0-.8.1-1.2.5-.4.4-1.6 1.6-1.6 3.9s1.6 4.5 1.8 4.8c.2.3 3.1 4.8 7.5 6.7 2.8 1.2 3.9 1.3 5.3 1.1.9-.1 3-1.2 3.4-2.3.4-1.1.4-2 .3-2.3-.2-.2-.5-.3-.9-.5Z" /></svg>
                  </div>
                </div>
                <div className="lock-shortcuts"><span>▮</span><span>●</span></div>
                <div className="home-indicator" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
