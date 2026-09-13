import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { hasClerkConfiguration } from "./app/auth/config";

const configuredClerkMiddleware = hasClerkConfiguration() ? clerkMiddleware() : null;

/** Clerk owns provider session processing; individual routes still enforce account access server-side. */
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!configuredClerkMiddleware) return NextResponse.next();
  return configuredClerkMiddleware(request, event);
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)", "/__clerk/:path*"]
};
