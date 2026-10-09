export const number = (value: number | null | undefined, digits = 0) => value == null || !Number.isFinite(Number(value)) ? "—"
  : new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits }).format(Number(value));
export const money = (value: number | null | undefined) => value == null || !Number.isFinite(Number(value)) ? "—"
  : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value));
export const percent = (value: number | null | undefined) => value == null ? "—" : `${number(value * 100, 1)}%`;
export function date(value: string | null | undefined, time = false) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", ...(time ? { timeStyle: "short" as const } : {}), timeZone: "Asia/Kolkata" }).format(parsed);
}
