export async function record(result, analytics, errors) {
  try { await analytics(); }
  catch (error) { errors.push(error.message); }
  return result;
}
