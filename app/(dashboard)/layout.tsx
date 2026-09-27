import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get(AUTH_COOKIE)?.value;

  if (!(await isValidAuthToken(token))) {
    redirect("/login");
  }

  const email = process.env.NEXT_PUBLIC_EMAIL ?? "";

  return (
    <div className="flex min-h-screen bg-ink">
      <Sidebar email={email} />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
