import { describe, expect, it } from "vitest";
import { waitForDataChannelBufferedAmountLow } from "../src/index.js";

class BufferedAmountChannelRace {
  bufferedAmount = 1_024;
  bufferedAmountLowThreshold = 0;
  readyState: RTCDataChannelState = "open";
  private listener?: EventListenerOrEventListenerObject;

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    void options;
    if (type !== "bufferedamountlow") return;
    this.listener = listener;
    // Simulate the drain that occurred just before listener registration completed.
    this.bufferedAmount = 128;
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === "bufferedamountlow" && this.listener === listener) this.listener = undefined;
  }
}

class BufferedAmountChannelWithoutEvent {
  bufferedAmount = 1_024;
  bufferedAmountLowThreshold = 0;
  readyState: RTCDataChannelState = "open";

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    void listener;
    void options;
    if (type !== "bufferedamountlow") return;
    setTimeout(() => {
      this.bufferedAmount = 128;
    }, 0);
  }
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    void type;
    void listener;
  }
}

describe("waitForDataChannelBufferedAmountLow", () => {
  it("does not stall when the buffer drains during listener registration", async () => {
    const channel = new BufferedAmountChannelRace();

    await expect(
      waitForDataChannelBufferedAmountLow(channel, 1_024, 256)
    ).resolves.toBeGreaterThanOrEqual(0);
    expect(channel.bufferedAmountLowThreshold).toBe(256);
  });

  it("uses the bounded low-water poll when a browser does not dispatch the drain event", async () => {
    const channel = new BufferedAmountChannelWithoutEvent();

    await expect(
      waitForDataChannelBufferedAmountLow(channel, 1_024, 256)
    ).resolves.toBeGreaterThanOrEqual(0);
  });
});
