export const domain = "frontmatter";
export const checks = ["YAML frontmatter name check", "hot-path anchor presence"];

export function runFrontmatterChecks({
  skillPath,
  claudeSkillPath,
  requiredSkillHotPathAnchors,
  requiredClaudeSkillHotPathAnchors,
  verifySkillFile,
  assertForbiddenHotPathTemplateSentinels,
  readText,
}) {
  verifySkillFile(skillPath, {
    label: ".codex/skills/ddalggak/SKILL.md",
    hotPathAnchors: requiredSkillHotPathAnchors,
  });

  verifySkillFile(claudeSkillPath, {
    label: "ddalggak/SKILL.md",
    hotPathAnchors: requiredClaudeSkillHotPathAnchors,
  });

  assertForbiddenHotPathTemplateSentinels({
    label: ".codex/skills/ddalggak/SKILL.md",
    text: readText(skillPath),
  });
  assertForbiddenHotPathTemplateSentinels({
    label: "ddalggak/SKILL.md",
    text: readText(claudeSkillPath),
  });
}
