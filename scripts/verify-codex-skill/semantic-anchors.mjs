export const domain = "semantic-anchors";
export const checks = ["reference anchor contracts", "gate stage headings", "section-scoped anchors"];

export function runSemanticAnchorChecks({
  referenceAnchorContracts,
  verifyReferenceAnchorContract,
  gateStageHeadingReferenceContracts,
  skillDir,
  rootDir,
  path,
  statSync,
  fail,
  assertStageHeadings,
  readText,
  requiredDisclosureAssetPaths,
  assertSubstantiveSectionBodies,
  assertSectionScopedAnchors,
  parseMarkdownSections,
  routerReferencePaths,
  evidenceReferencePaths,
  frontendDesignReferencePaths,
  vercelAgentSkillsReferencePaths,
  gateActivationKeywordContracts,
  assertGateActivationKeywordContract,
  requiredRouterGateFamilies,
  routerGateFamilies,
}) {
  for (const contract of referenceAnchorContracts) {
    verifyReferenceAnchorContract(contract);
  }

  for (const contract of gateStageHeadingReferenceContracts) {
    const referencePaths = [
      path.join(skillDir, contract.reference),
      path.join(rootDir, "ddalggak", contract.reference),
    ];
    for (const referencePath of referencePaths) {
      const label = path.relative(rootDir, referencePath);
      if (!statSync(referencePath, { throwIfNoEntry: false })?.isFile()) {
        fail(`${label} must exist for canonical gate stage-heading verification.`);
        continue;
      }
      assertStageHeadings({ label, text: readText(referencePath), stages: contract.stages });
    }
  }

  const gateActivationReferencePathsByFile = new Map([
    ["frontend-design-gate.md", frontendDesignReferencePaths],
    ["vercel-agent-skills-gates.md", vercelAgentSkillsReferencePaths],
  ]);
  for (const [gateFamily, contract] of Object.entries(gateActivationKeywordContracts)) {
    const gateReferencePaths = gateActivationReferencePathsByFile.get(contract.referenceFile) || [];
    for (const [index, routerReferencePath] of routerReferencePaths.entries()) {
      const gateReferencePath = gateReferencePaths[index];
      if (
        !gateReferencePath ||
        !statSync(routerReferencePath, { throwIfNoEntry: false })?.isFile() ||
        !statSync(gateReferencePath, { throwIfNoEntry: false })?.isFile()
      ) {
        continue;
      }
      assertGateActivationKeywordContract({
        gateFamily,
        contract,
        routerText: readText(routerReferencePath),
        gateReferenceText: readText(gateReferencePath),
      });
    }
  }

  const substantiveSectionReferencePaths = [
    ...new Set([
      ...requiredDisclosureAssetPaths()
        .filter((assetPath) => assetPath.includes("/references/"))
        .map((assetPath) => path.join(rootDir, assetPath)),
      ...referenceAnchorContracts.flatMap((contract) => contract.referencePaths),
    ]),
  ];
  for (const referencePath of substantiveSectionReferencePaths) {
    if (!statSync(referencePath, { throwIfNoEntry: false })?.isFile()) {
      continue;
    }
    assertSubstantiveSectionBodies({
      label: path.relative(rootDir, referencePath),
      fileName: path.basename(referencePath),
      text: readText(referencePath),
    });
  }

  const referenceSectionAnchorContracts = [
    {
      referencePaths: routerReferencePaths,
      sections: [
        {
          heading: "Gate Families",
          anchors: requiredRouterGateFamilies.map((gateFamily) => `\`${gateFamily}\``),
        },
        {
          heading: "Required Reference Mapping",
          anchors: [...new Set(routerGateFamilies.map((family) => `\`${family.reference}\``))],
        },
        {
          heading: "Priority Order",
          anchors: ["This priority is exact"],
        },
      ],
    },
    {
      referencePaths: evidenceReferencePaths,
      sections: [
        {
          heading: "Evidence Templates",
          anchors: [
            "UI/design/frontend",
            "Deploy/release/env",
            "Performance",
            "Bugfix/regression",
            "Security/auth/privacy",
            "Data/API/backend",
          ],
        },
        {
          heading: "Missing Evidence Severity",
          anchors: ["not-applicable: <reason>", "High"],
        },
        {
          heading: "Approval Rule",
          anchors: ["APPROVE", "not-applicable: <reason>"],
        },
      ],
    },
  ];
  for (const { referencePaths, sections } of referenceSectionAnchorContracts) {
    for (const referencePath of referencePaths) {
      if (!statSync(referencePath, { throwIfNoEntry: false })?.isFile()) {
        continue;
      }
      const label = path.relative(rootDir, referencePath);
      const parsedSections = parseMarkdownSections(readText(referencePath));
      for (const { heading, anchors } of sections) {
        assertSectionScopedAnchors({ label, parsedSections, heading, anchors });
      }
    }
  }
}
