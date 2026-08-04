import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import homeMessages from "../../../../messages/en/home.json";

const replace = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const useRepos = vi.fn();
vi.mock("@/lib/hooks", () => ({
  useRepos: () => useRepos(),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/page-shell", () => ({
  PageContainer: ({
    title,
    subtitle,
    children,
  }: {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      {children}
    </div>
  ),
}));

import { HomeRedirectView } from "./HomeRedirectView";

afterEach(() => {
  cleanup();
  replace.mockReset();
  push.mockReset();
});

function renderHome() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ home: homeMessages }}>
      <HomeRedirectView />
    </NextIntlClientProvider>,
  );
}

describe("HomeRedirectView", () => {
  beforeEach(() => {
    useRepos.mockReturnValue({ data: undefined, isLoading: true, isError: false });
  });

  it("shows the welcome empty state when there are no repos", () => {
    useRepos.mockReturnValue({ data: [], isLoading: false, isError: false });
    renderHome();
    expect(screen.getByText("No repositories yet")).toBeInTheDocument();
    expect(screen.getByText("Add repository")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects to the first repo's pull list when repos exist", () => {
    useRepos.mockReturnValue({
      data: [{ id: "r1", full_name: "acme/app" }],
      isLoading: false,
      isError: false,
    });
    renderHome();
    expect(replace).toHaveBeenCalledWith("/repos/r1/pulls");
  });
});
