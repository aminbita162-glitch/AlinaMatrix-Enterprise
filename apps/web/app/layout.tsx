import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AlinaMatrix Enterprise",
  description: "Turn complex evidence into auditable professional artifacts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#0a0a0f", color: "#e2e8f0" }}>
        {children}
      </body>
    </html>
  );
}
