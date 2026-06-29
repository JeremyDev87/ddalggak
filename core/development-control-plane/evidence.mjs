import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { failClosed } from "./fail-closed.mjs";
import { requireControlPlaneSafetyContract } from "./packet.mjs";

export function makeEvidence(packet, overrides = {}) {
  requireControlPlaneSafetyContract(packet);
  return {
    schema: "ddalggak.development_run_evidence.v1",
    runId: packet.runId,
    repo: packet.repo,
    repoRoot: packet.repoRoot,
    issueUrl: packet.issue.url,
    subcommand: packet.subcommand,
    evidencePolicy: "content-light",
    rawPromptStored: false,
    rawTranscriptStored: false,
    githubMutationPayloadStored: false,
    ...overrides,
  };
}

export function writeDevelopmentEvidence(packet, evidence) {
  if (!packet?.evidenceDir) {
    throw failClosed("packet evidenceDir is required before evidence write");
  }
  mkdirSync(packet.evidenceDir, { recursive: true });
  const evidencePath = path.join(packet.evidenceDir, `${packet.runId}.json`);
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  return evidencePath;
}
