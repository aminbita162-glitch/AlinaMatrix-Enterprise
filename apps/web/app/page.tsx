export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        gap: "1.5rem",
        textAlign: "center",
      }}
    >
      {/* Status line — exact per DIRECTIVE */}
      <p
        style={{
          fontSize: "0.75rem",
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          color: "#7c5cd8",
          margin: 0,
          border: "1px solid #7c5cd8",
          padding: "0.25rem 0.75rem",
          borderRadius: "2px",
        }}
      >
        Enterprise Candidate &mdash; Active Development
      </p>

      <h1
        style={{
          fontSize: "clamp(1.75rem, 4vw, 3rem)",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          margin: 0,
          color: "#f1f5f9",
        }}
      >
        AlinaMatrix Enterprise
      </h1>

      {/* Positioning sentence — exact per DIRECTIVE */}
      <p
        style={{
          fontSize: "1.125rem",
          color: "#94a3b8",
          maxWidth: "560px",
          margin: 0,
          lineHeight: 1.6,
        }}
      >
        Turn complex evidence into auditable professional artifacts.
      </p>
    </main>
  );
}
