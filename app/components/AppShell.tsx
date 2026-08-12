"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navItems = [
  { href: "/practice", label: "Practice", icon: "●" },
  { href: "/transcript", label: "Replay", icon: "↻" },
  { href: "/shadow", label: "Fluent Example", icon: "◐" },
  { href: "/progress", label: "My Progress", icon: "↗" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="app-frame">
      <div className="brand-bar" />
      <header className="site-header">
        <Link href="/" className="brand-lockup" aria-label="AI OPI Conversation Studio home">
          <span className="brand-tile">OPI</span>
          <span className="brand-name">Conversation Studio<small>AI-guided practice</small></span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return <Link key={item.href} className={active ? "active" : ""} href={item.href}><span className="nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span></Link>;
          })}
        </nav>
        <div className="header-action"><Link className="header-cta" href="/practice">Start practice</Link></div>
      </header>
      {children}
      <footer className="site-footer">
        <p className="footer-brand">AI OPI Conversation Studio</p>
        <div className="footer-disclaimer">
          <span>Practice disclaimer</span>
          <p>AI feedback is an unofficial practice estimate. It is not an ACTFL OPI rating, certification, pass/fail result, or readiness decision.</p>
        </div>
      </footer>
    </div>
  );
}
