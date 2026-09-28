import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounce } from "./debounce";

describe("debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("calls once with the latest arguments", () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d(1);
    d(2);
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledExactlyOnceWith(2);
  });

  it("flushes pending calls immediately", () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d("a");
    d.flush();
    expect(fn).toHaveBeenCalledExactlyOnceWith("a");
    d.flush();
    expect(fn).toHaveBeenCalledOnce();
  });

  it("cancels pending calls", () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d("a");
    d.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });
});
