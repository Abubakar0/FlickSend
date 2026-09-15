import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { delimiter, dirname } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isDeepStrictEqual } from "node:util";
import { WebSocket } from "ws";

const port = 8791;
const remoteOrigin = process.env.FLICKSEND_P12_SIGNALING_ORIGIN;
const localWorker = !remoteOrigin;
const origin = remoteOrigin ?? `http://127.0.0.1:${port}`;
const secret = process.env.FLICKSEND_P12_SIGNALING_SECRET ?? randomBytes(48).toString("base64url");
const statePath = localWorker
  ? await mkdtemp(`${tmpdir()}${process.platform === "win32" ? "\\" : "/"}flicksend-p12-`)
  : null;
const worker = localWorker ? startWorker() : null;
worker?.stdout?.pipe(process.stdout);
worker?.stderr?.pipe(process.stderr);

try {
  await waitForHealth();
  await runQualification();
  console.log(
    `P12 ${localWorker ? "local" : "remote"} Cloudflare Worker/Durable Object signaling qualification: PASS (12 cases)`
  );
} finally {
  await stopWorker();
  if (statePath)
    await rm(statePath, { force: true, maxRetries: 5, recursive: true, retryDelay: 250 });
}

function startWorker() {
  const args = [
    "--filter",
    "@flicksend/signaling",
    "exec",
    "wrangler",
    "dev",
    "--local",
    "--persist-to",
    statePath,
    "--port",
    String(port),
    "--var",
    `SIGNALING_CAPABILITY_SECRET:${secret}`
  ];
  const env = {
    ...process.env,
    PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}`
  };
  if (process.platform !== "win32")
    return spawn("pnpm", args, { cwd: process.cwd(), env, stdio: "pipe" });
  return spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `pnpm.cmd ${args.join(" ")}`], {
    cwd: process.cwd(),
    env,
    stdio: "pipe"
  });
}

async function waitForHealth() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {
      // Worker initialization is expected to race this first probe.
    }
    await delay(250);
  }
  throw new Error("P12 Worker did not become healthy.");
}

async function runQualification() {
  const sessionId = randomUUID();
  const senderCapability = capability(sessionId, "sender", Date.now() + 15_000);
  const receiverCapability = capability(sessionId, "receiver", Date.now() + 15_000);
  let sender = await open(senderCapability);
  await expectSignal(sender, { role: "offerer", type: "session-ready" });
  console.log("P12 signaling case 1: authorized sender join");

  const replacedSender = await open(senderCapability);
  await expectSignal(replacedSender, { role: "offerer", type: "session-ready" });
  await expectClosed(sender, 5_000);
  sender = replacedSender;
  console.log("P12 signaling case 2: duplicate sender socket replaced");

  const senderPeerJoined = nextSignal(sender);
  const receiver = await open(receiverCapability);
  await expectSignal(receiver, { role: "answerer", type: "session-ready" });
  await expectSignalPromise(senderPeerJoined, { type: "peer-joined" });
  console.log("P12 signaling case 3: authorized receiver join");

  const offer = { routeGeneration: 1, sdp: "v=0\r\no=sender", type: "offer" };
  const receivedOffer = nextSignal(receiver);
  sender.send(JSON.stringify(offer));
  await expectSignalPromise(receivedOffer, offer);
  console.log("P12 signaling case 4: offer relay");

  const candidate = {
    candidate: {
      candidate: "candidate:1 1 udp 1 127.0.0.1 9 typ host",
      sdpMLineIndex: 0,
      sdpMid: "0"
    },
    routeGeneration: 1,
    type: "ice-candidate"
  };
  const receivedCandidate = nextSignal(sender);
  receiver.send(JSON.stringify(candidate));
  await expectSignalPromise(receivedCandidate, candidate);
  console.log("P12 signaling case 5: ICE candidate relay");

  await expectRejected(open(`${senderCapability}tampered`));
  console.log("P12 signaling case 6: unauthorized client rejected");

  const peerLeft = nextSignal(receiver);
  sender.terminate();
  await expectSignalPromise(peerLeft, { type: "peer-left" });
  const rejoinedSender = await open(senderCapability);
  await expectSignal(rejoinedSender, { role: "offerer", type: "session-ready" });
  await expectSignal(rejoinedSender, { type: "peer-joined" });
  console.log("P12 signaling case 7: same-session reconnect");

  const invalidJson = nextSignal(rejoinedSender);
  rejoinedSender.send("not-json");
  await expectSignalPromise(invalidJson, { code: "INVALID_JSON", type: "error" });
  console.log("P12 signaling case 8: malformed message rejected");

  const oversized = nextSignal(rejoinedSender);
  rejoinedSender.send(JSON.stringify({ sdp: "x".repeat(17_000), type: "offer" }));
  await expectSignalPromise(oversized, { code: "INVALID_SIGNAL", type: "error" });
  console.log("P12 signaling case 9: oversized message rejected");

  const revocableSession = randomUUID();
  const revocableCapability = capability(revocableSession, "sender", Date.now() + 15_000);
  const revocable = await open(revocableCapability);
  await expectSignal(revocable, { role: "offerer", type: "session-ready" });
  await revoke(revocableCapability);
  await expectClosed(revocable, 5_000);
  await expectRejected(open(revocableCapability));
  console.log("P12 signaling case 10: revoked capability rejected");

  await expectRejected(open(capability(randomUUID(), "sender", Date.now() - 1)));
  const expiringCapability = capability(randomUUID(), "sender", Date.now() + 5_000);
  const expiring = await open(expiringCapability);
  await expectSignal(expiring, { role: "offerer", type: "session-ready" });
  await expectClosed(expiring, 10_000);
  console.log("P12 signaling case 11: expiry cleanup");

  receiver.terminate();
  rejoinedSender.terminate();
  console.log("P12 signaling case 12: bounded two-peer session complete");
}

function capability(sessionId, role, expiresAtMs) {
  const payload = Buffer.from(
    JSON.stringify({
      exp: expiresAtMs,
      jti: randomBytes(16).toString("base64url"),
      role,
      sid: sessionId,
      v: 1
    }),
    "utf8"
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
  return `fsst1.${payload}.${signature}`;
}

async function open(capabilityToken) {
  const socket = new WebSocket(
    `${origin.replace(/^http/, "ws")}/v2/session?cap=${encodeURIComponent(capabilityToken)}`
  );
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out opening signaling WebSocket.")),
      5_000
    );
    socket.once("open", () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
  return socket;
}

async function revoke(capabilityToken) {
  const response = await fetch(`${origin}/v2/revoke?cap=${encodeURIComponent(capabilityToken)}`, {
    method: "POST"
  });
  if (!response.ok) throw new Error("Authorized signaling capability could not be revoked.");
}

function nextSignal(socket) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for signaling message.")),
      5_000
    );
    socket.once("message", (raw) => {
      clearTimeout(timeout);
      try {
        resolve(JSON.parse(String(raw)));
      } catch {
        reject(new Error("Worker returned malformed signaling JSON."));
      }
    });
  });
}

async function expectSignal(socket, expected) {
  return expectSignalPromise(nextSignal(socket), expected);
}

async function expectSignalPromise(message, expected) {
  const actual = await message;
  for (const [key, value] of Object.entries(expected)) {
    if (!isDeepStrictEqual(actual[key], value)) throw new Error(`Unexpected signaling ${key}.`);
  }
}

async function expectRejected(socket) {
  try {
    await socket;
  } catch {
    return;
  }
  throw new Error("Unauthorized signaling capability was accepted.");
}

async function expectClosed(socket, timeoutMs) {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Expired session remained open.")),
      timeoutMs
    );
    socket.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopWorker() {
  if (!worker) return;
  if (worker.exitCode === null && process.platform === "win32")
    spawnSync("taskkill", ["/pid", String(worker.pid), "/t", "/f"], { stdio: "ignore" });
  else if (worker.exitCode === null) worker.kill();
  if (process.platform === "win32") stopDedicatedPortProcess();
  await Promise.race([new Promise((resolve) => worker.once("exit", resolve)), delay(5_000)]);
}

/** The runner owns only port 8791; this clears detached workerd children on Windows. */
function stopDedicatedPortProcess() {
  const command =
    "Get-NetTCPConnection -LocalPort 8791 -State Listen -ErrorAction SilentlyContinue | " +
    "Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }";
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    stdio: "ignore"
  });
}
