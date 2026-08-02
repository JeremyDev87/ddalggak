import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  RESULT_RELATIVE_PATH,
  runReadinessAdapter,
} from "./heimdall-readiness.mjs";

function quietStream() {
  return { write() {} };
}

const rootDir = mkdtempSync(path.join(os.tmpdir(), "ddalggak-heimdall-adapter-"));
const resultPath = path.join(rootDir, RESULT_RELATIVE_PATH);

try {
  {
    const calls = [];
    const status = runReadinessAdapter({
      rootDir,
      runProcess(command, args, options) {
        calls.push({ command, args, cwd: options.cwd });
        return { status: 0, error: null, stdout: "[PASS] fixture\n", stderr: "" };
      },
      stdout: quietStream(),
      stderr: quietStream(),
    });

    assert.equal(status, 0);
    assert.equal(readFileSync(resultPath, "utf8"), "ok\n");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, process.execPath);
    assert.deepEqual(calls[0].args, ["scripts/eval-ddalggak-readiness.mjs"]);
    assert.equal(calls[0].cwd, rootDir);
    console.log("[PASS] successful readiness run emits the deterministic Heimdall artifact");
  }

  {
    mkdirSync(path.dirname(resultPath), { recursive: true });
    writeFileSync(resultPath, "stale-pass\n", "utf8");
    const status = runReadinessAdapter({
      rootDir,
      runProcess() {
        return { status: 1, error: null, stdout: "", stderr: "fixture failed\n" };
      },
      stdout: quietStream(),
      stderr: quietStream(),
    });

    assert.equal(status, 1);
    assert.equal(existsSync(resultPath), false, "a failed run must remove a stale pass artifact");
    console.log("[PASS] failed readiness run cannot reuse a stale pass artifact");
  }

  {
    mkdirSync(path.dirname(resultPath), { recursive: true });
    writeFileSync(resultPath, "stale-pass\n", "utf8");
    assert.throws(
      () =>
        runReadinessAdapter({
          rootDir,
          runProcess() {
            return { status: null, error: new Error("launch failed"), stdout: "", stderr: "" };
          },
          stdout: quietStream(),
          stderr: quietStream(),
        }),
      /launch failed/,
    );
    assert.equal(existsSync(resultPath), false, "a launch error must remove a stale pass artifact");
    console.log("[PASS] launch errors fail closed without a result artifact");
  }
} finally {
  rmSync(rootDir, { recursive: true, force: true });
}
