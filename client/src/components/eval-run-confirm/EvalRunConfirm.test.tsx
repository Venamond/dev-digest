import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import evalMessages from "../../../messages/en/eval.json";
import { EvalRunConfirm } from "./EvalRunConfirm";

afterEach(cleanup);

function renderConfirm(over: Partial<React.ComponentProps<typeof EvalRunConfirm>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <EvalRunConfirm calls={8} label="Security Reviewer" {...{ onConfirm, onCancel }} {...over} />
    </NextIntlClientProvider>,
  );
  return { onConfirm, onCancel };
}

describe("EvalRunConfirm", () => {
  it("states the model-call count and what it runs against", () => {
    renderConfirm();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/8 model calls/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Security Reviewer/)).toBeInTheDocument();
  });

  it("singularises a one-call run", () => {
    renderConfirm({ calls: 1 });
    expect(screen.getByText(/1 model call\b/)).toBeInTheDocument();
  });

  it("does not fire onConfirm until the confirm control is activated", () => {
    const { onConfirm } = renderConfirm();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancels without confirming", () => {
    const { onConfirm, onCancel } = renderConfirm();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
