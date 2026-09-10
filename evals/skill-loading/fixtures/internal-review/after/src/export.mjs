export function exportData(data, writeSettings) {
  writeSettings({ exported: true });
  return JSON.stringify(data);
}
