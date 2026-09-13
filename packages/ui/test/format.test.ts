import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatCount,
  formatDuration,
  formatEta,
  formatPercentage,
  formatSpeed,
  getHealthPresentation,
  getTransferStatusPresentation
} from "../src/index.js";

describe("presentation formatters", () => {
  it("formats large transfer values without false precision", () => {
    expect(formatBytes(184_000_000_000)).toBe("184 GB");
    expect(formatSpeed(12_400_000)).toBe("12.4 MB/s");
    expect(formatPercentage(67.4)).toBe("67%");
  });

  it("formats count labels with correct singular and plural forms", () => {
    expect(formatCount(1, "file")).toBe("1 file");
    expect(formatCount(23_421, "file")).toBe("23,421 files");
    expect(formatCount(1, "folder")).toBe("1 folder");
  });

  it("never represents unknown ETA as zero seconds", () => {
    expect(formatEta(null)).toBe("Calculating…");
    expect(formatEta(0)).toBe("Less than a second");
    expect(formatEta(5_820_000)).toBe("1h 37m");
    expect(formatDuration(5_820_000)).toBe("1h 37m");
  });
});

describe("product presentation mappings", () => {
  it("keeps reconnecting separate from terminal failure", () => {
    expect(getTransferStatusPresentation("RECONNECTING")).toMatchObject({
      label: "Reconnecting",
      tone: "recovering"
    });
    expect(getTransferStatusPresentation("FAILED")).toMatchObject({
      label: "Needs attention",
      tone: "danger"
    });
  });

  it("only renders completed when an explicit product state is supplied", () => {
    expect(getTransferStatusPresentation("COMPLETED")).toMatchObject({
      label: "Completed",
      tone: "success"
    });
    expect(getTransferStatusPresentation("VERIFYING")).toMatchObject({
      label: "Verifying",
      tone: "info"
    });
  });

  it("softens unknown health rather than naming an unsupported bottleneck", () => {
    expect(getHealthPresentation("NOT_ENOUGH_INFORMATION")).toMatchObject({
      label: "Not enough information yet",
      tone: "neutral"
    });
  });
});
