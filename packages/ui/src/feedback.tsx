import * as ToastPrimitive from "@radix-ui/react-toast";
import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { Button } from "./actions.js";
import { Icon } from "./icons.js";
import {
  getHealthPresentation,
  getTransferStatusPresentation,
  type HealthConfidence,
  type ProductErrorViewModel,
  type ProductHealthState,
  type ProductTransferState,
  type StatusTone
} from "./product-types.js";
import { classNames, formatPercentage } from "./utils.js";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: StatusTone }) {
  return <span className={classNames("fs-badge", `fs-badge--${tone}`)}>{children}</span>;
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="fs-tag">{children}</span>;
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className="fs-spinner" role="status">
      <span className="fs-visually-hidden">{label}</span>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={classNames("fs-skeleton", className)} />;
}

export function Alert({
  action,
  children,
  title,
  tone = "info"
}: {
  action?: ReactNode;
  children: ReactNode;
  title: string;
  tone?: "info" | "success" | "warning" | "danger";
}) {
  const icon =
    tone === "danger" || tone === "warning" ? "warning" : tone === "success" ? "check" : "info";
  return (
    <section className={classNames("fs-alert", `fs-alert--${tone}`)}>
      <Icon name={icon} />
      <div className="fs-alert__content">
        <h3>{title}</h3>
        <div>{children}</div>
      </div>
      {action ? <div className="fs-alert__action">{action}</div> : null}
    </section>
  );
}

export function InlineError({ children }: { children: ReactNode }) {
  return (
    <p className="fs-inline-error" role="alert">
      <Icon name="warning" />
      {children}
    </p>
  );
}

export function ErrorCallout({
  error,
  onRetry
}: {
  error: ProductErrorViewModel;
  onRetry?: () => void;
}) {
  const tone =
    error.kind === "recovering" ? "info" : error.kind === "terminal" ? "danger" : "warning";
  return (
    <Alert
      action={
        error.retryable && onRetry ? (
          <Button onClick={onRetry} size="sm" variant="secondary">
            Try again
          </Button>
        ) : undefined
      }
      title={error.title}
      tone={tone}
    >
      <p>{error.explanation}</p>
      <p className="fs-alert__recommendation">{error.recommendedAction}</p>
      {error.supportReference ? (
        <p className="fs-alert__support-reference">Support reference: {error.supportReference}</p>
      ) : null}
    </Alert>
  );
}

export function ErrorPanel({
  error,
  onRetry
}: {
  error: ProductErrorViewModel;
  onRetry?: () => void;
}) {
  return (
    <section className="fs-error-panel" role="alert">
      <Icon name="warning" />
      <div>
        <h3>{error.title}</h3>
        <p>{error.explanation}</p>
        <p>{error.recommendedAction}</p>
        {error.supportReference ? (
          <p className="fs-error-panel__support-reference">
            Support reference: {error.supportReference}
          </p>
        ) : null}
        {error.retryable && onRetry ? (
          <Button onClick={onRetry} variant="secondary">
            Try again
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export function StatusDot({ tone = "neutral" }: { tone?: StatusTone }) {
  return (
    <span aria-hidden="true" className={classNames("fs-status-dot", `fs-status-dot--${tone}`)} />
  );
}

export function StatusLabel({ state }: { state: ProductTransferState }) {
  const presentation = getTransferStatusPresentation(state);
  return (
    <span className="fs-status-label">
      <StatusDot tone={presentation.tone} />
      {presentation.label}
    </span>
  );
}

export function StatusBadge({ state }: { state: ProductTransferState }) {
  const presentation = getTransferStatusPresentation(state);
  return (
    <Badge tone={presentation.tone}>
      <StatusDot tone={presentation.tone} />
      {presentation.label}
    </Badge>
  );
}

export function Progress({
  indeterminate = false,
  label,
  max = 100,
  supportingText,
  value,
  verifiedValue
}: {
  indeterminate?: boolean;
  label: string;
  max?: number;
  supportingText?: string;
  value?: number;
  verifiedValue?: number;
}) {
  const supportingTextId = useId();
  const safeValue = value === undefined ? 0 : Math.min(Math.max(value, 0), max);
  const safeVerified =
    verifiedValue === undefined ? undefined : Math.min(Math.max(verifiedValue, 0), safeValue);
  const transferredWidth = `${(safeValue / max) * 100}%`;
  const verifiedWidth = safeVerified === undefined ? undefined : `${(safeVerified / max) * 100}%`;
  const statusText = indeterminate
    ? `${label}: in progress`
    : `${label}: ${formatPercentage(safeValue, max)}`;
  return (
    <div className="fs-progress-wrap">
      <div className="fs-progress__labels">
        <span>{label}</span>
        {!indeterminate ? (
          <span className="fs-number">{formatPercentage(safeValue, max)}</span>
        ) : null}
      </div>
      <div
        aria-label={label}
        aria-describedby={supportingText ? supportingTextId : undefined}
        aria-valuemax={indeterminate ? undefined : max}
        aria-valuemin={indeterminate ? undefined : 0}
        aria-valuenow={indeterminate ? undefined : safeValue}
        aria-valuetext={statusText}
        className={classNames("fs-progress", indeterminate && "fs-progress--indeterminate")}
        role="progressbar"
      >
        <span
          className="fs-progress__transferred"
          style={indeterminate ? undefined : { width: transferredWidth }}
        />
        {verifiedWidth ? (
          <span className="fs-progress__verified" style={{ width: verifiedWidth }} />
        ) : null}
      </div>
      {supportingText ? (
        <p className="fs-progress__supporting" id={supportingTextId}>
          {supportingText}
        </p>
      ) : null}
    </div>
  );
}

export function VerifiedProgress({
  label = "Transfer progress",
  transferred,
  verified
}: {
  label?: string;
  transferred: number;
  verified: number;
}) {
  return (
    <div className="fs-verified-progress">
      <Progress
        label={label}
        supportingText={`Verified progress: ${formatPercentage(verified)}`}
        value={transferred}
        verifiedValue={verified}
      />
      <p className="fs-verified-progress__legend">
        <span className="is-transferred" />
        Transferred <span className="is-verified" />
        Verified and safe
      </p>
    </div>
  );
}

export function TransferHealth({
  confidence = "HIGH",
  detail,
  state
}: {
  confidence?: HealthConfidence;
  detail?: string;
  state: ProductHealthState;
}) {
  const presentation = getHealthPresentation(state);
  const softened = confidence === "LOW" && state !== "NOT_ENOUGH_INFORMATION";
  return (
    <section
      className={classNames(
        "fs-health",
        `fs-health--${presentation.tone}`,
        softened && "fs-health--softened"
      )}
    >
      <StatusDot tone={presentation.tone} />
      <div>
        <h3>{softened ? "Transfer conditions are still settling" : presentation.label}</h3>
        <p>{detail ?? presentation.detail}</p>
      </div>
      {confidence !== "HIGH" ? (
        <span className="fs-health__confidence">
          {confidence === "LOW" ? "Low confidence" : "Moderate confidence"}
        </span>
      ) : null}
    </section>
  );
}

export function RouteLabel({ route }: { route: "Direct" | "Relayed" }) {
  return (
    <span className="fs-route-label">
      <Icon name="route" />
      {route}
    </span>
  );
}

export function EmptyState({
  action,
  description,
  icon = "folder",
  title
}: {
  action?: ReactNode;
  description: string;
  icon?: "folder" | "person" | "send";
  title: string;
}) {
  return (
    <section className="fs-empty-state">
      <span className="fs-empty-state__icon">
        <Icon name={icon} />
      </span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {action ? <div>{action}</div> : null}
    </section>
  );
}

type ToastMessage = { description?: string; id: number; title: string };
type ToastContextValue = { notify: (message: Omit<ToastMessage, "id">) => void };
const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<ToastMessage | null>(null);
  function notify(next: Omit<ToastMessage, "id">): void {
    setMessage({ ...next, id: Date.now() });
  }
  return (
    <ToastContext.Provider value={{ notify }}>
      <ToastPrimitive.Provider duration={4000} swipeDirection="right">
        {children}
        <ToastPrimitive.Root
          className="fs-toast"
          key={message?.id}
          onOpenChange={(open) => !open && setMessage(null)}
          open={message !== null}
        >
          {message ? (
            <>
              <ToastPrimitive.Title>{message.title}</ToastPrimitive.Title>
              {message.description ? (
                <ToastPrimitive.Description>{message.description}</ToastPrimitive.Description>
              ) : null}
            </>
          ) : null}
        </ToastPrimitive.Root>
        <ToastPrimitive.Viewport className="fs-toast-viewport" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
