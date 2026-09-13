import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, connect } from "node:net";
import { tmpdir, arch, release, type } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const docker = process.platform === "win32" ? "docker.exe" : "docker";
const compose = resolve(root, "services/turn/compose.yaml");
const turnEnvironmentFile = resolve(root, "services/turn/.m9-firefox.env");
const workerEnvironmentFile = resolve(root, "apps/signaling/.dev.vars");
const target = process.env.FLICKSEND_M9_TARGET ?? "m9-firefox-windows";
const executablePath = process.env.FLICKSEND_M9_BROWSER_PATH;
const evidenceDirectory = resolve(
  process.env.FLICKSEND_M9_EVIDENCE_DIR ?? "test-results/m9-evidence"
);

function assertion(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const useCommandProcessor = process.platform === "win32" && command.endsWith(".cmd");
    const child = spawn(
      useCommandProcessor ? (process.env.ComSpec ?? "cmd.exe") : command,
      useCommandProcessor ? ["/d", "/s", "/c", command, ...args] : args,
      { cwd: root, stdio: "inherit", windowsHide: true, ...options }
    );
    child.once("error", reject);
    child.once("exit", (code) => resolvePromise(code ?? 1));
  });
}

function startService(command, args, environment) {
  const useCommandProcessor = process.platform === "win32" && command.endsWith(".cmd");
  return spawn(
    useCommandProcessor ? (process.env.ComSpec ?? "cmd.exe") : command,
    useCommandProcessor ? ["/d", "/s", "/c", command, ...args] : args,
    {
      cwd: root,
      env: environment,
      stdio: "ignore",
      windowsHide: true
    }
  );
}

async function stopService(child) {
  if (!child || child.exitCode !== null) return;
  // `pnpm.cmd` owns wrangler/Next descendants on Windows; terminate the created process tree so a
  // failed qualification cannot cause a later run to bind to stale local services.
  spawnSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
    cwd: root,
    stdio: "ignore",
    windowsHide: true
  });
  await Promise.race([once(child, "exit"), delay(5_000)]);
}

function dockerAvailable() {
  const result = spawnSync(docker, ["version", "--format", "{{.Server.Version}}"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
  return result.status === 0 && result.stdout.trim().length > 0;
}

async function waitForHttp(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The local development service is not ready yet.
    }
    await delay(250);
  }
  throw new Error(`Local service did not become ready: ${url}.`);
}

async function waitForTcpPort(port, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const connected = await new Promise((resolvePromise) => {
      const socket = connect({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.destroy();
        resolvePromise(true);
      });
      socket.once("error", () => resolvePromise(false));
      socket.setTimeout(1_000, () => {
        socket.destroy();
        resolvePromise(false);
      });
    });
    if (connected) return;
    await delay(250);
  }
  throw new Error(`coturn did not accept local connections on port ${port}.`);
}

async function freeTcpPort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  assertion(address && typeof address === "object", "Unable to reserve a Firefox BiDi port.");
  const port = address.port;
  await new Promise((resolvePromise, reject) =>
    server.close((error) => (error ? reject(error) : resolvePromise()))
  );
  return port;
}

class BidiClient {
  #socket;
  #nextId = 0;
  #pending = new Map();

  constructor(url) {
    this.#socket = new WebSocket(url);
    this.opened = new Promise((resolvePromise, reject) => {
      let settled = false;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      };
      const succeed = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolvePromise();
      };
      const timeout = setTimeout(() => {
        this.#socket.close();
        fail(new Error("Firefox BiDi connection timed out."));
      }, 5_000);
      this.#socket.addEventListener("open", succeed, { once: true });
      this.#socket.addEventListener(
        "error",
        () => fail(new Error("Firefox BiDi connection failed.")),
        {
          once: true
        }
      );
    });
    this.#socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (typeof message.id !== "number") return;
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.type === "success") pending.resolve(message.result);
      else pending.reject(new Error(`Firefox BiDi ${message.error ?? "command"} failure.`));
    });
    this.#socket.addEventListener("close", () => {
      for (const pending of this.#pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error("Firefox BiDi connection closed."));
      }
      this.#pending.clear();
    });
  }

  async start() {
    await this.opened;
    return this.call("session.new", { capabilities: { alwaysMatch: {} } });
  }

  call(method, params, timeoutMs = 30_000) {
    return new Promise((resolvePromise, reject) => {
      const id = ++this.#nextId;
      const timeout = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Firefox BiDi ${method} timed out.`));
      }, timeoutMs);
      this.#pending.set(id, { resolve: resolvePromise, reject: reject, timeout });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async createContext() {
    const result = await this.call("browsingContext.create", { type: "tab" });
    return result.context;
  }

  async closeContext(context) {
    try {
      await this.call("browsingContext.close", { context });
    } catch {
      // Firefox closes all temporary contexts when the runner terminates.
    }
  }

  async navigate(context, url) {
    await this.call("browsingContext.navigate", { context, url, wait: "complete" }, 60_000);
  }

  async evaluate(context, expression, userActivation = false) {
    const result = await this.call(
      "script.evaluate",
      {
        expression,
        target: { context },
        awaitPromise: true,
        resultOwnership: "none",
        userActivation
      },
      60_000
    );
    if (result.type !== "success") throw new Error("Firefox page evaluation failed.");
    return result.result?.value ?? null;
  }

  async json(context, expression, userActivation = false) {
    const value = await this.evaluate(context, `JSON.stringify(${expression})`, userActivation);
    return typeof value === "string" ? JSON.parse(value) : value;
  }

  async end() {
    try {
      await this.call("session.end", {}, 5_000);
    } catch {
      // The Firefox process is always terminated by the runner's cleanup path.
    }
    this.#socket.close();
  }
}

async function connectBidi(port) {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const client = new BidiClient(`ws://127.0.0.1:${port}/session`);
      const session = await client.start();
      return { client, session };
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Firefox BiDi did not become ready.");
}

function testSelector(testId) {
  return `[data-testid=${JSON.stringify(testId)}]`;
}

function textExpression(selector) {
  return `document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() ?? null`;
}

async function text(client, context, selector) {
  return client.json(context, textExpression(selector));
}

async function testText(client, context, testId) {
  return text(client, context, testSelector(testId));
}

async function jsonTestValue(client, context, testId) {
  const value = await testText(client, context, testId);
  return typeof value === "string" && value !== "null" ? JSON.parse(value) : null;
}

async function waitFor(client, context, description, predicate, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await client.json(context, predicate)) return;
    await delay(200);
  }
  throw new Error(`Firefox qualification timed out waiting for ${description}.`);
}

async function waitForTestText(client, context, testId, expected, timeoutMs = 60_000) {
  const selector = testSelector(testId);
  await waitFor(
    client,
    context,
    `${testId}=${expected}`,
    `(${textExpression(selector)} ?? "").includes(${JSON.stringify(expected)})`,
    timeoutMs
  );
}

async function clickButton(client, context, name) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const clicked = await client.json(
      context,
      `(() => {
        const button = Array.from(document.querySelectorAll("button")).find(
          (candidate) => candidate.textContent?.trim() === ${JSON.stringify(name)}
        );
        if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
        button.click();
        return true;
      })()`,
      true
    );
    if (clicked === true) return;
    await delay(100);
  }
  throw new Error(`Firefox could not activate ${name}.`);
}

async function setControlValue(client, context, selector, value) {
  const changed = await client.json(
    context,
    `(() => {
      const control = document.querySelector(${JSON.stringify(selector)});
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) return false;
      const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(control, ${JSON.stringify(value)});
      control.dispatchEvent(new Event("input", { bubbles: true }));
      control.dispatchEvent(new Event("change", { bubbles: true }));
      return control.value === ${JSON.stringify(value)};
    })()`
  );
  assertion(changed === true, `Firefox could not set ${selector}.`);
}

async function setFixtureFile(client, context, name, bytes, multiplier) {
  const selected = await client.json(
    context,
    `(() => {
      const input = document.querySelector('input[type="file"]');
      if (!(input instanceof HTMLInputElement)) return false;
      const content = new Uint8Array(${bytes});
      for (let index = 0; index < content.length; index += 1) content[index] = (index * ${multiplier}) % 251;
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File([content], ${JSON.stringify(name)}, { type: "application/octet-stream" }));
      Object.defineProperty(input, "files", { configurable: true, value: dataTransfer.files });
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return input.files?.length === 1;
    })()`
  );
  assertion(selected === true, "Firefox could not select the deterministic fixture file.");
}

async function recovery(client, context) {
  const value = await jsonTestValue(client, context, "m7-recovery-snapshot");
  assertion(value && typeof value === "object", "Firefox recovery snapshot is unavailable.");
  return value;
}

async function health(client, context) {
  const value = await jsonTestValue(client, context, "m8-health-snapshot");
  assertion(value && typeof value === "object", "Firefox health snapshot is unavailable.");
  return value;
}

async function route(client, context) {
  const value = await jsonTestValue(client, context, "m7-route-snapshot");
  assertion(value && typeof value === "object", "Firefox route snapshot is unavailable.");
  return value;
}

async function closePair(client, pair) {
  await Promise.all([client.closeContext(pair.sender), client.closeContext(pair.receiver)]);
}

async function setRoute(client, context, policy, nextPolicy = policy) {
  await setControlValue(client, context, '[aria-label="Route policy"]', policy);
  await setControlValue(client, context, '[aria-label="Next recovery route"]', nextPolicy);
  await setControlValue(client, context, '[aria-label="TURN credential test mode"]', "valid");
  await clickButton(client, context, "Apply Route Policy");
}

async function createPair(client, policy, nextPolicy = policy) {
  const sender = await client.createContext();
  const receiver = await client.createContext();
  try {
    await Promise.all([
      client.navigate(sender, "http://127.0.0.1:3000"),
      client.navigate(receiver, "http://127.0.0.1:3000")
    ]);
    await Promise.all([
      waitForTestText(client, sender, "browser-capability-snapshot", "schemaVersion"),
      waitForTestText(client, receiver, "browser-capability-snapshot", "schemaVersion")
    ]);
    await Promise.all([
      setRoute(client, sender, policy, nextPolicy),
      setRoute(client, receiver, policy, nextPolicy)
    ]);
    await clickButton(client, sender, "Create Session");
    await waitFor(
      client,
      sender,
      "a session code",
      `(/^\\d{3} \\d{3}$/.test(${textExpression(testSelector("session-code"))} ?? ""))`
    );
    const sessionCode = await testText(client, sender, "session-code");
    assertion(typeof sessionCode === "string", "Firefox sender did not create a session code.");
    await setControlValue(client, receiver, 'input[placeholder="482 921"]', sessionCode);
    await clickButton(client, receiver, "Join");
    try {
      await Promise.all([
        waitForTestText(client, sender, "data-state", "open", 30_000),
        waitForTestText(client, receiver, "data-state", "open", 30_000)
      ]);
    } catch {
      const [
        senderState,
        receiverState,
        senderError,
        receiverError,
        senderTrace,
        receiverTrace,
        senderRoute
      ] = await Promise.all([
        testText(client, sender, "connection-state"),
        testText(client, receiver, "connection-state"),
        testText(client, sender, "connection-error"),
        testText(client, receiver, "connection-error"),
        testText(client, sender, "connection-trace"),
        testText(client, receiver, "connection-trace"),
        testText(client, sender, "route")
      ]);
      throw new Error(
        `Firefox DataChannel negotiation failed: ${JSON.stringify({
          senderState,
          receiverState,
          senderError,
          receiverError,
          senderTrace,
          receiverTrace,
          senderRoute
        })}`
      );
    }
    return { sender, receiver };
  } catch (error) {
    await closePair(client, { sender, receiver });
    throw error;
  }
}

async function waitForDelivered(client, pair, timeoutMs = 120_000) {
  await Promise.all([
    waitForTestText(client, pair.sender, "transfer-status", "DELIVERED", timeoutMs),
    waitForTestText(client, pair.receiver, "transfer-status", "DELIVERED", timeoutMs)
  ]);
  const integrity = await testText(client, pair.sender, "m5-integrity-metrics");
  assertion(integrity?.includes("verified"), "Firefox delivered without a verified manifest root.");
}

function normalizedContinuity(snapshot) {
  const continuity = snapshot?.continuity;
  assertion(
    continuity && typeof continuity === "object",
    "Firefox continuity metrics are unavailable."
  );
  assertion(
    continuity.duplicateRetransmittedBytes === 0,
    "Firefox resent committed payload bytes."
  );
  assertion(
    continuity.committedBlocksRetransmitted === 0,
    "Firefox resent committed logical blocks."
  );
  return continuity;
}

async function detectCapabilities(client) {
  const capabilityContext = await client.createContext();
  try {
    await client.navigate(capabilityContext, "http://127.0.0.1:3000");
    await waitForTestText(
      client,
      capabilityContext,
      "browser-capability-snapshot",
      "schemaVersion"
    );
    const capabilities = await jsonTestValue(
      client,
      capabilityContext,
      "browser-capability-snapshot"
    );
    assertion(
      capabilities?.browser === "FIREFOX",
      "Firefox capability detector did not identify Gecko."
    );
    return capabilities;
  } finally {
    await client.closeContext(capabilityContext);
  }
}

async function qualifyCore(client, policy, capabilities) {
  const direct = await createPair(client, policy);
  let singleFile;
  try {
    await setFixtureFile(client, direct.sender, "m9-firefox-direct.bin", 8 * 1024 * 1024, 17);
    await clickButton(client, direct.sender, "Offer File");
    await waitForTestText(client, direct.receiver, "transfer-status", "READY");
    await clickButton(client, direct.receiver, "Accept to OPFS Benchmark Storage");
    await waitForDelivered(client, direct);
    singleFile = {
      delivered: true,
      manifestRootVerified: true,
      route: await testText(client, direct.sender, "route"),
      health: await health(client, direct.sender),
      source: "AUTOMATION_GENERATED_FILE",
      destination: "BOUNDED_OPFS_FIXTURE"
    };
  } finally {
    await closePair(client, direct);
  }

  const resumable = await createPair(client, policy);
  let resume;
  try {
    await setFixtureFile(client, resumable.sender, "m9-firefox-resume.bin", 16 * 1024 * 1024, 31);
    await clickButton(client, resumable.sender, "Offer File");
    await clickButton(client, resumable.receiver, "Accept to OPFS Benchmark Storage");
    await waitForTestText(client, resumable.receiver, "m4-recovery-metrics", "1 / 2", 90_000);
    const before = await recovery(client, resumable.sender);
    await clickButton(client, resumable.sender, "Simulate Transport Disconnect");
    await waitForDelivered(client, resumable);
    const after = await recovery(client, resumable.sender);
    assertion(
      before.transferId === after.transferId,
      "Firefox reconnect changed transfer identity."
    );
    const continuity = normalizedContinuity(after);
    resume = {
      delivered: true,
      transferIdStable: true,
      safeBytesBeforeDisconnect: continuity.safeBytesBeforeDisconnect,
      remainingBytesAtResume: continuity.remainingBytesAtResume,
      resumedPayloadBytes: continuity.resumedPayloadBytes,
      duplicateRetransmittedBytes: continuity.duplicateRetransmittedBytes,
      committedBlocksRetransmitted: continuity.committedBlocksRetransmitted,
      ambiguousInflightBytesRetransmitted: continuity.ambiguousInflightBytesRetransmitted
    };
  } finally {
    await closePair(client, resumable);
  }

  const corrupted = await createPair(client, policy);
  let integrityRetry;
  try {
    await setControlValue(client, corrupted.sender, '[aria-label="Integrity fault"]', "payload");
    await setControlValue(client, corrupted.sender, '[aria-label="Integrity fault block"]', "0");
    await clickButton(client, corrupted.sender, "Apply Integrity Fault");
    await setFixtureFile(
      client,
      corrupted.sender,
      "m9-firefox-corruption.bin",
      8 * 1024 * 1024,
      47
    );
    await clickButton(client, corrupted.sender, "Offer File");
    await clickButton(client, corrupted.receiver, "Accept to OPFS Benchmark Storage");
    await waitForDelivered(client, corrupted);
    const integrity = await testText(client, corrupted.sender, "m5-integrity-metrics");
    assertion(
      integrity?.includes("Integrity retries1"),
      "Firefox did not retry the injected corruption."
    );
    integrityRetry = { delivered: true, retries: 1, manifestRootVerified: true };
  } finally {
    await closePair(client, corrupted);
  }

  const streamPack = await createPair(client, policy);
  let folder;
  try {
    await clickButton(client, streamPack.sender, "Load M6 Structural Fixture");
    await clickButton(client, streamPack.sender, "Offer Folder");
    await waitForTestText(
      client,
      streamPack.receiver,
      "transfer-status",
      "StreamPack folder: READY"
    );
    await clickButton(client, streamPack.receiver, "Accept M6 Structural Fixture");
    await waitForDelivered(client, streamPack);
    await waitForTestText(client, streamPack.receiver, "streampack-tree-status", "match");
    folder = {
      delivered: true,
      files: 3,
      directories: 3,
      emptyDirectoryPreserved: true,
      finalTreeMatch: true,
      manifestRootVerified: true,
      source: "VIRTUAL_STRUCTURAL_FIXTURE",
      destination: "BOUNDED_OPFS_FIXTURE"
    };
  } finally {
    await closePair(client, streamPack);
  }

  return { singleFile, resume, integrityRetry, folder };
}

async function qualifyTurn(client, includeDirectRecovery) {
  const forced = await createPair(client, "RELAY_ONLY");
  let forcedTurn;
  try {
    await Promise.all([
      waitForTestText(client, forced.sender, "route", "RELAY", 30_000),
      waitForTestText(client, forced.receiver, "route", "RELAY", 30_000)
    ]);
    const [senderRoute, receiverRoute] = await Promise.all([
      route(client, forced.sender),
      route(client, forced.receiver)
    ]);
    assertion(senderRoute.routeType === "RELAY", "Firefox sender did not select relay.");
    assertion(receiverRoute.routeType === "RELAY", "Firefox receiver did not select relay.");
    assertion(
      senderRoute.localCandidateType === "relay",
      "Firefox sender did not select relay candidate."
    );
    assertion(
      receiverRoute.remoteCandidateType === "relay",
      "Firefox receiver did not select relay candidate."
    );
    await setFixtureFile(client, forced.sender, "m9-firefox-relay.bin", 8 * 1024 * 1024, 71);
    await clickButton(client, forced.sender, "Offer File");
    await clickButton(client, forced.receiver, "Accept to OPFS Benchmark Storage");
    await waitForDelivered(client, forced);
    forcedTurn = {
      routeType: "RELAY",
      routeDetail: senderRoute.routeDetail,
      protocol: senderRoute.transportProtocol,
      relayProtocol: senderRoute.relayProtocol,
      dataChannelOpen: true,
      delivered: true,
      manifestRootVerified: true,
      transferHealth: (await health(client, forced.sender)).measurementAvailability
    };
  } finally {
    await closePair(client, forced);
  }

  if (!includeDirectRecovery) return { forcedTurn, routeRecovery: null };

  const recovered = await createPair(client, "AUTO", "RELAY_ONLY");
  let routeRecovery;
  try {
    await waitForTestText(client, recovered.sender, "route", "DIRECT", 30_000);
    await setControlValue(client, recovered.sender, '[aria-label="Integrity fault"]', "payload");
    await setControlValue(client, recovered.sender, '[aria-label="Integrity fault block"]', "3");
    await clickButton(client, recovered.sender, "Apply Integrity Fault");
    await setFixtureFile(
      client,
      recovered.sender,
      "m9-firefox-direct-relay.bin",
      40 * 1024 * 1024,
      50
    );
    await clickButton(client, recovered.sender, "Offer File");
    await clickButton(client, recovered.receiver, "Accept to OPFS Benchmark Storage");
    await waitForTestText(client, recovered.sender, "transfer-status", "SENDING", 30_000);
    await waitFor(
      client,
      recovered.sender,
      "verified progress before route replacement",
      `Number(JSON.parse(${textExpression(testSelector("m8-health-snapshot"))} ?? "null")?.safeBytes ?? 0) > 0`,
      30_000
    );
    const before = await recovery(client, recovered.sender);
    await clickButton(client, recovered.sender, "Break Current Transport");
    await waitForTestText(client, recovered.sender, "route", "RELAY", 60_000);
    await waitForDelivered(client, recovered, 180_000);
    const [after, senderRoute, integrity] = await Promise.all([
      recovery(client, recovered.sender),
      route(client, recovered.sender),
      testText(client, recovered.sender, "m5-integrity-metrics")
    ]);
    assertion(
      before.transferId === after.transferId,
      "Firefox direct-to-relay recovery changed transfer ID."
    );
    assertion(
      senderRoute.routeType === "RELAY",
      "Firefox direct-to-relay recovery did not finish on relay."
    );
    assertion(
      integrity?.includes("Integrity retries1"),
      "Firefox route recovery lost the integrity retry."
    );
    const continuity = normalizedContinuity(after);
    routeRecovery = {
      routeBefore: "DIRECT",
      routeAfter: "RELAY",
      transferIdStable: true,
      safeBytesBeforeDisconnect: continuity.safeBytesBeforeDisconnect,
      remainingBytesAtResume: continuity.remainingBytesAtResume,
      resumedPayloadBytes: continuity.resumedPayloadBytes,
      duplicateRetransmittedBytes: continuity.duplicateRetransmittedBytes,
      committedBlocksRetransmitted: continuity.committedBlocksRetransmitted,
      ambiguousInflightBytesRetransmitted: continuity.ambiguousInflightBytesRetransmitted,
      manifestRootVerified: true,
      delivered: true,
      integrityRetryCount: 1,
      transferHealth: (await health(client, recovered.sender)).measurementAvailability
    };
  } finally {
    await closePair(client, recovered);
  }
  return { forcedTurn, routeRecovery };
}

async function probeDirectRoute(client) {
  try {
    const pair = await createPair(client, "AUTO");
    try {
      const senderRoute = await route(client, pair.sender);
      assertion(
        senderRoute.routeType === "DIRECT",
        "Firefox AUTO route did not select direct ICE."
      );
      return { status: "PASS", terminalError: null };
    } finally {
      await closePair(client, pair);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Firefox direct ICE failed.";
    if (message.includes("FS_ROUTE_EXHAUSTED"))
      return { status: "NOT_SUPPORTED", terminalError: "FS_ROUTE_EXHAUSTED" };
    throw error;
  }
}

async function probeRelayRoute(client) {
  try {
    const pair = await createPair(client, "RELAY_ONLY");
    try {
      const [senderRoute, receiverRoute] = await Promise.all([
        route(client, pair.sender),
        route(client, pair.receiver)
      ]);
      assertion(
        senderRoute.routeType === "RELAY",
        "Firefox forced relay did not select relay ICE."
      );
      assertion(
        receiverRoute.routeType === "RELAY",
        "Firefox forced relay peer did not select relay ICE."
      );
      assertion(
        senderRoute.localCandidateType === "relay",
        "Firefox sender did not select a relay candidate."
      );
      assertion(
        receiverRoute.remoteCandidateType === "relay",
        "Firefox receiver did not select a relay candidate."
      );
      return { status: "PASS", terminalError: null };
    } finally {
      await closePair(client, pair);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Firefox relay ICE failed.";
    if (message.includes("FS_ROUTE_EXHAUSTED"))
      return { status: "NOT_SUPPORTED", terminalError: "FS_ROUTE_EXHAUSTED" };
    throw error;
  }
}

async function writeEvidence(name, content) {
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(resolve(evidenceDirectory, name), JSON.stringify(content, null, 2) + "\n");
}

async function main() {
  assertion(process.platform === "win32", "Firefox M9 qualification currently requires Windows.");
  assertion(target === "m9-firefox-windows", `Unsupported Firefox M9 target: ${target}.`);
  assertion(executablePath && existsSync(executablePath), "Actual Firefox executable is required.");
  assertion(dockerAvailable(), "Docker Engine is required for Firefox TURN qualification.");
  assertion(!existsSync(workerEnvironmentFile), "Refusing to overwrite apps/signaling/.dev.vars.");
  if (process.env.FLICKSEND_M9_FIREFOX_BUILT !== "1") {
    const build = await run(pnpm, ["build"]);
    assertion(build === 0, "FlickSend build failed before Firefox qualification.");
  }

  const secret = randomBytes(32).toString("base64url");
  const profile = await mkdtemp(join(tmpdir(), "flicksend-firefox-m9-"));
  const bidiPort = await freeTcpPort();
  let coturnStarted = false;
  let signaling;
  let engineLab;
  let firefox;
  let client;
  try {
    await writeFile(
      turnEnvironmentFile,
      `TURN_REALM=flicksend.local\nTURN_EXTERNAL_IP=127.0.0.1\nTURN_SHARED_SECRET=${secret}\n`,
      { mode: 0o600 }
    );
    await writeFile(
      workerEnvironmentFile,
      `TURN_DEV_MODE=true\nTURN_SHARED_SECRET=${secret}\nTURN_URLS=turn:127.0.0.1:3478?transport=udp,turn:127.0.0.1:3478?transport=tcp\nSTUN_URLS=stun:127.0.0.1:3478\nTURN_CREDENTIAL_TTL_SECONDS=1800\n`,
      { mode: 0o600 }
    );
    const started = await run(docker, [
      "compose",
      "--env-file",
      turnEnvironmentFile,
      "-f",
      compose,
      "up",
      "-d"
    ]);
    assertion(started === 0, "Local coturn startup failed.");
    coturnStarted = true;
    await waitForTcpPort(3478);

    signaling = startService(pnpm, ["--filter", "@flicksend/signaling", "dev"], process.env);
    await waitForHttp("http://127.0.0.1:8787/health");
    engineLab = startService(pnpm, ["--filter", "@flicksend/engine-lab", "dev"], {
      ...process.env,
      NEXT_PUBLIC_TURN_ENABLED: "true"
    });
    await waitForHttp("http://127.0.0.1:3000");

    firefox = spawn(
      executablePath,
      [
        "--headless",
        "--remote-debugging-port",
        String(bidiPort),
        "-no-remote",
        "-profile",
        profile
      ],
      { stdio: "ignore", windowsHide: true }
    );
    const connection = await connectBidi(bidiPort);
    client = connection.client;
    const browserVersion = connection.session.capabilities?.browserVersion;
    assertion(typeof browserVersion === "string", "Firefox BiDi did not report a browser version.");

    const capabilities = await detectCapabilities(client);
    const directRoute = await probeDirectRoute(client);
    const relayRoute = await probeRelayRoute(client);
    const environment = {
      realBrowser: true,
      automated: true,
      emulated: false,
      automationProtocol: "WEBDRIVER_BIDI",
      headless: true,
      hostOperatingSystem: type(),
      hostOperatingSystemVersion: release(),
      hostArchitecture: arch()
    };
    const limitations = [
      "Firefox stable was automated through its standard WebDriver BiDi endpoint, not Playwright's patched Firefox protocol.",
      directRoute.status === "PASS"
        ? "The local Firefox direct route was available before the separate direct-to-relay recovery qualification."
        : "The local Firefox AUTO route failed safely with FS_ROUTE_EXHAUSTED; forced relay is independently probed before any payload qualification.",
      "File input uses a deterministic automation fixture; no native source picker interaction occurred.",
      "Firefox lacks a qualified selected streaming external destination in this run; bounded OPFS remains fixture infrastructure only.",
      "StreamPack coverage uses the bounded virtual structural fixture because real directory-picker evidence remains assisted.",
      "Native picker permissions, permission revocation, refresh, browser restart, backgrounding, screen lock, and sleep were not exercised."
    ];
    const browser = {
      name: capabilities.browser,
      version: browserVersion,
      userAgentVersion: capabilities.browserVersion,
      engine: capabilities.engine,
      operatingSystem: capabilities.operatingSystem,
      operatingSystemVersion: capabilities.operatingSystemVersion,
      deviceClass: capabilities.deviceClass,
      architecture: capabilities.architecture
    };
    // Direct ICE is independently available in this environment, so retain its actual transfer
    // evidence even when the separate forced-TURN scenario cannot establish a relay route.
    const directCore =
      directRoute.status === "PASS" ? await qualifyCore(client, "AUTO", capabilities) : null;
    if (relayRoute.status !== "PASS") {
      const relayLimitedLimitations = [
        ...limitations,
        directCore
          ? "Local direct transfer completed, but forced local coturn relay exhausted safely with FS_ROUTE_EXHAUSTED; TURN and direct-to-relay recovery are not supported in this recorded Windows environment."
          : "Forced local coturn relay exhausted safely with FS_ROUTE_EXHAUSTED before any payload transfer; Firefox has no qualified safe route in this recorded Windows environment."
      ];
      const coreArtifact = {
        schemaVersion: 1,
        milestone: "M9",
        generatedAt: new Date().toISOString(),
        target,
        environment,
        browser,
        supportTier: directCore ? "SUPPORTED_WITH_LIMITATIONS" : "UNSUPPORTED",
        capabilities,
        qualificationResults: {
          capabilityDetection: "PASS",
          directWebRtc: directRoute.status,
          directWebRtcTerminalError: directRoute.terminalError,
          turnRelay: relayRoute.status,
          turnRelayTerminalError: relayRoute.terminalError,
          routeRecovery: "NOT_TESTED",
          m5SingleFile: directCore?.singleFile ?? "NOT_TESTED",
          m5Resume: directCore?.resume ?? "NOT_TESTED",
          m5CorruptionRetry: directCore?.integrityRetry ?? "NOT_TESTED",
          m6StructuralStreamPack: directCore?.folder ?? "NOT_TESTED",
          destinationStreaming: directCore ? "LIMITED" : "NOT_TESTED",
          backgroundLifecycle: "NOT_TESTED",
          pageRefresh: "NOT_TESTED",
          browserRestart: "NOT_TESTED",
          permissionAfterPicker: "NOT_TESTED",
          ordinaryReconnect: "NOT_TESTED",
          permissionRevocation: "NOT_TESTED",
          screenLockSleep: "NOT_TESTED"
        },
        limitations: relayLimitedLimitations
      };
      const turnArtifact = {
        schemaVersion: 1,
        milestone: "M9",
        kind: "browser-turn-qualification",
        generatedAt: new Date().toISOString(),
        target: "m9-firefox-turn",
        environment,
        browser,
        qualificationResults: {
          attempted: true,
          forcedTurn: "NOT_SUPPORTED",
          delivered: false,
          manifestRootVerified: false,
          terminalError: relayRoute.terminalError
        },
        limitations: relayLimitedLimitations
      };
      const recoveryArtifact = {
        schemaVersion: 1,
        milestone: "M9",
        kind: "browser-route-recovery-qualification",
        generatedAt: new Date().toISOString(),
        target: "m9-firefox-route-recovery",
        environment,
        browser,
        qualificationResults: {
          attempted: false,
          routeRecovery: "NOT_TESTED",
          reason: "Forced relay did not establish, so direct-to-relay replacement was not eligible."
        },
        limitations: relayLimitedLimitations
      };
      await Promise.all([
        writeEvidence("m9-firefox-windows.json", coreArtifact),
        writeEvidence("m9-firefox-turn.json", turnArtifact),
        writeEvidence("m9-firefox-route-recovery.json", recoveryArtifact)
      ]);
      console.log("Retained actual Firefox direct-core and unsupported-relay evidence.");
      return;
    }

    const core = directCore ?? (await qualifyCore(client, "RELAY_ONLY", capabilities));
    const turn = await qualifyTurn(client, directRoute.status === "PASS");
    const coreArtifact = {
      schemaVersion: 1,
      milestone: "M9",
      generatedAt: new Date().toISOString(),
      target,
      environment,
      browser: {
        name: capabilities.browser,
        version: browserVersion,
        userAgentVersion: capabilities.browserVersion,
        engine: capabilities.engine,
        operatingSystem: capabilities.operatingSystem,
        operatingSystemVersion: capabilities.operatingSystemVersion,
        deviceClass: capabilities.deviceClass,
        architecture: capabilities.architecture
      },
      supportTier: "SUPPORTED_WITH_LIMITATIONS",
      capabilities,
      qualificationResults: {
        m5SingleFile: core.singleFile,
        m5Resume: core.resume,
        m5CorruptionRetry: core.integrityRetry,
        m6StructuralStreamPack: core.folder,
        destinationStreaming: "LIMITED",
        turnRelay: "PASS",
        directWebRtc: directRoute.status,
        directWebRtcTerminalError: directRoute.terminalError,
        routeRecovery: directRoute.status === "PASS" ? "PASS" : "NOT_SUPPORTED",
        backgroundLifecycle: "NOT_TESTED",
        pageRefresh: "NOT_TESTED",
        browserRestart: "NOT_TESTED",
        permissionAfterPicker: "NOT_TESTED",
        ordinaryReconnect: "NOT_TESTED",
        permissionRevocation: "NOT_TESTED",
        screenLockSleep: "NOT_TESTED"
      },
      limitations
    };
    const turnArtifact = {
      schemaVersion: 1,
      milestone: "M9",
      kind: "browser-turn-qualification",
      generatedAt: new Date().toISOString(),
      target: "m9-firefox-turn",
      environment,
      browser: coreArtifact.browser,
      qualificationResults: { forcedTurn: turn.forcedTurn },
      limitations: [
        "This local coturn qualification proves Firefox's selected UDP relay path only; production TURN deployment remains deferred."
      ]
    };
    const recoveryArtifact = {
      schemaVersion: 1,
      milestone: "M9",
      kind: "browser-route-recovery-qualification",
      generatedAt: new Date().toISOString(),
      target: "m9-firefox-route-recovery",
      environment,
      browser: coreArtifact.browser,
      qualificationResults: turn.routeRecovery ?? {
        routeBefore: "DIRECT",
        routeAfter: "NOT_SUPPORTED",
        transferIdStable: "NOT_TESTED",
        delivered: false,
        manifestRootVerified: false,
        terminalError: directRoute.terminalError
      },
      limitations: turnArtifact.limitations
    };
    await Promise.all([
      writeEvidence("m9-firefox-windows.json", coreArtifact),
      writeEvidence("m9-firefox-turn.json", turnArtifact),
      writeEvidence("m9-firefox-route-recovery.json", recoveryArtifact)
    ]);
    console.log("Retained real stable Firefox M9 core, TURN, and route-recovery evidence.");
  } finally {
    if (client) await client.end();
    if (firefox && firefox.exitCode === null) firefox.kill();
    await stopService(engineLab);
    await stopService(signaling);
    if (coturnStarted)
      await run(docker, [
        "compose",
        "--env-file",
        turnEnvironmentFile,
        "-f",
        compose,
        "down",
        "--volumes",
        "--remove-orphans"
      ]);
    await Promise.all([
      rm(turnEnvironmentFile, { force: true }),
      rm(workerEnvironmentFile, { force: true }),
      rm(profile, { recursive: true, force: true })
    ]);
  }
}

try {
  await main();
} catch (error) {
  console.error(
    error instanceof Error
      ? `Firefox M9 qualification failed: ${error.message}`
      : "Firefox M9 qualification failed."
  );
  process.exitCode = 1;
}
