import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractMarkdownSection } from './lib/markdown-links.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const keys = ['check', 'clean', 'forge', 'getwiki', 'gjc-execute', 'gjc-plan', 'gjc-team', 'issue', 'plan', 'prompt', 'retro', 'review', 'setwiki', 'ship', 'spark', 'start', 'status', 'tune', 'ulw-loop', 'ulw-plan', 'ulw-research'];
const headings = {
  claude: { start: 'Start Workflow', review: 'Cross-Review Loop', status: 'Status', plan: 'Issue-Ready Plan', issue: 'Plan to Issues', clean: 'Merge Cleanup', ship: 'Ship', retro: 'Retrospective', prompt: 'Prompt Optimizer', tune: 'Tune Goal Brief', forge: 'Forge Acceptance Criteria', spark: 'Spark Runtime Goal', check: 'Local Diff Check', getwiki: 'GetWiki Bridge', setwiki: 'SetWiki Bridge', 'ulw-loop': 'ULW Loop', 'ulw-plan': 'ULW Plan', 'ulw-research': 'ULW Research', 'gjc-plan': 'Gajae-Code Delegation', 'gjc-execute': 'Gajae-Code Delegation', 'gjc-team': 'Gajae-Code Delegation' },
  codex: { start: '`start` - Issue-Based Implementation', review: '`review` - Cross-Review Loop', status: '`status` - Current State Snapshot', plan: '`plan` - Issue-Ready Plan', issue: '`issue` - Plan To GitHub Issues', clean: '`clean` - Post-Merge Cleanup', ship: '`ship` - Publish Current Lane', retro: '`retro` - Retrospective', prompt: '`prompt` - Prompt Optimizer', tune: '`tune` - Tune Goal Brief', forge: '`forge` - Forge Acceptance Criteria', spark: '`spark` - Spark Runtime Goal', check: '`check` - Local Diff Check', getwiki: 'GetWiki Bridge', setwiki: 'SetWiki Bridge', 'ulw-loop': '`ulw-loop` - ULW Loop', 'ulw-plan': '`ulw-plan` - ULW Plan', 'ulw-research': '`ulw-research` - ULW Research', 'gjc-plan': '`gjc-plan` / `gjc-execute` / `gjc-team` - Gajae-Code Delegation', 'gjc-execute': '`gjc-plan` / `gjc-execute` / `gjc-team` - Gajae-Code Delegation', 'gjc-team': '`gjc-plan` / `gjc-execute` / `gjc-team` - Gajae-Code Delegation' },
};
function validate(text, locale) {
  const found = [...text.matchAll(/^# ([a-z0-9]+(?:-[a-z0-9]+)*)\s*$/gm)].map((m) => m[1]).sort();
  assert.deepEqual(found, keys, `${locale}: command keys`);
  for (const key of keys) {
    const section = extractMarkdownSection(text, key, { level: 1 });
    assert(section, `${locale}: missing ${key}`);
    assert.equal((section.match(/^# /gm) ?? []).length, 1, `${locale}: duplicate ${key}`);
    assert(section.includes(`## ${headings[locale][key]}`), `${locale}: missing required H2 for ${key}`);
  }
}
const source = fs.readFileSync(path.join(root, 'core/command-docs/claude.md'), 'utf8');
validate(source, 'claude');
validate(fs.readFileSync(path.join(root, 'core/command-docs/codex.md'), 'utf8'), 'codex');
const mutations = {
  'unknown key': source.replace(/^# start$/m, '# unknown'),
  'missing key': source.replace(/^# start\n\n## /m, '## '),
  'duplicate key': source.replace(/^# start$/m, '# start\n\n# start'),
  'missing locale H2': source.replace(/^## Start Workflow$/m, '## Wrong heading'),
};
for (const [name, fixture] of Object.entries(mutations)) assert.throws(() => validate(fixture, 'claude'), /command keys|missing required H2|duplicate/ , name);
console.log(JSON.stringify({ locales: 2, keys: keys.length, mutations: Object.keys(mutations) }));
