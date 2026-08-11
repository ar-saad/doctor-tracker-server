/**
 * Query-string helpers shared by every list endpoint (doctors now, patients in
 * Phase 4). Kept out of the controllers so pagination, search and date-range
 * semantics are defined once and behave identically across resources.
 *
 * Nothing in here throws: a nonsense ?page=abc falls back to the default rather
 * than 400-ing a dashboard that is only trying to render a table.
 */

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 50;

export interface Pagination {
  page: number;
  limit: number;
  skip: number;
}

export interface DateRange {
  $gte?: Date;
  $lte?: Date;
}

/** Express hands query values as string | string[] | ParsedQs — only take scalars. */
export function queryString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(queryString(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * limit is clamped rather than rejected: ?limit=1000 returns 50, so a caller
 * can never make the API pull an unbounded result set into memory.
 */
export function parsePagination(query: Record<string, unknown>): Pagination {
  const page = toPositiveInt(query.page, 1);
  const limit = Math.min(
    toPositiveInt(query.limit, DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );

  return { page, limit, skip: (page - 1) * limit };
}

/**
 * User input goes straight into a $regex, so metacharacters must be neutralised
 * — otherwise "c++" is an invalid pattern (500) and "(a+)+$" is a ReDoS.
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Case-insensitive partial match across several fields, as an $or clause.
 * Regex (not a $text index) because the requirement is substring matching:
 * "car" has to find "Cardiology", which $text cannot do — it matches whole
 * stemmed words only.
 */
export function buildSearchFilter(
  search: string,
  fields: readonly string[],
): Record<string, unknown>[] {
  const matcher = { $regex: escapeRegex(search), $options: "i" };
  return fields.map((field) => ({ [field]: matcher }));
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: string, endOfDay: boolean): Date | undefined {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  // "2026-08-11" parses as that day's UTC midnight, which as an end bound would
  // exclude everything created during the day itself. Push a date-only value to
  // the last millisecond of the same UTC day so the range is inclusive. A full
  // ISO timestamp is taken as given — the caller already chose the instant.
  if (endOfDay && DATE_ONLY.test(value)) {
    date.setUTCHours(23, 59, 59, 999);
  }

  return date;
}

/** Mongo range filter for a date field; undefined when neither bound is usable. */
export function buildDateRange(
  startDate: string | undefined,
  endDate: string | undefined,
): DateRange | undefined {
  const range: DateRange = {};

  const start = startDate ? parseDate(startDate, false) : undefined;
  if (start) {
    range.$gte = start;
  }

  const end = endDate ? parseDate(endDate, true) : undefined;
  if (end) {
    range.$lte = end;
  }

  return range.$gte || range.$lte ? range : undefined;
}
