const allowedPrefixes = ["/account", "/people", "/send", "/transfers"] as const;

/** Returns a local sender-account route only; unsafe values always fall back to Send. */
export function safeReturnPath(candidate: string | null | undefined, fallback = "/send"): string {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) return fallback;
  try {
    const parsed = new URL(candidate, "https://flicksend.invalid");
    if (parsed.origin !== "https://flicksend.invalid") return fallback;
    if (
      !allowedPrefixes.some(
        (prefix) => parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`)
      )
    )
      return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function signInPath(returnTo: string): string {
  return `/sign-in?returnTo=${encodeURIComponent(safeReturnPath(returnTo))}`;
}
