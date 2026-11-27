import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchIpgaelPolicy } from "../bin/lib/auto-update.mjs";
import { readIpgaelPolicy, renderIpgaelPolicy } from "../bin/lib/ipgael-policy.mjs";

const paths = [
  new URL("../ddalggak/SKILL.md", import.meta.url),
  new URL("../.codex/skills/ddalggak/SKILL.md", import.meta.url),
];
const skills = await Promise.all(paths.map((path) => readFile(path, "utf8")));
if (skills.some((skill) => !readIpgaelPolicy(skill))) {
  throw new Error("Both SKILL.md projections must declare an ipgael policy block");
}

const cacheRoot = await mkdtemp(join(tmpdir(), "ddalggak-ipgael-sync-"));
try {
  const policy = await fetchIpgaelPolicy({ cacheRoot });
  const rendered = skills.map((skill) => renderIpgaelPolicy(skill, policy));
  for (const [index, path] of paths.entries()) {
    if (rendered[index] !== skills[index]) await writeFile(path, rendered[index]);
  }
  console.log(`ipgael policy SHA: ${policy.sha}`);
} finally {
  await rm(cacheRoot, { recursive: true, force: true });
}
