export function quantities(input) {
  if (!Array.isArray(input) || input.some(value => !Number.isInteger(value) || value < 0)) {
    return { status: 400, body: { error: "invalid-quantities" } };
  }
  return { status: 200, body: { total: input.reduce((sum, value) => sum + value, 0) } };
}
