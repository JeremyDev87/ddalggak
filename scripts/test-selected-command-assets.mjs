import assert from "node:assert/strict";

import { loadCommandContracts } from "../bin/lib/command-contracts.mjs";
import * as assets from "../core/conditional-assets.mjs";

const doc = {
  command: "demo",
  source_edit_allowed: false,
  github_write_allowed: false,
  required_references: ["z-base.md", "shared.md"],
  required_templates: ["shared.md", "a-base.md"],
  conditional_references: ["alpha=z-gate.md", "beta=a-gate.md", "beta=z-gate.md", "alpha=both.md"],
  conditional_templates: ["beta=z-brief.md", "alpha=a-brief.md", "alpha=z-brief.md", "alpha=both.md", "public-body=preview.md"],
};
const union = {
  references: ["z-base.md", "shared.md", "z-gate.md", "a-gate.md", "both.md"],
  templates: ["shared.md", "a-base.md", "z-brief.md", "a-brief.md", "both.md", "preview.md"],
};

// Exercise existing behavior first: an import failure is not a regression check.
assert.deepEqual(assets.commandReferenceNames(doc), union.references);
assert.deepEqual(assets.commandTemplateNames(doc), union.templates);
console.log("[PASS] declaration unions deduplicate OR assets in required/declaration order");

for (const value of Object.values(doc)) if (Array.isArray(value)) Object.freeze(value);
Object.freeze(doc);
const active = Object.freeze(["public-body", "beta", "alpha", "beta"]);
assert.deepEqual(assets.selectCommandAssets(doc, []), {
  references: doc.required_references,
  templates: doc.required_templates,
});
assert.deepEqual(assets.selectCommandAssets(doc, ["alpha"]), {
  references: ["z-base.md", "shared.md", "z-gate.md", "both.md"],
  templates: ["shared.md", "a-base.md", "a-brief.md", "z-brief.md", "both.md"],
});
assert.deepEqual(assets.selectCommandAssets(doc, ["beta"]), {
  references: ["z-base.md", "shared.md", "a-gate.md", "z-gate.md"],
  templates: ["shared.md", "a-base.md", "z-brief.md"],
});
assert.deepEqual(assets.selectCommandAssets(doc, ["public-body"]), {
  references: doc.required_references,
  templates: ["shared.md", "a-base.md", "preview.md"],
});
assert.deepEqual(assets.selectCommandAssets(doc, active), union);
assert.deepEqual(assets.selectCommandAssets(doc, ["alpha", "beta", "public-body"]), union);
const mutableResult = assets.selectCommandAssets(doc, []);
mutableResult.references.push("caller.md");
mutableResult.templates.push("caller.md");
assert.deepEqual(assets.selectCommandAssets(doc, active), union);
console.log("[PASS] selection is pure, kind-aware, activation-bound, stable, and OR-deduplicated");

for (const invalid of [undefined, null, "alpha", new Set(["alpha"]), ["unknown"], ["alpha", "unknown"], ["ALPHA"], [true], [null], ["alpha\n"]]) {
  assert.throws(() => assets.selectCommandAssets(doc, invalid), TypeError);
}
assert.throws(() => assets.selectCommandAssets({ required_references: [], required_templates: [] }, ["public-body"]), TypeError);
console.log("[PASS] unknown and malformed active tokens fail closed, including undeclared public-body");

for (const kind of ["references", "templates"]) {
  const required = `required_${kind}`;
  const conditional = `conditional_${kind}`;
  for (const invalid of ["../gate.md", "nested/gate.md", "nested\\gate.md", "/gate.md", "gate.txt", "gate.MD", "gate.md\n", "gate.md\r", "gate..md", ".gate.md", "", null, 1]) {
    assert.throws(() => assets.selectCommandAssets({ ...doc, [required]: [invalid] }, []), TypeError);
    assert.throws(() => assets.selectCommandAssets({ ...doc, [conditional]: [`inactive=${invalid}`] }, []), TypeError);
  }
  for (const invalid of [null, false, "gate.md", {}]) {
    assert.throws(() => assets.selectCommandAssets({ ...doc, [required]: invalid }, []), TypeError);
    assert.throws(() => assets.selectCommandAssets({ ...doc, [conditional]: invalid }, []), TypeError);
  }
  for (const patch of [
    { [required]: ["duplicate.md", "duplicate.md"] },
    { [conditional]: ["inactive=gate.md", "inactive=gate.md"] },
    { [conditional]: ["inactive=shared.md"] },
    { [conditional]: ["bad\n=gate.md"] },
  ]) {
    assert.throws(() => assets.selectCommandAssets({ ...doc, ...patch }, []), TypeError);
  }
  const otherKind = kind === "references" ? "templates" : "references";
  const crossKind = { required_references: [], required_templates: [], [required]: ["same.md"], [`conditional_${otherKind}`]: ["alpha=same.md"] };
  assert.deepEqual(assets.selectCommandAssets(crossKind, ["alpha"]), { references: ["same.md"], templates: ["same.md"] });
}
console.log("[PASS] both kinds reject malformed basenames/lists, duplicates, and same-kind overlaps even when inactive");

for (const valid of ["review", "gjc-plan", "a1", "0"]) {
  assert.equal(assets.commandContractReference(valid), `command-${valid}.md`);
}
for (const invalid of ["", "../review", "review.md", "Review", "-review", "review-", "review--plan", "review/plan", "review\\plan", "review_plan", "review\n", "review\r", null, undefined, 1]) {
  assert.throws(() => assets.commandContractReference(invalid), TypeError);
}
console.log("[PASS] command contract filenames are lowercase kebab-case basenames only");

const commands = loadCommandContracts(process.cwd());
assert.equal(commands.length, 21);
for (const command of commands) {
  assert.equal(assets.commandContractReference(command.command), `command-${command.command}.md`);
  assert.deepEqual(assets.selectCommandAssets(command, []), {
    references: command.required_references,
    templates: command.required_templates,
  });
  const activations = [...new Set([...(command.conditional_references || []), ...(command.conditional_templates || [])].map((spec) => spec.split("=")[0]))];
  assert.deepEqual(assets.selectCommandAssets(command, activations), {
    references: assets.commandReferenceNames(command),
    templates: assets.commandTemplateNames(command),
  });
  for (const activation of activations) {
    const expected = {};
    for (const kind of ["references", "templates"]) {
      expected[kind] = [...new Set([
        ...command[`required_${kind}`],
        ...(command[`conditional_${kind}`] || []).filter((spec) => spec.split("=")[0] === activation).map((spec) => spec.split("=")[1]),
      ])];
    }
    assert.deepEqual(assets.selectCommandAssets(command, [activation]), expected);
  }
}
console.log("[PASS] all 21 real contracts preserve base, individual activation, and union results");

const review = commands.find((command) => command.command === "review");
const publicBodyReferences = ["review-output-contract.md", "review-comment-style.md"];
assert.deepEqual(assets.selectCommandAssets(review, ["public-body"]), {
  references: [...review.required_references, ...publicBodyReferences],
  templates: review.required_templates,
});
for (const activation of [[], ["code-shape"], ["delegated-review"], ["accepted-critical-high-fix"]]) {
  const selected = assets.selectCommandAssets(review, activation);
  for (const reference of publicBodyReferences) assert(!selected.references.includes(reference));
}
for (const command of commands.filter((command) => command.command !== "review")) {
  assert.throws(() => assets.selectCommandAssets(command, ["public-body"]), TypeError);
}
assert.equal(review.source_edit_allowed, true);
assert.equal(review.github_write_allowed, true);
console.log("[PASS] public-body selects both renderer contracts only for review, not internal or unrelated activations");
console.log("\n[test:selected-command-assets] passed");
