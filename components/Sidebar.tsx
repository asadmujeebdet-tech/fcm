"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Smartphone, Radio, History, LogOut, BellRing } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/apps", label: "Apps", icon: Smartphone },
  { href: "/compose", label: "Compose", icon: Radio },
  { href: "/history", label: "History", icon: History },
];

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-border bg-surface/95 backdrop-blur-sm">
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-signal to-sky-500 shadow-lg shadow-signal/20">
          <BellRing size={16} className="text-slate-950" />
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-signal">FCM</p>
          <p className="text-[15px] font-semibold tracking-tight text-white">Broadcast</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md border-l-2 px-3 py-2.5 text-sm transition-colors ${
                active
                  ? "border-signal bg-surface2 text-white"
                  : "border-transparent text-ink2 hover:border-border hover:bg-surface2/60 hover:text-white"
              }`}
            >
              <Icon size={16} strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-4 py-4">
        <p className="truncate text-xs text-ink2" title={email}>
          {email}
        </p>
        <button
          onClick={handleSignOut}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-red-500"
        >
          <LogOut size={13} />
          Logout
        </button>
      </div>
    </aside>
  );
}
