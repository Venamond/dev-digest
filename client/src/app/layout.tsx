import type { Metadata } from "next";
import { Suspense } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { Providers } from "../lib/providers";
import { themeNoFlashScript } from "../lib/theme";

export const metadata: Metadata = {
  title: "DevDigest",
  description: "Local-first AI PR review tool",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  // One timestamp for this request — NextIntlClientProvider otherwise calls
  // `new Date()` independently on the server and the client, which shows up
  // as a hydration mismatch on IntlProvider's `now` prop.
  const now = new Date();
  return (
    // suppressHydrationWarning: browser extensions (Grammarly, translators, …)
    // inject attributes onto <html>/<body> before React hydrates. This
    // suppresses ONLY this element's own attribute mismatch (one level deep).
    <html lang={locale} data-theme="dark" data-density="regular" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {/* Do not add a manual <head>: the Metadata API owns it. A handwritten
            <head> makes Next emit <meta charset> into <body>, which then hydrates
            as a mismatch against the root <Suspense> (client expects Suspense,
            server HTML has the charset meta).

            This MUST stay a plain <script>, not next/script. In the App Router
            `beforeInteractive` does NOT land in <head>: Next rewrites it into a
            `self.__next_s` push that `app-bootstrap.js` only evaluates once the
            async `main-app` chunk has loaded — i.e. after first paint, which
            reinstates the very FOUC this script exists to prevent. A plain
            inline <script> as a <body> child is emitted synchronously in the
            streamed HTML and runs before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: themeNoFlashScript }} />
        <NextIntlClientProvider locale={locale} messages={messages} now={now}>
          <Suspense fallback={null}>
            <Providers>{children}</Providers>
          </Suspense>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
