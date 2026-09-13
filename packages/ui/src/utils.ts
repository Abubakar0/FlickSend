export type ByteUnit = "decimal" | "binary";

function assertFiniteNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError(`${name} must be a finite non-negative number`);
}

function decimal(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits,
    minimumFractionDigits: 0
  }).format(value);
}

export function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function formatBytes(bytes: number, unit: ByteUnit = "decimal"): string {
  assertFiniteNonNegative(bytes, "bytes");
  const base = unit === "decimal" ? 1000 : 1024;
  const labels =
    unit === "decimal" ? ["B", "kB", "MB", "GB", "TB"] : ["B", "KiB", "MiB", "GiB", "TiB"];
  if (bytes < base) return `${decimal(bytes, 0)} B`;
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(base)), labels.length - 1);
  const label = labels[index] ?? "B";
  return `${decimal(bytes / base ** index)} ${label}`;
}

export function formatSpeed(bytesPerSecond: number | null): string {
  if (bytesPerSecond === null) return "Unavailable";
  assertFiniteNonNegative(bytesPerSecond, "bytesPerSecond");
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatPercentage(value: number, maximum = 100): string {
  if (!Number.isFinite(value) || !Number.isFinite(maximum) || maximum <= 0)
    throw new RangeError("percentage values must be finite and maximum must be positive");
  const bounded = Math.min(Math.max((value / maximum) * 100, 0), 100);
  return `${decimal(bounded, 0)}%`;
}

export function formatDuration(milliseconds: number): string {
  assertFiniteNonNegative(milliseconds, "milliseconds");
  const totalSeconds = Math.ceil(milliseconds / 1000);
  if (totalSeconds < 60) return `${totalSeconds} sec`;
  const totalMinutes = Math.ceil(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export function formatEta(
  milliseconds: number | null,
  state: "known" | "calculating" | "unavailable" = "known"
): string {
  if (state === "calculating" || milliseconds === null) return "Calculating…";
  if (state === "unavailable") return "Unavailable";
  return milliseconds < 1000 ? "Less than a second" : formatDuration(milliseconds);
}

export function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  assertFiniteNonNegative(count, "count");
  return `${decimal(count, 0)} ${count === 1 ? singular : plural}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((part) => part.slice(0, 1).toUpperCase())
      .join("") || "?"
  );
}
