import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalCaseSeed, FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import evalMessages from "../../../../../../../../messages/en/eval.json";
import { FindingCard } from "./FindingCard";

Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

const POSITIVE_SEED: EvalCaseSeed = {
  owner_id: "ag1",
  name: "must-find-hardcoded-stripe-secret-key",
  expectation: "must_find",
  assertion: 'MUST find "Hardcoded Stripe secret key" at src/config.ts:11',
  input_diff: "--- a/src/config.ts\n+++ b/src/config.ts\n",
  input_files: null,
  input_meta: null,
  expected_output: [{ title: "Hardcoded Stripe secret key" }],
  seeded_from: { finding_id: "f1", disposition: "open" },
  existing_case_id: null,
};

const NEGATIVE_SEED: EvalCaseSeed = {
  ...POSITIVE_SEED,
  name: "no-hardcoded-stripe-secret-key",
  expectation: "must_not_flag",
  assertion: "MUST NOT comment on src/config.ts:11 (Hardcoded Stripe secret key)",
  expected_output: [],
  seeded_from: { finding_id: "f1", disposition: "dismissed" },
};

/* The seed URL is new on a component this test already mounts — the stub's URL
   chain has to answer it here, or the catch-all `{}` reaches the render. */
function stubFetch(seed: EvalCaseSeed = POSITIVE_SEED) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("/eval-seed") ? seed : {};
      return { ok: true, status: 200, json: async () => body };
    }),
  );
}

beforeEach(() => stubFetch());

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages, eval: evalMessages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
      // category label is shown alongside the severity badge
      expect(screen.getByText("security")).toBeInTheDocument();
    });
  });

  it("fires accept/dismiss actions", () => {
    const onAction = vi.fn();
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });
});

describe("FindingCard — targeted arrival", () => {
  it("expands and scrolls when targeted even if defaultExpanded is omitted", () => {
    renderWithIntl(<FindingCard f={FINDING} targeted onAction={() => {}} />);
    expect(
      screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "A live Stripe key is committed in source."),
    ).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("stays collapsed and does not scroll when targeted is absent", () => {
    renderWithIntl(<FindingCard f={FINDING} onAction={() => {}} />);
    expect(
      screen.queryByText((_, el) => el?.tagName === "P" && el.textContent === "A live Stripe key is committed in source."),
    ).not.toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("FindingCard — the five-action row (AC-1, AC-52, AC-60)", () => {
  it("renders the mockup's five actions in order", () => {
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={() => {}} />);
    const row = screen.getByTestId("finding-actions");
    expect(within(row).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Accept",
      "Dismiss",
      "Learn",
      "Turn into eval case",
      "Reply to author",
    ]);
  });

  it("draws Learn and Reply to author disabled with a stated reason", () => {
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={() => {}} />);
    for (const label of ["Learn", "Reply to author"]) {
      const b = screen.getByRole("button", { name: label });
      expect(b).toBeDisabled();
      expect(b.getAttribute("title")).toBeTruthy();
    }
  });

  /* `active` is inert for `secondary` and `ghost` in the vendored Button
     (only `tertiary` reads it), so the disposition has to change the KIND or
     nothing moves on screen — which is what the user reported. Assert the two
     buttons' rendered backgrounds differ once a decision exists; asserting
     they merely render passes in every state and proves nothing. */
  it("shows on the buttons which disposition was chosen", () => {
    const bg = (name: string) =>
      (screen.getByRole("button", { name }) as HTMLElement).style.background;

    const colourOf = (name: string) =>
      (screen.getByRole("button", { name }) as HTMLElement).style.color;

    const { rerender } = renderWithIntl(
      <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />,
    );
    // Undecided: neither is marked as chosen. Their weights differ by design —
    // Accept is the mockup's primary action — so the check is the green mark,
    // not equal styling.
    expect(colourOf("Accept")).not.toBe("var(--ok)");
    expect(colourOf("Dismiss")).not.toBe("var(--ok)");
    const neutralAccept = bg("Accept");

    const withIntl = (f: typeof FINDING) => (
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider locale="en" messages={{ prReview: messages, eval: evalMessages }}>
          <FindingCard f={f} defaultExpanded onAction={() => {}} />
        </NextIntlClientProvider>
      </QueryClientProvider>
    );

    rerender(withIntl({ ...FINDING, accepted_at: "2026-08-29T10:00:00.000Z" }));
    expect(colourOf("Accept")).toBe("var(--ok)");
    expect(colourOf("Dismiss")).not.toBe("var(--ok)");
    expect(bg("Accept")).not.toBe(neutralAccept);

    rerender(withIntl({ ...FINDING, dismissed_at: "2026-08-29T10:00:00.000Z" }));
    expect(colourOf("Dismiss")).toBe("var(--ok)");
    expect(colourOf("Accept")).not.toBe("var(--ok)");
  });

  /* The control is gated on a disposition (the reference gates it the same
     way): undecided states WHY it is inert, and only a judged finding names a
     direction. Seeding from an unjudged finding would make unverified model
     output the harness's ground truth. */
  it("is inert until the finding is judged, and says why", () => {
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={() => {}} />);
    const b = screen.getByRole("button", { name: "Turn into eval case" });
    expect(b).toBeDisabled();
    expect(b.getAttribute("title")).toMatch(/Accept or dismiss this finding first/);
  });

  it("names the direction of the case it would create, per disposition", () => {
    const { rerender } = renderWithIntl(
      <FindingCard f={{ ...FINDING, accepted_at: "2026-08-29T10:00:00.000Z" }} defaultExpanded onAction={() => {}} />,
    );
    expect(
      screen.getByRole("button", { name: "Turn into eval case" }).getAttribute("title"),
    ).toMatch(/must find/);

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider locale="en" messages={{ prReview: messages, eval: evalMessages }}>
          <FindingCard
            f={{ ...FINDING, dismissed_at: "2026-08-29T10:00:00.000Z" }}
            defaultExpanded
            onAction={() => {}}
          />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    expect(
      screen.getByRole("button", { name: "Turn into eval case" }).getAttribute("title"),
    ).toMatch(/must NOT comment/);
  });
});

describe("FindingCard — seeding the editor (AC-2, AC-3)", () => {
  it("opens the editor with the negative banner on a dismissed finding", async () => {
    stubFetch(NEGATIVE_SEED);
    renderWithIntl(
      <FindingCard
        f={{ ...FINDING, dismissed_at: "2026-08-29T10:00:00.000Z" }}
        defaultExpanded
        onAction={() => {}}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Turn into eval case" }));
    expect(await screen.findByText("Negative case")).toBeInTheDocument();
    expect(screen.getByText(/MUST NOT comment on src\/config\.ts:11/)).toBeInTheDocument();
  });

  /* The card sets `opacity: 0.6` while the finding is decided and
     `overflow: hidden` always, and `Modal` is `position: fixed` without a
     portal — so a dialog rendered inside the card paints translucent and
     positions against the card. A dismissed finding is exactly the one seeding
     a `must not flag` case, so this is the common path. Assert the dialog is
     NOT a descendant of the card; asserting it merely "is in the document"
     passes in both layouts and proves nothing. */
  it("renders the editor outside the card, so the card's opacity cannot reach it", async () => {
    stubFetch(NEGATIVE_SEED);
    const { container } = renderWithIntl(
      <FindingCard
        f={{ ...FINDING, dismissed_at: "2026-08-29T10:00:00.000Z" }}
        defaultExpanded
        onAction={() => {}}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Turn into eval case" }));
    const dialog = await screen.findByRole("dialog");
    const card = container.querySelector("[data-finding-id]");
    expect(card).not.toBeNull();
    expect(card!.contains(dialog)).toBe(false);
  });

  it("opens the editor with the positive banner on an accepted finding", async () => {
    renderWithIntl(
      <FindingCard f={{ ...FINDING, accepted_at: "2026-08-29T10:00:00.000Z" }} defaultExpanded onAction={() => {}} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Turn into eval case" }));
    expect(await screen.findByText("Positive case")).toBeInTheDocument();
    expect(screen.getByText(/MUST find .Hardcoded Stripe secret key./)).toBeInTheDocument();
  });
});

describe("FindingCard — a finding that already has a case (AC-65, AC-66)", () => {
  const SEEDED = { ...POSITIVE_SEED, existing_case_id: "c1" };

  it("marks the finding and states it before a second case is created", async () => {
    stubFetch(SEEDED);
    renderWithIntl(
      <FindingCard f={{ ...FINDING, accepted_at: "2026-08-29T10:00:00.000Z" }} defaultExpanded onAction={() => {}} />,
    );
    expect(await screen.findByText("eval case")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(screen.getByText(/already has an eval case/)).toBeInTheDocument();
    // The editor only opens once the author says so.
    expect(screen.queryByText("Positive case")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create another" }));
    expect(await screen.findByText("Positive case")).toBeInTheDocument();
  });
});

/* The reference draws an undo beside a chosen Accept; ours had none, and the
   disposition is one-way input to the eval-case seed — a misclick permanently
   fixed whether a finding could seed a `must_find` or a `must_not_flag` case.
   Asserting the button renders is not enough: it must be ABSENT while the
   finding is undecided, or it is just a third always-on control. */
describe("FindingCard — undoing a decision", () => {
  const card = (f: FindingRecord, onAction: (a: string) => void) => (
    <FindingCard f={f} defaultExpanded onAction={onAction as never} />
  );

  it("offers no undo while the finding is undecided", () => {
    renderWithIntl(card(FINDING, () => {}));
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("offers undo once accepted, and sends the undo action", () => {
    const onAction = vi.fn();
    renderWithIntl(card({ ...FINDING, accepted_at: "2026-08-30T10:00:00.000Z" }, onAction));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onAction).toHaveBeenCalledWith("undo");
  });

  it("offers undo once dismissed too", () => {
    const onAction = vi.fn();
    renderWithIntl(card({ ...FINDING, dismissed_at: "2026-08-30T10:00:00.000Z" }, onAction));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onAction).toHaveBeenCalledWith("undo");
  });
});

/* The reference puts the undo BETWEEN Accept and Dismiss, not after both.
   Order is not decoration here: the arrow reads as "undo the decision" only
   while it sits inside the decision pair. Asserting the button exists says
   nothing about where — this compares positions. */
it("places undo between Accept and Dismiss", () => {
  renderWithIntl(
    <FindingCard
      f={{ ...FINDING, accepted_at: "2026-08-30T10:00:00.000Z" }}
      defaultExpanded
      onAction={() => {}}
    />,
  );
  const names = screen
    .getAllByRole("button")
    .map((b) => b.getAttribute("aria-label") ?? b.textContent ?? "");
  expect(names.indexOf("Undo")).toBeGreaterThan(names.findIndex((n) => n.includes("Accept")));
  expect(names.indexOf("Undo")).toBeLessThan(names.findIndex((n) => n.includes("Dismiss")));
});
