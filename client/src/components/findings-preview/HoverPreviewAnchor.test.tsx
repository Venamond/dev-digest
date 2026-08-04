import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { HoverPreviewAnchor } from "./HoverPreviewAnchor";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

function renderAnchor() {
  return render(
    <HoverPreviewAnchor content={<div>Popover content</div>}>
      <span>Trigger</span>
    </HoverPreviewAnchor>,
  );
}

describe("HoverPreviewAnchor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("does not render the popover before hover", () => {
    renderAnchor();
    expect(screen.queryByText("Popover content")).not.toBeInTheDocument();
  });

  it("opens after the hover delay", () => {
    renderAnchor();
    fireEvent.mouseEnter(screen.getByText("Trigger").parentElement!);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByText("Popover content")).toBeInTheDocument();
  });

  it("calls onOpenChange as the popover opens and closes", () => {
    const onOpenChange = vi.fn();
    render(
      <HoverPreviewAnchor content={<div>Popover content</div>} onOpenChange={onOpenChange}>
        <span>Trigger</span>
      </HoverPreviewAnchor>,
    );
    const trigger = screen.getByText("Trigger").parentElement!;
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onOpenChange).toHaveBeenCalledWith(true);

    fireEvent.mouseLeave(trigger);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("places the popover below the trigger when there is more room below", () => {
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);
    vi.spyOn(HTMLDivElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: 100,
      bottom: 120,
      left: 10,
      right: 50,
      width: 40,
      height: 20,
      x: 10,
      y: 100,
      toJSON: () => ({}),
    });
    renderAnchor();
    fireEvent.mouseEnter(screen.getByText("Trigger").parentElement!);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    const popover = screen.getByText("Popover content").parentElement!;
    expect(popover.style.top).toBe("126px"); // rect.bottom(120) + TRIGGER_GAP(6)
    expect(popover.style.bottom).toBe("");
  });

  it("places the popover above the trigger when there is more room above", () => {
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);
    vi.spyOn(HTMLDivElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: 750,
      bottom: 770,
      left: 10,
      right: 50,
      width: 40,
      height: 20,
      x: 10,
      y: 750,
      toJSON: () => ({}),
    });
    renderAnchor();
    fireEvent.mouseEnter(screen.getByText("Trigger").parentElement!);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    const popover = screen.getByText("Popover content").parentElement!;
    expect(popover.style.bottom).toBe("56px"); // innerHeight(800) - rect.top(750) + TRIGGER_GAP(6)
    expect(popover.style.top).toBe("");
  });
});
