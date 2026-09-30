// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { ctrlWheelZoom as createWheelZoom } from "./readerChrome";

/** Adapts the tracker to a callback, as the readers use it. */
function ctrlWheelZoom(zoom: (dir: 1 | -1) => void) {
  const track = createWheelZoom();
  return (e: WheelEvent) => {
    const dir = track(e);
    if (dir) zoom(dir);
  };
}

function wheel(deltaY: number, init: WheelEventInit = {}) {
  return new WheelEvent("wheel", { deltaY, ctrlKey: true, cancelable: true, ...init });
}

describe("ctrlWheelZoom", () => {
  it("zooms in on wheel up and out on wheel down, cancelling the event", () => {
    const zoom = vi.fn();
    const onWheel = ctrlWheelZoom(zoom);
    const up = wheel(-100);
    onWheel(up);
    onWheel(wheel(100));
    expect(zoom.mock.calls).toEqual([[1], [-1]]);
    expect(up.defaultPrevented).toBe(true);
  });

  it("ignores the wheel without Ctrl", () => {
    const zoom = vi.fn();
    const event = wheel(-100, { ctrlKey: false });
    ctrlWheelZoom(zoom)(event);
    expect(zoom).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("adds up small touchpad deltas and steps once per event", () => {
    const zoom = vi.fn();
    const onWheel = ctrlWheelZoom(zoom);
    for (let i = 0; i < 4; i++) onWheel(wheel(-20));
    expect(zoom.mock.calls).toEqual([[1]]);
    onWheel(wheel(-1000));
    expect(zoom).toHaveBeenCalledTimes(2);
  });

  it("starts over when the direction changes", () => {
    const zoom = vi.fn();
    const onWheel = ctrlWheelZoom(zoom);
    onWheel(wheel(-40));
    onWheel(wheel(40));
    expect(zoom).not.toHaveBeenCalled();
  });

  it("scales line-based deltas", () => {
    const zoom = vi.fn();
    ctrlWheelZoom(zoom)(wheel(3, { deltaMode: WheelEvent.DOM_DELTA_LINE }));
    expect(zoom.mock.calls).toEqual([[-1]]);
  });
});
