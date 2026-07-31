import assert from "node:assert/strict";
import { validatePublicContent } from "./review-contract-policy.mjs";

const delimiters = [":", "\uFE13", "\uFE55", "\uFF1A", "=", "\u207C", "\u208C", "\uFE66", "\uFF1D"];
const locatorSuffixes = [
  "https://private.example/repository",
  "private.example/repository",
  "git@private.example:repository",
];

const separators = [];
for (let codePoint = 0; codePoint <= 0x10ffff; codePoint += 1) {
  const scalar = String.fromCodePoint(codePoint);
  if (/\p{Assigned}/u.test(scalar) && /[^\p{L}\p{N}]/u.test(scalar)) separators.push(scalar);
}
const sessionSeparators = separators;

let sessionProbes = 0;
for (const separator of sessionSeparators) {
  for (const delimiter of delimiters) {
    assert.throws(
      () => validatePublicContent(`sess${separator}ion-id${delimiter}[REDACTED]`),
      /prohibited public pattern:/,
    );
    sessionProbes += 1;
  }
}

let locatorProbes = 0;
for (const prefix of separators) {
  for (const suffix of locatorSuffixes) {
    assert.throws(
      () => validatePublicContent(`${prefix}${suffix}`),
      /prohibited public pattern:/,
    );
    locatorProbes += 1;
  }
}

console.log(
  `[test-review-contract-exhaustive] passed: ${sessionSeparators.length} session separators, ${separators.length} locator boundaries, ${sessionProbes} obfuscated session probes, ${locatorProbes} raw/NFKC locator probes`,
);
