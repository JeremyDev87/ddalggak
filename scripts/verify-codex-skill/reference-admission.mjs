export const domain = "reference-admission";
export const checks = ["required disclosure assets", "template fields", "package dry-run inclusion"];

export function runReferenceAdmissionChecks({
  skillPayloadRoots,
  requiredIssueTemplateFields,
  requiredEpicTemplateFields,
  assertRequiredDisclosureAssetsExist,
  assertRequiredReferenceAdmissionHeaders,
  assertSubcommandExecutionContracts,
  assertPackageArtifactIncludes,
  assertTemplateRequiredFields,
}) {
  assertRequiredDisclosureAssetsExist();
  assertRequiredReferenceAdmissionHeaders();
  assertSubcommandExecutionContracts();
  assertPackageArtifactIncludes();

  for (const root of skillPayloadRoots) {
    assertTemplateRequiredFields({
      label: root,
      relativePath: `${root}/templates/issue-body.md`,
      fields: requiredIssueTemplateFields,
    });
    assertTemplateRequiredFields({
      label: root,
      relativePath: `${root}/templates/epic-body.md`,
      fields: requiredEpicTemplateFields,
    });
  }
}
