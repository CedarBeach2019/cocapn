/**
 * Cron Parser - 5-field cron expression parser
 *
 * Parses standard 5-field cron expressions and calculates next run times.
 * Supports: wildcard, ranges (n-m), steps (star/n), lists (n,m,o), and shortcuts (@daily, etc.)
 */

/** Cron shortcut mappings */
const CRON_SHORTCUTS: Record<string, string> = {
  '@yearly':   '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly':  '0 0 1 * *',
  '@weekly':   '0 0 * * 0',
  '@daily':    '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly':   '0 * * * *',
};

/** Field ranges: [min, max] */
const FIELD_RANGES: [number, number][] = [
  [0, 59],  // minute
  [0, 23],  // hour
  [1, 31],  // day of month
  [1, 12],  // month
  [0, 7],   // day of week (0 and 7 = Sunday)
];

/** Expand a cron shortcut to a standard 5-field expression */
export function expandShortcut(expr: string): string {
  const trimmed = expr.trim();
  if (trimmed.startsWith('@') && CRON_SHORTCUTS[trimmed]) {
    return CRON_SHORTCUTS[trimmed];
  }
  return trimmed;
}

/** Validate a single cron field value */
function validateField(field: string, min: number, max: number): boolean {
  if (!field) return false;
  if (field === '*') return true;

  // Step: */n
  const stepOnly = field.match(/^\*\/(\d+)$/);
  if (stepOnly) return parseInt(stepOnly[1]) > 0;

  // Range with step: n-m/x
  const rangeStep = field.match(/^(\d+)-(\d+)\/(\d+)$/);
  if (rangeStep) {
    const [, s, e, x] = rangeStep.map(Number);
    return s >= min && e <= max && s <= e && x > 0;
  }

  // Range: n-m
  const range = field.match(/^(\d+)-(\d+)$/);
  if (range) {
    const [, s, e] = range.map(Number);
    return s >= min && e <= max && s <= e;
  }

  // List: n,m,o
  if (field.includes(',')) {
    return field.split(',').every(item => {
      const n = parseInt(item.trim());
      return !isNaN(n) && n >= min && n <= max;
    });
  }

  // Single number
  const n = parseInt(field);
  return !isNaN(n) && n >= min && n <= max;
}

/** Validate a 5-field cron expression or shortcut */
export function validateCronExpression(expr: string): boolean {
  if (!expr || typeof expr !== 'string') return false;

  const expanded = expandShortcut(expr);
  const parts = expanded.split(/\s+/);
  if (parts.length !== 5) return false;

  return parts.every((part, i) => {
    const [min, max] = FIELD_RANGES[i];
    return validateField(part, min, max);
  });
}

/** Check if a numeric value matches a cron field spec */
function matchesField(value: number, field: string, min: number, _max: number): boolean {
  if (field === '*') return true;

  // Step: */n
  const stepOnly = field.match(/^\*\/(\d+)$/);
  if (stepOnly) {
    const step = parseInt(stepOnly[1]);
    return value % step === min;
  }

  // Range with step: n-m/x
  const rangeStep = field.match(/^(\d+)-(\d+)\/(\d+)$/);
  if (rangeStep) {
    const [, s, e, x] = rangeStep.map(Number);
    return value >= s && value <= e && (value - s) % x === 0;
  }

  // Range: n-m
  const range = field.match(/^(\d+)-(\d+)$/);
  if (range) {
    const [, s, e] = range.map(Number);
    return value >= s && value <= e;
  }

  // List: n,m,o
  if (field.includes(',')) {
    return field.split(',').some(item => parseInt(item.trim()) === value);
  }

  // Single number
  return parseInt(field) === value;
}

/**
 * Calculate the next run time for a cron expression.
 *
 * @param expr - 5-field cron expression or shortcut
 * @param after - Start searching from this time (default: now)
 * @returns Next execution Date
 */
export function getNextRun(expr: string, after: Date = new Date()): Date {
  const expanded = expandShortcut(expr);
  const parts = expanded.split(/\s+/);
  if (parts.length !== 5 || !validateCronExpression(expr)) {
    throw new Error(`Invalid cron expression: ${expr}`);
  }

  const [minPart, hourPart, domPart, monthPart, dowPart] = parts;

  // Start 1 minute after `after` to find the NEXT occurrence
  const current = new Date(after.getTime() + 60000);
  current.setUTCSeconds(0, 0);

  const maxIterations = 366 * 24 * 60; // ~1 year
  for (let i = 0; i < maxIterations; i++) {
    const minute = current.getUTCMinutes();
    const hour = current.getUTCHours();
    const day = current.getUTCDate();
    const month = current.getUTCMonth() + 1;
    const dow = current.getUTCDay(); // 0-6, 0 = Sunday

    if (
      matchesField(minute, minPart, 0, 59) &&
      matchesField(hour, hourPart, 0, 23) &&
      matchesField(day, domPart, 1, 31) &&
      matchesField(month, monthPart, 1, 12) &&
      (matchesField(dow, dowPart, 0, 7) || matchesField(dow === 0 ? 7 : dow, dowPart, 0, 7))
    ) {
      return new Date(current);
    }

    current.setUTCMinutes(current.getUTCMinutes() + 1);
  }

  throw new Error(`Could not calculate next run time for: ${expr}`);
}
