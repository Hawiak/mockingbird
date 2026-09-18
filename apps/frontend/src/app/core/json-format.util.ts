/** Returns true when `text` parses as JSON. */
export function isJsonString(text: string | undefined | null): boolean {
  if (!text || !text.trim()) return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** Pretty-prints `text` as JSON with 2-space indentation; returns it unchanged if it isn't valid JSON. */
export function formatJson(text: string | undefined | null): string {
  if (!text) return '';
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
