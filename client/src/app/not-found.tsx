import Link from "next/link";

/** Global 404 for unknown App Router paths. */
export default function NotFound() {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        minHeight: "60vh",
        padding: 24,
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
        Page not found
      </h1>
      <p style={{ fontSize: 14, margin: 0, color: "var(--text-secondary)", maxWidth: 360 }}>
        That route does not exist in the studio. Pick a repo, open Agents, or go home.
      </p>
      <Link
        href="/"
        style={{
          marginTop: 8,
          fontSize: 14,
          fontWeight: 600,
          color: "var(--accent)",
          textDecoration: "none",
        }}
      >
        Back to home
      </Link>
    </main>
  );
}
