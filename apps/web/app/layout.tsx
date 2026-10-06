import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AlinaMatrix Enterprise",
  description: "Turn complex evidence into auditable professional artifacts.",
};

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/projects", label: "Projects" },
  { href: "/sources", label: "Sources" },
  { href: "/claims", label: "Claims" },
  { href: "/review", label: "Review" },
];

function NavBar() {
  return (
    <nav
      style={{
        display: "flex",
        gap: "1.25rem",
        padding: "0.75rem 1.5rem",
        borderBottom: "1px solid #1e293b",
        background: "#0a0a0f",
        alignItems: "center",
      }}
    >
      <span style={{ fontWeight: 700, fontSize: "0.875rem", color: "#7c5cd8", letterSpacing: "0.05em" }}>
        AlinaMatrix
      </span>
      {NAV_ITEMS.map((item) => (
        <a
          key={item.href}
          href={item.href}
          style={{
            color: "#94a3b8",
            textDecoration: "none",
            fontSize: "0.8125rem",
            fontWeight: 500,
          }}
        >
          {item.label}
        </a>
      ))}
      <span
        style={{
          marginLeft: "auto",
          fontSize: "0.625rem",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#7c5cd8",
          border: "1px solid #7c5cd8",
          padding: "0.15rem 0.5rem",
          borderRadius: "2px",
        }}
      >
        Enterprise Candidate — Active Development
      </span>
    </nav>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#0a0a0f", color: "#e2e8f0" }}>
        <NavBar />
        {children}
      </body>
    </html>
  );
}
