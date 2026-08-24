"use client";

import React from "react";
import { useRouter } from "next/navigation";
import type { LinkLike } from "@devdigest/ui";

/**
 * In-app navigation for the shell chrome. Renders a focusable span instead of
 * `<a href>`, so the browser status bar does not flash the destination URL on
 * hover (sidebar / crumbs / logo). Prefetches on hover for snappy transitions.
 */
export const ShellLink: LinkLike = ({ href, children, style, onClick, className }) => {
  const router = useRouter();
  const go = React.useCallback(() => {
    onClick?.();
    router.push(href);
  }, [href, onClick, router]);

  return (
    <span
      role="link"
      tabIndex={0}
      className={className}
      style={{ color: "inherit", textDecoration: "none", cursor: "pointer", ...style }}
      onClick={go}
      onMouseEnter={() => router.prefetch(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          go();
        }
      }}
    >
      {children}
    </span>
  );
};
