"use client";

import { ConnectionCoordinator, type ConnectionSnapshot } from "@flicksend/engine-core";
import {
  createOpfsRecoveryStore,
  SmallFixtureDestination,
  SmallStreamPackFixtureDestination
} from "@flicksend/filesystem-browser";
import { Button, Field, Heading, Input, Stack, Text } from "@flicksend/ui";
import { useEffect, useRef, useState } from "react";
import { p4StructuralFixtureTree } from "../send/p4-fixtures";

type ReceiverResult = {
  delivered: boolean;
  fileMatchesExpected: boolean | null;
  manifestRootVerified: boolean;
  structuralFixtureMatches: boolean | null;
};

async function digest(bytes: Uint8Array): Promise<string> {
  const payload = new Uint8Array(bytes.byteLength);
  payload.set(bytes);
  const value = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Development-only P4 qualification peer. It automatically accepts into bounded in-memory
 * fixtures, is intentionally absent from product navigation, and is not a P5 receive surface.
 */
export function P4ReceiverHarness() {
  const signalingUrl = process.env.NEXT_PUBLIC_SIGNALING_URL ?? "ws://127.0.0.1:8787";
  const [engine, setEngine] = useState<ConnectionCoordinator | null>(null);
  const [code, setCode] = useState("");
  const [snapshot, setSnapshot] = useState<ConnectionSnapshot | null>(null);
  const [expectedDigest, setExpectedDigest] = useState<string | null>(null);
  const [expectStructuralFixture, setExpectStructuralFixture] = useState(false);
  const [result, setResult] = useState<ReceiverResult>({
    delivered: false,
    fileMatchesExpected: null,
    manifestRootVerified: false,
    structuralFixtureMatches: null
  });
  const acceptedTransfer = useRef<string | null>(null);
  const fileDestination = useRef<SmallFixtureDestination | null>(null);
  const folderDestination = useRef<SmallStreamPackFixtureDestination | null>(null);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    setExpectedDigest(parameters.get("expectedDigest"));
    setExpectStructuralFixture(parameters.get("expectStructuralFixture") === "1");
  }, []);

  useEffect(() => {
    const coordinator = new ConnectionCoordinator(signalingUrl);
    setEngine(coordinator);
    return coordinator.subscribe(setSnapshot);
  }, [signalingUrl]);

  useEffect(() => {
    if (!engine || !snapshot) return;
    const transfer = snapshot.transfer;
    if (
      transfer.state !== "READY" ||
      !transfer.transferId ||
      acceptedTransfer.current === transfer.transferId
    )
      return;
    acceptedTransfer.current = transfer.transferId;
    void (async () => {
      if (transfer.protocolVersion === 5) {
        const destination = new SmallStreamPackFixtureDestination();
        folderDestination.current = destination;
        await engine.acceptIncomingFolder(
          destination,
          await createOpfsRecoveryStore(),
          `p4-folder:${transfer.transferId}`
        );
      } else {
        const destination = new SmallFixtureDestination(64 * 1024 * 1024);
        fileDestination.current = destination;
        await engine.acceptIncomingFile(
          destination,
          await createOpfsRecoveryStore(),
          `p4-file:${transfer.transferId}`
        );
      }
    })().catch(() => {
      setResult((current) => ({ ...current, delivered: false }));
    });
  }, [engine, snapshot]);

  useEffect(() => {
    if (!snapshot || snapshot.transfer.state !== "DELIVERED") return;
    void (async () => {
      const destination = fileDestination.current;
      const fileMatchesExpected =
        expectedDigest && destination
          ? (await digest(destination.bytes())) === expectedDigest
          : null;
      const structuralFixtureMatches =
        expectStructuralFixture && folderDestination.current
          ? folderDestination.current.hasExactTree(
              p4StructuralFixtureTree().manifest,
              p4StructuralFixtureTree().files
            )
          : null;
      setResult({
        delivered: true,
        fileMatchesExpected,
        manifestRootVerified: snapshot.transfer.integrity.manifestRootMatch === true,
        structuralFixtureMatches
      });
    })();
  }, [expectedDigest, expectStructuralFixture, snapshot]);

  return (
    <main className="p4-harness-page">
      <Stack gap="md">
        <Text as="p" size="label" tone="muted">
          Development-only qualification
        </Text>
        <Heading as="h1" size="page">
          P4 receiver harness
        </Heading>
        <Text tone="secondary">
          This deterministic peer accepts test transfers into bounded fixtures. It is not a receive
          product page.
        </Text>
        <Field id="p4-session-code" label="Development session code">
          <Input
            id="p4-session-code"
            onChange={(event) => setCode(event.target.value)}
            value={code}
          />
        </Field>
        <Button disabled={!engine || !code} onClick={() => void engine?.joinSession(code)}>
          Join development session
        </Button>
        <output data-testid="p4-harness-status">
          {snapshot?.transfer.state ?? "IDLE"} ·{" "}
          {result.delivered ? "DELIVERED" : "awaiting transfer"}
        </output>
        <output data-testid="p4-harness-root">
          Manifest root: {result.manifestRootVerified ? "verified" : "pending"}
        </output>
        <output data-testid="p4-harness-file-match">
          File fixture:{" "}
          {result.fileMatchesExpected === null
            ? "not requested"
            : result.fileMatchesExpected
              ? "match"
              : "mismatch"}
        </output>
        <output data-testid="p4-harness-folder-match">
          Folder fixture:{" "}
          {result.structuralFixtureMatches === null
            ? "not requested"
            : result.structuralFixtureMatches
              ? "match"
              : "mismatch"}
        </output>
      </Stack>
    </main>
  );
}
