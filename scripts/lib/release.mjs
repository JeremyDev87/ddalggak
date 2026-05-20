const SEMVER_CORE = "(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)";
const PRERELEASE_IDENTIFIER = "(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)";
const PRERELEASE = `(?:-${PRERELEASE_IDENTIFIER}(?:\\.${PRERELEASE_IDENTIFIER})*)?`;
const RELEASE_TAG_PATTERN = new RegExp(`^v(?<version>${SEMVER_CORE}${PRERELEASE})$`);
const RELEASE_VERSION_PATTERN = new RegExp(
  `^(?<major>0|[1-9][0-9]*)\\.(?<minor>0|[1-9][0-9]*)\\.(?<patch>0|[1-9][0-9]*)(?:-(?<prerelease>${PRERELEASE_IDENTIFIER}(?:\\.${PRERELEASE_IDENTIFIER})*))?$`
);

export function resolveReleasePlan(tag) {
  const match = RELEASE_TAG_PATTERN.exec(tag);
  if (!match || !match.groups) {
    throw new Error("Tag must look like v1.2.3 or v1.2.3-beta.1");
  }

  const version = match.groups.version;
  const isPrerelease = version.includes("-");

  return {
    tag,
    version,
    isPrerelease,
    npmDistTag: isPrerelease ? "next" : "latest",
    githubReleaseType: isPrerelease ? "prerelease" : "release",
  };
}

function parseReleaseVersion(version) {
  const match = RELEASE_VERSION_PATTERN.exec(version);
  if (!match || !match.groups) {
    throw new Error(`Version must look like 1.2.3 or 1.2.3-beta.1: ${version}`);
  }

  return {
    major: Number(match.groups.major),
    minor: Number(match.groups.minor),
    patch: Number(match.groups.patch),
    prerelease: match.groups.prerelease ? match.groups.prerelease.split(".") : [],
  };
}

function comparePrereleaseIdentifier(left, right) {
  const leftNumeric = /^[0-9]+$/.test(left);
  const rightNumeric = /^[0-9]+$/.test(right);

  if (leftNumeric && rightNumeric) {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    return leftNumber === rightNumber ? 0 : leftNumber < rightNumber ? -1 : 1;
  }

  if (leftNumeric !== rightNumeric) {
    return leftNumeric ? -1 : 1;
  }

  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

export function compareReleaseVersions(leftVersion, rightVersion) {
  const left = parseReleaseVersion(leftVersion);
  const right = parseReleaseVersion(rightVersion);

  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) {
      return left[key] < right[key] ? -1 : 1;
    }
  }

  if (left.prerelease.length === 0 && right.prerelease.length === 0) {
    return 0;
  }

  if (left.prerelease.length === 0) {
    return 1;
  }

  if (right.prerelease.length === 0) {
    return -1;
  }

  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left.prerelease[index];
    const rightIdentifier = right.prerelease[index];

    if (leftIdentifier === undefined) {
      return -1;
    }

    if (rightIdentifier === undefined) {
      return 1;
    }

    const comparison = comparePrereleaseIdentifier(leftIdentifier, rightIdentifier);
    if (comparison !== 0) {
      return comparison;
    }
  }

  return 0;
}

export function assertReleaseUpgrade(currentVersion, nextVersion) {
  if (compareReleaseVersions(currentVersion, nextVersion) >= 0) {
    throw new Error(`Target version ${nextVersion} must be greater than current version ${currentVersion}`);
  }
}

export function createManualBumpBranchName(tag, baseRef = "master") {
  const plan = resolveReleasePlan(tag);
  const sanitizedBase = baseRef
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "base";

  return `release/bump-${sanitizedBase}-v${plan.version}`;
}

export function updatePackageManifestVersion(manifest, version) {
  return {
    ...manifest,
    version,
  };
}

export function classifyNpmLookupError(stderr) {
  const normalized = stderr.toLowerCase();

  if (
    normalized.includes("e404") ||
    normalized.includes("404 not found") ||
    normalized.includes("is not in this registry") ||
    normalized.includes("not found - get https://registry.npmjs.org/")
  ) {
    return "not-found";
  }

  return "unknown";
}

export function classifyNpmPublishError(stderr) {
  const normalized = stderr.toLowerCase();

  if (
    normalized.includes("cannot publish over the previously published versions") ||
    normalized.includes("cannot publish over existing version") ||
    normalized.includes("previously published versions") ||
    normalized.includes("you cannot publish over")
  ) {
    return "already-published";
  }

  return "unknown";
}
