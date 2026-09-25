'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect,useState,type ReactNode } from 'react';
import Icon,{type IconName} from '@/components/Icon';

const nav=[['Overview','/dashboard','overview'],['Firebase apps','/dashboard/apps','apps'],['Messages','/dashboard/messages','message'],['History','/dashboard/history','history'],['Analytics','/dashboard/analytics','analytics'],['Settings','/dashboard/settings','settings']];
type Theme='light'|'dark';
export default function DashboardLayout({children}:{children:ReactNode}){
  const pathname=usePathname();const [open,setOpen]=useState(false);const [healthy,setHealthy]=useState<boolean|null>(null);const [theme,setTheme]=useState<Theme>('light');
  useEffect(()=>{fetch('/api/health').then(response=>setHealthy(response.ok)).catch(()=>setHealthy(false));const saved=localStorage.getItem('orbit-theme');if(saved==='dark'||saved==='light')setTheme(saved)},[]);
  useEffect(()=>{document.documentElement.dataset.theme=theme},[theme]);
  function toggleTheme(){const next:Theme=theme==='light'?'dark':'light';setTheme(next);localStorage.setItem('orbit-theme',next)}
  return <div className={'saas-shell '+(open?'menu-open':'')} data-theme={theme}>
    <aside className={'sidebar '+(open?'sidebar-open':'')}>
      <Link href="/dashboard" className="brand"><span className="brand-symbol"></span><span>orbit<span className="brand-period">.</span></span></Link>
      <div className="workspace-card"><span className="workspace-avatar">F</span><span><b>FCM Workspace</b><small>Local workspace</small></span><span className="workspace-chevron"></span></div>
      <div className="side-caption">WORKSPACE</div>
      <nav className="side-nav">{nav.map(([label,href,icon])=><Link onClick={()=>setOpen(false)} key={href} href={href} className={'side-link '+(pathname===href||(href!=='/dashboard'&&pathname.startsWith(href))?'active':'')}><span className="side-icon"><Icon name={icon as IconName}/></span><span>{label}</span>{label==='Messages'&&<span className="side-shortcut"> M</span>}</Link>)}</nav>
      <div className="sidebar-bottom"><div className="storage-badge"><span className="status-pulse"/><span><b>Storage encrypted</b><small>Local files  AES-256</small></span></div><div className="profile-row"><div className="profile-avatar">A</div><div><b>Admin</b><small>Internal workspace</small></div><span className="more-dots"></span></div></div>
    </aside>
    <div className="main-area"><header className="topbar"><button className="mobile-menu" onClick={()=>setOpen(!open)} aria-label="Toggle navigation"></button><div className="crumb">Workspace <span>/</span> <b>{nav.find(([,href])=>href==='/dashboard'?pathname==='/dashboard':pathname.startsWith(href))?.[0]||'Overview'}</b></div><div className="top-right"><span className={'system-status '+(healthy===false?'system-down':'')}><i/> {healthy===null?'Checking system':healthy?'System operational':'System needs attention'}</span><span className="top-divider"/><button className="top-round theme-toggle" onClick={toggleTheme} title={theme==='light'?'Switch to dark theme':'Switch to light theme'} aria-label={theme==='light'?'Switch to dark theme':'Switch to light theme'}><Icon name={theme==='light'?'moon':'sun'}/></button><button className="top-round" title="Help">?</button><div className="top-avatar">A</div></div></header><main className="page-content">{children}</main></div>
  </div>
}
