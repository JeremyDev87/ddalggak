import { readFileSync } from "node:fs";

export function readText(path) {
  return readFileSync(path, "utf8");
}

export function readJson(path) {
  return JSON.parse(readText(path));
}

export function readWorkflow(name) {
  return readText(`.github/workflows/${name}.yml`);
}

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function assertIncludes(text, expected, message) {
  assert(
    text.includes(expected),
    `${message}: expected to include ${JSON.stringify(expected)}`,
  );
}

export function assertMatches(text, pattern, message) {
  assert(pattern.test(text), `${message}: expected to match ${pattern}`);
}

export function assertBefore(text, first, second, message) {
  const firstIndex = text.indexOf(first);
  const secondIndex = text.indexOf(second);
  assert(firstIndex !== -1, `${message}: missing first marker ${JSON.stringify(first)}`);
  assert(secondIndex !== -1, `${message}: missing second marker ${JSON.stringify(second)}`);
  assert(firstIndex < secondIndex, message);
}
