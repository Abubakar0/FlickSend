import {
  parseEnvironmentClass,
  parseExpectedOrigins,
  type FlickSendEnvironment
} from "@flicksend/config";

const minimumSecretBytes = 32;
const safeBuildVersionPattern = /^[A-Za-z0-9._-]{1,64}$/;

export type WorkerEnvironmentSource = {
  BUILD_VERSION?: string;
  ENVIRONMENT?: string;
  EXPECTED_ORIGINS?: string;
  SIGNALING_CAPABILITY_SECRET?: string;
};

export type WorkerEnvironmentConfig = Readonly<{
  environment: FlickSendEnvironment;
  expectedOrigins: readonly string[];
  version: string;
}>;

export function resolveWorkerEnvironment(
  env: WorkerEnvironmentSource
): WorkerEnvironmentConfig | null {
  const environment = parseEnvironmentClass(env.ENVIRONMENT);
  const expectedOrigins = parseExpectedOrigins(env.EXPECTED_ORIGINS);
  if (!environment || !expectedOrigins || !hasMinimumSecret(env.SIGNALING_CAPABILITY_SECRET)) return null;
  return {
    environment,
    expectedOrigins,
    version: safeBuildVersion(env.BUILD_VERSION)
  };
}

function hasMinimumSecret(value: string | undefined): boolean {
  return typeof value === "string" && new TextEncoder().encode(value).byteLength >= minimumSecretBytes;
}

function safeBuildVersion(value: string | undefined): string {
  return typeof value === "string" && safeBuildVersionPattern.test(value) ? value : "unknown";
}
