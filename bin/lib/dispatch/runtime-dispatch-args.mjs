// --runtime-dispatch flag parsing and control-plane entrypoint.
// zero-dep, ESM only.

import path from "node:path";
import {
  prepareDdalggakDispatchFromLiveGithubIssue,
  runDdalggakDispatchWithApproval,
} from "../../../core/development-control-plane.mjs";

// 자체 플래그 분리: --print, --show-doc, --runtime-dispatch, --
export function parseArgs(args) {
  let printMode = false;
  let showDocMode = false;
  let runtimeDispatchMode = false;
  const rest = [];
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--") {
      // 이후 모든 인자는 raw passthrough (자체 플래그 파싱 중단)
      for (let j = i + 1; j < args.length; j++) {
        rest.push(args[j]);
      }
      break;
    }
    if (arg === "--print") {
      printMode = true;
    } else if (arg === "--show-doc") {
      showDocMode = true;
    } else if (arg === "--runtime-dispatch") {
      runtimeDispatchMode = true;
    } else {
      rest.push(arg);
    }
    i++;
  }
  return { printMode, showDocMode, runtimeDispatchMode, rest };
}

export function parseRuntimeDispatchArgs(subcmd, rest) {
  const options = {
    subcommand: subcmd,
    plannedFiles: [],
    validationCommands: [],
    approvalSource: "direct",
    approval: { approved: false },
  };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    const next = () => {
      i += 1;
      if (i >= rest.length) {
        throw new Error(`${arg} requires a value`);
      }
      return rest[i];
    };
    if (arg === "--issue") options.issueRef = next();
    else if (arg === "--repo") options.repo = next();
    else if (arg === "--repo-root") options.repoRoot = next();
    else if (arg === "--planned-file") options.plannedFiles.push(next());
    else if (arg === "--validation-command") options.validationCommands.push(next());
    else if (arg === "--run-id") options.runId = next();
    else if (arg === "--evidence-dir") options.evidenceDir = next();
    else if (arg === "--approval-source") options.approvalSource = next();
    else if (arg === "--approved-by") options.approval.approvedBy = next();
    else if (arg === "--reason") options.approval.reason = next();
    else if (arg === "--workcell-approval-file") options.workcellApprovalFile = next();
    else if (arg === "--execute-approved") options.executeApproved = true;
    else throw new Error(`unknown --runtime-dispatch option: ${arg}`);
  }
  if (!options.issueRef) throw new Error("--runtime-dispatch requires --issue");
  if (!options.repoRoot) throw new Error("--runtime-dispatch requires --repo-root");
  if (!options.runId) throw new Error("--runtime-dispatch requires --run-id");
  if (options.plannedFiles.length === 0) throw new Error("--runtime-dispatch requires at least one --planned-file");
  if (options.validationCommands.length === 0) throw new Error("--runtime-dispatch requires at least one --validation-command");
  options.repoRoot = path.resolve(options.repoRoot);
  if (!options.evidenceDir) {
    options.evidenceDir = path.join(options.repoRoot, ".ddalggak", "development-runs", options.runId);
  }
  if (options.executeApproved) {
    options.approval.approved = true;
  }
  return options;
}

function writeJson(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

export function runRuntimeDispatch(subcmd, rest) {
  if (subcmd !== "start" && subcmd !== "review") {
    process.stderr.write("--runtime-dispatch is supported only for start and review\n");
    return 2;
  }
  let options;
  try {
    options = parseRuntimeDispatchArgs(subcmd, rest);
    const result = options.executeApproved
      ? runDdalggakDispatchWithApproval(options)
      : prepareDdalggakDispatchFromLiveGithubIssue(options);
    writeJson({
      status: result.evidence.status,
      evidencePath: result.evidencePath,
      workerExecuted: result.evidence.workerExecuted,
      nextAction: result.evidence.nextAction,
      issueUrl: result.packet.issue.url,
      runId: result.packet.runId,
    });
    return 0;
  } catch (error) {
    process.stderr.write(`ddalggak runtime dispatch blocked: ${error.message}\n`);
    if (error.details) {
      process.stderr.write(JSON.stringify(error.details, null, 2) + "\n");
    }
    return 1;
  }
}
