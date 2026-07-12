const { cases } = await import("./test-auto-update.mjs");

let passed = 0;
for (const testCase of cases) {
  try {
    await testCase.run();
    passed += 1;
    console.log(`[PASS] ${testCase.name}`);
  } catch (error) {
    console.error(`[FAIL] ${testCase.name}`);
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  }
}

console.log(`\nSummary: ${passed}/${cases.length} auto-update cases passed.`);
