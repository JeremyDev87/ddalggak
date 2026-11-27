const POLICY_MARKER = "ddalggak:ipgael-policy";
const POLICY_BLOCK = /^<!-- ddalggak:ipgael-policy ([a-f0-9]{40}) -->\n([\s\S]*?)^<!-- \/ddalggak:ipgael-policy -->$/gm;
const MAX_POLICY_BYTES = 64 * 1024;
export const IPGAEL_POLICY_TOKEN_BUDGET = 1800;

export function estimateTextTokens(text) {
  let tokens = 0;
  for (const char of text) tokens += char.codePointAt(0) <= 0x7f ? 0.25 : 1.5;
  return tokens;
}

export function validateIpgaelPolicy(sha, bytes) {
  if (typeof sha !== "string" || !/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error("Invalid ipgael policy SHA");
  }
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > MAX_POLICY_BYTES) {
    throw new Error("Invalid ipgael policy size");
  }
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  if (!text.startsWith("# 입갤 응답 정책\n") || !text.endsWith("\n") || /[\r\0]/.test(text)) {
    throw new Error("Invalid ipgael policy format");
  }
  if (text.includes(POLICY_MARKER)) {
    throw new Error("Ipgael policy contains projection markers");
  }
  if (estimateTextTokens(text) > IPGAEL_POLICY_TOKEN_BUDGET) {
    throw new Error("Ipgael policy exceeds token budget");
  }
  return { sha, text };
}

export function readIpgaelPolicy(skillText) {
  if (!skillText.includes(POLICY_MARKER)) return null;
  const matches = [...skillText.matchAll(POLICY_BLOCK)];
  if (matches.length !== 1 || skillText.split(POLICY_MARKER).length !== 3) {
    throw new Error("Invalid ipgael policy projection");
  }
  return validateIpgaelPolicy(matches[0][1], Buffer.from(matches[0][2], "utf8"));
}

export function renderIpgaelPolicy(skillText, policy) {
  if (!readIpgaelPolicy(skillText)) return skillText;
  const { sha, text } = validateIpgaelPolicy(policy.sha, Buffer.from(policy.text, "utf8"));
  return skillText.replace(POLICY_BLOCK, () => `<!-- ddalggak:ipgael-policy ${sha} -->\n${text}<!-- /ddalggak:ipgael-policy -->`);
}
