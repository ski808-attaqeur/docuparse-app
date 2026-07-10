import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "DocuParse — intelligent document extraction",
  description:
    "Upload documents, extract structured data with confidence, verify side-by-side, approve and deliver.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <header
          style={{
            borderBottom: "1px solid var(--border)",
            background: "var(--panel)",
            position: "sticky",
            top: 0,
            zIndex: 50,
          }}
        >
          <div
            style={{
              maxWidth: 1280,
              margin: "0 auto",
              padding: "10px 20px",
              display: "flex",
              alignItems: "center",
              gap: 20,
            }}
          >
            <Link
              href="/"
              style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: "var(--text)" }}
            >
              <span style={{ fontSize: 20 }}>📄</span>
              <strong style={{ fontSize: 16, letterSpacing: "-0.01em" }}>DocuParse</strong>
            </Link>
            <nav style={{ display: "flex", gap: 4, fontSize: 13 }}>
              <NavLink href="/">Library</NavLink>
              <NavLink href="/search">Search &amp; Ask</NavLink>
              <NavLink href="/settings/destinations">Destinations</NavLink>
            </nav>
            <div style={{ marginLeft: "auto" }}>
              <span className="badge">Demo · no login</span>
            </div>
          </div>
        </header>
        <main style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 20px 64px" }}>
          {children}
        </main>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        padding: "6px 10px",
        borderRadius: 8,
        textDecoration: "none",
        color: "var(--muted)",
        fontWeight: 600,
      }}
    >
      {children}
    </Link>
  );
}
