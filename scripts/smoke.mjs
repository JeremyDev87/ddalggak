const suites = [
  ["test-cli-basics", () => import("./test-cli-basics.mjs")],
  ["test-setup", () => import("./test-setup.mjs")],
  ["test-status", () => import("./test-status.mjs")],
  ["test-doctor", () => import("./test-doctor.mjs")],
  ["test-runtime-dispatch", () => import("./test-runtime-dispatch.mjs")],
];

let passed = 0;
let total = 0;
const failures = [];

for (const [suiteName, loadSuite] of suites) {
  const { cases } = await loadSuite();
  for (const testCase of cases) {
    total += 1;
    try {
      await testCase.run();
      passed += 1;
      console.log(`[PASS] ${suiteName}: ${testCase.name}`);
    } catch (error) {
      failures.push({ suiteName, name: testCase.name, error });
      console.error(`[FAIL] ${suiteName}: ${testCase.name}`);
      console.error(error && error.stack ? error.stack : String(error));
    }
  }
}

console.log(`\nSummary: ${passed}/${total} smoke cases passed.`);

if (failures.length > 0) {
  process.exitCode = 1;
}
