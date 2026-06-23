const SECRET_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9_]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /(?:bearer|token|secret|password|authorization)\s*[:=]\s*[^\s,)]+/gi,
  /[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|AUTHORIZATION)[A-Z0-9_]*\s*[:=]\s*[^\s,)]+/g,
];
const SECRET_QUERY_KEYS = /(?:token|secret|password|authorization|signature|sig|key|access_token|client_secret)/i;

export function sanitizeText(value) {
  if (value === null || value === undefined) {
    return null;
  }
  let text = String(value);
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, "[REDACTED]");
  }
  return text;
}

export function sanitizeUrl(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const original = String(value);
  try {
    const url = new URL(original);
    url.username = sanitizeText(url.username) || "";
    url.password = url.password ? "[REDACTED]" : "";
    url.pathname = sanitizeText(url.pathname) || "";
    for (const [key, paramValue] of [...url.searchParams.entries()]) {
      if (SECRET_QUERY_KEYS.test(key)) {
        url.searchParams.set(key, "[REDACTED]");
      } else {
        url.searchParams.set(key, sanitizeText(paramValue) || "");
      }
    }
    return url.toString();
  } catch {
    return sanitizeText(original);
  }
}
