"use client";

import { TransfersProvider, useTransfers } from "../transfers/transfers-provider";
import { ReceiveWorkspace } from "./receive-workspace";

function RecordedReceiveWorkspace({ session }: { session: string }) {
  const { recorder } = useTransfers();
  return <ReceiveWorkspace lifecycleRecorder={recorder} session={session} />;
}

/** P7 attaches only a lifecycle observer; P5 remains the recipient correctness authority. */
export function ReceiveTransfersBoundary({
  currentPersonId,
  session
}: {
  currentPersonId: string;
  session: string;
}) {
  return (
    <TransfersProvider currentPersonId={currentPersonId}>
      <RecordedReceiveWorkspace session={session} />
    </TransfersProvider>
  );
}
