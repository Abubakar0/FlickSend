import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectionCoordinator, type ConnectionSnapshot } from "../src/index.js";

class TestWebSocket {
  static readonly OPEN = 1;
  static readonly instances: TestWebSocket[] = [];
  readonly readyState = TestWebSocket.OPEN;
  readonly url: string;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onopen: (() => void) | null = null;

  constructor(url: URL | string) {
    this.url = String(url);
    TestWebSocket.instances.push(this);
  }

  close(): void {
    this.onclose?.();
  }

  send(): void {}
}

afterEach(() => {
  TestWebSocket.instances.length = 0;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("P12 signaling admission", () => {
  it("keeps the active transfer identity when an authorized signaling socket reconnects", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", TestWebSocket);
    const coordinator = new ConnectionCoordinator("wss://signal.example.test");
    const accessToken = `fsst1.${"a".repeat(32)}.${"b".repeat(43)}`;
    let observed: ConnectionSnapshot | null = null;
    coordinator.subscribe((snapshot) => {
      observed = snapshot;
    });

    await coordinator.joinAuthorizedSignallingSession({
      accessToken,
      expiresAtMs: Date.now() + 60_000
    });
    const firstSocket = TestWebSocket.instances[0]!;
    const existing = observed!;
    (coordinator as unknown as { snapshot: typeof existing }).snapshot = {
      ...existing,
      transfer: { ...existing.transfer, state: "SENDING", transferId: "fs_tr_existing" }
    };

    firstSocket.close();
    await vi.advanceTimersByTimeAsync(500);

    expect(TestWebSocket.instances).toHaveLength(2);
    expect(TestWebSocket.instances[1]!.url).toContain(`/v2/session?cap=${accessToken}`);
    expect(observed).toMatchObject({
      sessionCode: null,
      transfer: { transferId: "fs_tr_existing" }
    });
  });
});
