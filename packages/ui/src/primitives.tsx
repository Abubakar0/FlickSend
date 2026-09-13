import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { workingBrand, type BrandIdentity } from "./brand.js";
import { classNames } from "./utils.js";

export function Text({
  as: Element = "p",
  className,
  size = "body",
  tone = "primary",
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  as?: "p" | "span" | "div";
  size?: "body" | "small" | "label" | "caption" | "code";
  tone?: "primary" | "secondary" | "muted";
}) {
  return (
    <Element
      className={classNames("fs-text", `fs-text--${size}`, `fs-text--${tone}`, className)}
      {...props}
    />
  );
}

export function Heading({
  as: Element = "h2",
  className,
  size = "section",
  ...props
}: HTMLAttributes<HTMLHeadingElement> & {
  as?: "h1" | "h2" | "h3" | "h4";
  size?: "display" | "page" | "section" | "card";
}) {
  return (
    <Element className={classNames("fs-heading", `fs-heading--${size}`, className)} {...props} />
  );
}

export function Link({ className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={classNames("fs-link", className)} {...props} />;
}

export function Separator({ className, ...props }: HTMLAttributes<HTMLHRElement>) {
  return <hr className={classNames("fs-separator", className)} {...props} />;
}

export function Surface({
  as: Element = "div",
  className,
  elevated = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { as?: "div" | "section" | "article"; elevated?: boolean }) {
  return (
    <Element
      className={classNames("fs-surface", elevated && "fs-surface--elevated", className)}
      {...props}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={classNames("fs-card", className)} {...props} />;
}

export function Stack({
  className,
  gap = "md",
  ...props
}: HTMLAttributes<HTMLDivElement> & { gap?: "xs" | "sm" | "md" | "lg" | "xl" }) {
  return <div className={classNames("fs-stack", `fs-stack--${gap}`, className)} {...props} />;
}

export function Inline({
  align = "center",
  className,
  gap = "sm",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  align?: "start" | "center" | "end";
  gap?: "xs" | "sm" | "md" | "lg";
}) {
  return (
    <div
      className={classNames("fs-inline", `fs-inline--${align}`, `fs-inline--${gap}`, className)}
      {...props}
    />
  );
}

export function Cluster({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classNames("fs-cluster", className)} {...props} />;
}

export function Container({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classNames("fs-container", className)} {...props} />;
}

export function Section({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={classNames("fs-section", className)} {...props} />;
}

export function Page({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <main className={classNames("fs-page", className)} {...props} />;
}

export function PageHeader({
  actions,
  children,
  className,
  eyebrow
}: {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  eyebrow?: ReactNode;
}) {
  return (
    <header className={classNames("fs-page-header", className)}>
      <div>
        {eyebrow ? <p className="fs-eyebrow">{eyebrow}</p> : null}
        {children}
      </div>
      {actions ? <div className="fs-page-header__actions">{actions}</div> : null}
    </header>
  );
}

export function ResponsivePanel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classNames("fs-responsive-panel", className)} {...props} />;
}

export type NavigationItem = { href: string; id: string; label: string };

export function BrandMark({
  brand = workingBrand,
  compact = false
}: {
  brand?: BrandIdentity;
  compact?: boolean;
}) {
  return (
    <div className={classNames("fs-brand-mark", compact && "fs-brand-mark--compact")}>
      <span aria-hidden="true" className="fs-brand-mark__symbol" data-brand-symbol={brand.symbol}>
        <span />
        <span />
      </span>
      <span className="fs-brand-mark__wordmark">{brand.wordmark}</span>
    </div>
  );
}

export function AppShell({
  activeId,
  brand = workingBrand,
  children,
  navigation,
  utility
}: {
  activeId?: string;
  brand?: BrandIdentity;
  children: ReactNode;
  navigation: NavigationItem[];
  utility?: ReactNode;
}) {
  return (
    <div className="fs-app-shell">
      <aside className="fs-app-shell__sidebar">
        <BrandMark brand={brand} />
        <nav aria-label="Primary navigation">
          <ul className="fs-nav-list">
            {navigation.map((item) => (
              <li key={item.id}>
                <a
                  aria-current={item.id === activeId ? "page" : undefined}
                  className="fs-nav-link"
                  href={item.href}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {utility ? <div className="fs-app-shell__utility">{utility}</div> : null}
      </aside>
      <div className="fs-app-shell__content">{children}</div>
    </div>
  );
}
