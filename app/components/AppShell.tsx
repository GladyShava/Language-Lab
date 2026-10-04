"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { PRODUCT_DESCRIPTOR, TEMPORARY_PRODUCT_NAME } from "../../lib/brand";

const navItems = [
  { href: "/about", label: "About", icon: "i" },
  { href: "/resources", label: "Resources", icon: "□" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLandingPage = pathname === "/";
  const isResourcesPage = pathname.startsWith("/resources");
  const hideFooter = isLandingPage || isResourcesPage || pathname === "/about" || pathname === "/practice";
  return (
    <div className="app-frame">
      <div className="brand-bar" />
      <header className="site-header">
        <Link href="/" className={`brand-lockup${isLandingPage ? " landing-brand-lockup" : ""}`} aria-label={`${TEMPORARY_PRODUCT_NAME} home`}>
          <span className="product-brand">
            <img className="product-mark" src="/icons/beyond-hello-mark.png" alt="" aria-hidden="true" />
            <span className="brand-name">{TEMPORARY_PRODUCT_NAME}<small>{PRODUCT_DESCRIPTOR}</small></span>
          </span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return <Link key={item.href} className={active ? "active" : ""} href={item.href}><span className="nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span></Link>;
          })}
        </nav>
      </header>
      {children}
      {!hideFooter && <footer className="site-footer">
        <p className="footer-brand">{TEMPORARY_PRODUCT_NAME}<small>{PRODUCT_DESCRIPTOR}</small></p>
        <div className="footer-disclaimer">
          <span>Practice disclaimer</span>
          <p>This is a practice tool. It does not provide an official assessment, certification, pass/fail result, or readiness decision.</p>
        </div>
      </footer>}
    </div>
  );
}
