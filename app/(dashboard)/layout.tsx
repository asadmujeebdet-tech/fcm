import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";

export default async function DashboardLayout({children}:{children:React.ReactNode}){
 const token=cookies().get(AUTH_COOKIE)?.value;
 if(!(await isValidAuthToken(token)))redirect("/login");
 const email=process.env.NEXT_PUBLIC_EMAIL??process.env.EMAIL??"";
 return <div className="flex min-h-screen bg-ink text-white transition-colors duration-200"><Sidebar email={email}/><main className="min-w-0 flex-1 overflow-y-auto bg-ink"><div className="w-full px-4 py-5 sm:px-6 sm:py-7 lg:px-8">{children}</div></main></div>;
}