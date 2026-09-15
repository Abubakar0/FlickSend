import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { externalP13Status, runP13Qualification } from "../p13/run-qualification.mjs";
import { externalP14Status, runP14Qualification } from "../p14/run-qualification.mjs";

export function combinedExternalStatus(p13Environment = process.env, p14Environment = process.env) {
  const p13 = externalP13Status(p13Environment);
  const p14 = externalP14Status(p14Environment);
  if (p13.externalStatus === "BLOCKED" || p14.externalStatus === "BLOCKED")
    return {
      blockedReason: "P13_AND_P14_EXTERNAL_QUALIFICATION_NOT_EXECUTED",
      externalStatus: "BLOCKED"
    };
  return { externalStatus: "PASS" };
}

export function runP13P14Qualification() {
  const p13 = runP13Qualification();
  const p14 = runP14Qualification();
  const result = {
    ...combinedExternalStatus(),
    p13RepositoryStatus: p13.repositoryStatus,
    p14RepositoryStatus: p14.repositoryStatus,
    phase: "P13_P14",
    repositoryStatus:
      p13.repositoryStatus === "PASS" && p14.repositoryStatus === "PASS" ? "PASS" : "FAIL"
  };
  console.log(JSON.stringify(result));
  if (result.repositoryStatus === "FAIL") process.exitCode = 1;
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  runP13P14Qualification();
