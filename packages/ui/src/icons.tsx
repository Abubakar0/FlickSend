import type { ReactElement, SVGProps } from "react";

export type IconName =
  | "archive"
  | "arrow-right"
  | "check"
  | "chevron-down"
  | "close"
  | "document"
  | "file"
  | "folder"
  | "image"
  | "info"
  | "menu"
  | "more"
  | "pause"
  | "person"
  | "photo"
  | "route"
  | "send"
  | "video"
  | "warning";

const paths: Record<IconName, ReactElement> = {
  archive: (
    <>
      <rect height="12" rx="1" width="14" x="5" y="7" />
      <path d="M4 7h16v3H4zM10 12h4" />
    </>
  ),
  "arrow-right": <path d="M5 12h14m-6-6 6 6-6 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  document: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v5h5M10 13h5m-5 4h5" />
    </>
  ),
  file: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v5h5" />
    </>
  ),
  folder: <path d="M3 7h7l2 2h9v10H3zM3 7V5h7l2 2" />,
  image: (
    <>
      <rect height="16" rx="2" width="18" x="3" y="4" />
      <circle cx="8" cy="9" r="1.5" />
      <path d="m4 18 5-5 3 3 3-3 5 5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5m0-8h.01" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
  pause: <path d="M8 5v14m8-14v14" />,
  person: (
    <>
      <circle cx="12" cy="8" r="3" />
      <path d="M5 20c.8-3 3.2-5 7-5s6.2 2 7 5" />
    </>
  ),
  photo: (
    <>
      <rect height="16" rx="2" width="18" x="3" y="4" />
      <path d="m5 17 4-4 3 3 2-2 5 4" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="17" r="2" />
      <circle cx="18" cy="7" r="2" />
      <path d="M8 17c4 0 2-8 8-8" />
    </>
  ),
  send: <path d="m4 4 16 8-16 8 3-8zM7 12h13" />,
  video: (
    <>
      <rect height="12" rx="2" width="13" x="3" y="6" />
      <path d="m16 10 5-3v10l-5-3z" />
    </>
  ),
  warning: (
    <>
      <path d="m12 3 10 18H2z" />
      <path d="M12 9v5m0 3h.01" />
    </>
  )
};

export function Icon({
  name,
  title,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName; title?: string }) {
  return (
    <svg
      aria-hidden={title ? undefined : true}
      className="fs-icon"
      fill="none"
      focusable="false"
      role={title ? "img" : undefined}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {paths[name]}
    </svg>
  );
}
