export async function load(provider) {
  try { return await provider(); }
  catch { return []; }
}
