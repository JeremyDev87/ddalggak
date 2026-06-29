export function failClosed(message, details = {}) {
  const error = new Error(message);
  error.code = "DDALGGAK_CONTROL_PLANE_BLOCKED";
  error.details = details;
  return error;
}
