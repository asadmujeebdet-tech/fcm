"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, Smartphone, Radio, History, LogOut, BellRing, Menu, Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";

const NAV=[
 {href:"/dashboard",label:"Dashboard",icon:LayoutGrid},
 {href:"/apps",label:"Apps",icon:Smartphone},
 {href:"/compose",label:"Compose",icon:Radio},
 {href:"/history",label:"History",icon:History},
];

export function Sidebar({email}:{email:string}){
 const pathname=usePathname(); const router=useRouter(); const [collapsed,setCollapsed]=useState(false); const {theme,toggleTheme}=useTheme();
 useEffect(()=>{const sync=()=>{if(window.innerWidth<768)setCollapsed(true)};sync();window.addEventListener("resize",sync);return()=>window.removeEventListener("resize",sync)},[]);
 async function handleSignOut(){
  try {
    await fetch("/api/auth/logout",{method:"POST"});
  } finally {
    router.replace("/login");
    router.refresh();
  }
}
 return <aside className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-border bg-surface/95 backdrop-blur-sm transition-[width] duration-200 ${collapsed?"w-16":"w-60"}`}>
   <div className={`flex items-center border-b border-border px-3 py-4 ${collapsed?"justify-center":"justify-between"}`}>
    {!collapsed&&<div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-signal to-sky-500 shadow-lg shadow-signal/20"><BellRing size={16} className="text-slate-950"/></div><div><p className="text-[11px] font-medium uppercase tracking-[0.2em] text-signal">FCM</p><p className="text-[15px] font-semibold tracking-tight text-white">Broadcast</p></div></div>}
    <button onClick={()=>setCollapsed(v=>!v)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink2 hover:bg-surface2 hover:text-white" aria-label={collapsed?"Expand menu":"Collapse menu"}>{collapsed?<Menu size={19}/>:<Menu size={19}/>}</button>
   </div>
   <nav className="flex-1 space-y-1 px-2 py-3">{NAV.map(item=>{const active=pathname===item.href||pathname.startsWith(item.href+"/");const Icon=item.icon;return <Link key={item.href} href={item.href} title={collapsed?item.label:undefined} className={`flex items-center rounded-md border-l-2 py-2.5 text-sm transition-colors ${collapsed?"justify-center px-2":"gap-3 px-3"} ${active?"border-signal bg-surface2 text-white":"border-transparent text-ink2 hover:border-border hover:bg-surface2/60 hover:text-white"}`}><Icon size={17} strokeWidth={2}/>{!collapsed&&item.label}</Link>})}</nav>
   <div className={`border-t border-border py-4 ${collapsed?"px-2":"px-3"}`}>
    {!collapsed&&<p className="truncate px-1 text-xs text-ink2" title={email}>{email}</p>}
    <div className={`mt-3 flex items-center gap-1 rounded-lg border border-border bg-surface2 p-1 ${collapsed?"justify-center":"justify-between"}`}>
      {!collapsed&&<span className="px-2 text-[11px] font-medium text-ink2">{theme === "dark" ? "Dark theme" : "Light theme"}</span>}
      <button type="button" onClick={toggleTheme} title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} className="flex h-8 w-8 items-center justify-center rounded-md text-ink2 transition-colors hover:bg-surface hover:text-white">
        {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
      </button>
    </div>
    <button onClick={handleSignOut} title="Logout" className={`mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-red-600 py-2 text-xs font-medium text-white transition-colors hover:bg-red-500 ${collapsed?"px-0":"px-3"}`}><LogOut size={13}/>{!collapsed&&"Logout"}</button>
   </div>
 </aside>;
}