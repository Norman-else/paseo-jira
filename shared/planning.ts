export function parseStoryPoints(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) || !Number.isFinite(Number(text))) {
    throw new Error("Enter a non-negative number, or leave blank to clear the estimate.");
  }
  return Number(text);
}

export function formatSprintDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseSprintDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) throw new Error("Use YYYY-MM-DD HH:mm for both dates.");
  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute) {
    throw new Error("Enter a valid local date and time.");
  }
  return date.toISOString();
}
