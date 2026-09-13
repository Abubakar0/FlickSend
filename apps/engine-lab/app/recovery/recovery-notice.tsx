"use client";

import { Button, Card, Heading, Stack, Text } from "@flicksend/ui";
import { useEffect, useRef, useState } from "react";
import {
  recoveredPresentation,
  recoveryActionLabel,
  recoveryPresentation,
  type RecoveryPresentationInput,
  type RecoveryViewModel
} from "./recovery-presentation";

export type SafeRecoveryDetail = {
  label: string;
  value: string;
};

export function useRecoveryNotice(input: RecoveryPresentationInput): RecoveryViewModel | null {
  const current = recoveryPresentation(input);
  const previousPhase = useRef(input.phase);
  const restoredTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    const recovered =
      previousPhase.current === "RECONNECTING" &&
      ["TRANSFERRING", "RECEIVING", "VERIFYING"].includes(input.phase) &&
      input.error === null;
    previousPhase.current = input.phase;
    if (!recovered) return;
    setShowRestored(true);
    if (restoredTimer.current) clearTimeout(restoredTimer.current);
    restoredTimer.current = setTimeout(() => setShowRestored(false), 3_000);
  }, [input.error, input.phase]);

  useEffect(
    () => () => {
      if (restoredTimer.current) clearTimeout(restoredTimer.current);
    },
    []
  );

  return current ?? (showRestored ? recoveredPresentation() : null);
}

export function RecoveryNotice({
  details = [],
  onAction,
  presentation
}: {
  details?: readonly SafeRecoveryDetail[];
  onAction?: () => void;
  presentation: RecoveryViewModel;
}) {
  const actionLabel = recoveryActionLabel(presentation.action);
  return (
    <Card
      className={`p8-recovery-notice p8-recovery-notice--${presentation.severity}`}
      role={
        presentation.mode === "automatic" || presentation.mode === "recovered" ? "status" : "alert"
      }
    >
      <Stack gap="sm">
        <Heading as="h3" size="section">
          {presentation.title}
        </Heading>
        <Text>{presentation.explanation}</Text>
        <Text tone="secondary">{presentation.recommendedAction}</Text>
        {actionLabel && onAction ? (
          <Button onClick={onAction} size="sm" variant="secondary">
            {actionLabel}
          </Button>
        ) : null}
        {details.length > 0 ? (
          <details className="p8-recovery-notice__details">
            <summary>Details</summary>
            <dl>
              {details.map((detail) => (
                <div key={detail.label}>
                  <dt>{detail.label}</dt>
                  <dd>{detail.value}</dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}
      </Stack>
    </Card>
  );
}
