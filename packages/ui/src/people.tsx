import type { ReactNode } from "react";
import { classNames, initials } from "./utils.js";

export type Presence = "available" | "unavailable" | "unknown";
export type PersonSummary = {
  initials?: string;
  name: string;
  presence?: Presence;
  subtitle?: string;
};

export function Avatar({
  name,
  initials: providedInitials,
  size = "md"
}: {
  name: string;
  initials?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span aria-hidden="true" className={classNames("fs-avatar", `fs-avatar--${size}`)}>
      {providedInitials ?? initials(name)}
    </span>
  );
}

export function PresenceIndicator({ presence = "unknown" }: { presence?: Presence }) {
  const label =
    presence === "available"
      ? "Available"
      : presence === "unavailable"
        ? "Unavailable"
        : "Availability unknown";
  return (
    <span
      aria-label={label}
      className={classNames("fs-presence", `fs-presence--${presence}`)}
      role="img"
    />
  );
}

export function PersonChip({ person }: { person: PersonSummary }) {
  return (
    <span className="fs-person-chip">
      <span className="fs-person-chip__avatar">
        <Avatar initials={person.initials} name={person.name} size="sm" />
        <PresenceIndicator presence={person.presence} />
      </span>
      {person.name}
    </span>
  );
}

export function PersonRow({ action, person }: { action?: ReactNode; person: PersonSummary }) {
  return (
    <div className="fs-person-row">
      <span className="fs-person-row__avatar">
        <Avatar initials={person.initials} name={person.name} />
        <PresenceIndicator presence={person.presence} />
      </span>
      <span className="fs-person-row__content">
        <strong>{person.name}</strong>
        {person.subtitle ? <small>{person.subtitle}</small> : null}
      </span>
      {action ? <span className="fs-person-row__action">{action}</span> : null}
    </div>
  );
}
