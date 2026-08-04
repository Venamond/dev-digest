import Link from "next/link";
import { getTranslations } from "next-intl/server";

/** Global 404 for unknown App Router paths. */
export default async function NotFound() {
  const t = await getTranslations("common");
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
        {t("errors.notFoundTitle")}
      </h1>
      <p style={{ fontSize: 14, margin: 0, color: "var(--text-secondary)", maxWidth: 360 }}>
        {t("errors.notFoundBody")}
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
        {t("errors.notFoundCta")}
      </Link>
    </main>
  );
}
