import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = await readFile(resolve(process.cwd(), "src/styles.css"), "utf8");

function tokenBlock(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  const end = css.indexOf("}", start);
  if (start < 0 || end < 0) throw new Error(`Missing token scope: ${selector}`);
  return Object.fromEntries(
    [...css.slice(start, end).matchAll(/--(fs-[\w-]+):\s*(#[0-9a-f]{6})/gi)].map((match) => [
      `--${match[1]}`,
      match[2]
    ])
  );
}

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channels = hex
      .slice(1)
      .match(/../g)
      ?.map((channel) => Number.parseInt(channel, 16) / 255);
    if (!channels || channels.length !== 3) throw new Error(`Invalid color: ${hex}`);
    const [red, green, blue] = channels.map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    );
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("design token contract", () => {
  const light = tokenBlock(":root {");
  const dark = tokenBlock(':root[data-theme="dark"] {');

  it("defines the semantic color and system-token coverage required by P3", () => {
    for (const token of [
      "--fs-canvas",
      "--fs-surface",
      "--fs-surface-elevated",
      "--fs-text-primary",
      "--fs-text-secondary",
      "--fs-text-muted",
      "--fs-border-default",
      "--fs-accent",
      "--fs-success",
      "--fs-warning",
      "--fs-danger",
      "--fs-info",
      "--fs-focus-ring",
      "--fs-disabled",
      "--fs-font-sans",
      "--fs-space-4",
      "--fs-radius-md",
      "--fs-shadow-overlay",
      "--fs-motion-normal",
      "--fs-z-overlay",
      "--fs-container",
      "--fs-control-md"
    ]) {
      expect(css).toContain(token);
    }
    expect(dark["--fs-canvas"]).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("keeps reviewed semantic text pairs at the P3 contrast target", () => {
    for (const [foreground, background] of [
      ["--fs-text-primary", "--fs-canvas"],
      ["--fs-text-secondary", "--fs-surface"],
      ["--fs-text-muted", "--fs-surface"],
      ["--fs-on-accent", "--fs-accent"],
      ["--fs-disabled", "--fs-disabled-surface"],
      ["--fs-success", "--fs-success-soft"],
      ["--fs-warning", "--fs-warning-soft"],
      ["--fs-danger", "--fs-danger-soft"],
      ["--fs-info", "--fs-info-soft"]
    ]) {
      expect(
        contrastRatio(light[foreground] ?? "", light[background] ?? "")
      ).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(dark[foreground] ?? "", dark[background] ?? "")).toBeGreaterThanOrEqual(
        4.5
      );
    }
    expect(
      contrastRatio(light["--fs-focus-ring"] ?? "", light["--fs-surface"] ?? "")
    ).toBeGreaterThanOrEqual(3);
    expect(
      contrastRatio(dark["--fs-focus-ring"] ?? "", dark["--fs-surface"] ?? "")
    ).toBeGreaterThanOrEqual(3);
  });

  it("contains intentional system-color and reduced-motion behavior", () => {
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(css).toContain(":root:not([data-theme])");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("transition-duration: 1ms !important");
  });
});
