import type { ButtonHTMLAttributes, ReactNode } from "react";
import { classNames } from "./utils.js";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  loading?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
};

export function Button({
  children,
  className,
  disabled = false,
  loading = false,
  size = "md",
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      aria-busy={loading || undefined}
      className={classNames("fs-button", `fs-button--${variant}`, `fs-button--${size}`, className)}
      disabled={disabled || loading}
      type={type}
      {...props}
    >
      {loading ? <span aria-hidden="true" className="fs-button__spinner" /> : null}
      <span>{children}</span>
    </button>
  );
}

export type IconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "aria-label"
> & {
  "aria-label": string;
  children: ReactNode;
  size?: ButtonSize;
  variant?: ButtonVariant;
};

export function IconButton({
  children,
  className,
  size = "md",
  type = "button",
  variant = "ghost",
  ...props
}: IconButtonProps) {
  return (
    <button
      className={classNames(
        "fs-icon-button",
        `fs-icon-button--${variant}`,
        `fs-icon-button--${size}`,
        className
      )}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
