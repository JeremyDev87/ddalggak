export function quantities(input) {
  return { status: 200, body: { total: Array.isArray(input) ? input.length : 0 } };
}
