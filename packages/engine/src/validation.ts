import type { ValidationIssue } from './types.js';

export function issue(
  severity: ValidationIssue['severity'],
  code: string,
  messageFa: string,
  messageEn: string,
  field?: string,
): ValidationIssue {
  return { severity, code, messageFa, messageEn, field };
}

export function isPositive(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

export function isNonNegative(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

export function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}

/**
 * Common dimension checks for any cabinet unit.
 * These are NEW safety checks — the workbook performs no validation at all.
 */
export function validateDimensions(
  width: number,
  depthLike: { field: string; value: number }[],
  labels: Record<string, string> = {},
): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const nameOf = (f: string) => labels[f] ?? f;

  if (!isPositive(width)) {
    out.push(
      issue('error', 'WIDTH_NOT_POSITIVE', 'عرض کابینت باید بزرگ‌تر از صفر باشد.', 'Cabinet width must be greater than zero.', 'width'),
    );
  } else {
    if (width < 10) {
      out.push(
        issue('warning', 'WIDTH_BELOW_DOOR_TIER', 'عرض کمتر از ۱۰ سانتی‌متر است؛ فرمول درب خالی می‌شود.', 'Width < 10 cm: the door formula returns empty.', 'width'),
      );
    }
    if (width > 150) {
      out.push(
        issue('warning', 'WIDTH_ABOVE_DOOR_TIER', 'عرض بیشتر از ۱۵۰ سانتی‌متر است؛ فرمول درب خالی می‌شود.', 'Width > 150 cm: the door formula returns empty.', 'width'),
      );
    }
  }

  for (const d of depthLike) {
    if (!isPositive(d.value)) {
      out.push(
        issue('error', `${d.field.toUpperCase()}_NOT_POSITIVE`, `${nameOf(d.field)} باید بزرگ‌تر از صفر باشد.`, `${d.field} must be greater than zero.`, d.field),
      );
    } else if (isPositive(width) && d.value > width) {
      out.push(
        issue('warning', `${d.field.toUpperCase()}_EXCEEDS_WIDTH`, `${nameOf(d.field)} (${d.value}) از عرض کابینت (${width}) بیشتر است.`, `${d.field} exceeds cabinet width.`, d.field),
      );
    }
  }

  return out;
}

/** Warn when a derived dimension becomes zero or negative. */
export function checkDerived(
  field: string,
  labelFa: string,
  value: number,
): ValidationIssue | null {
  if (!Number.isFinite(value)) {
    return issue('error', `${field.toUpperCase()}_NOT_FINITE`, `${labelFa}: مقدار عددی معتبر نیست.`, `${field}: not a finite number.`, field);
  }
  if (value <= 0) {
    return issue('error', `${field.toUpperCase()}_NOT_POSITIVE`, `${labelFa}: ابعاد محاسبه‌شده ${value} است و باید مثبت باشد.`, `${field}: computed ${value}, must be positive.`, field);
  }
  return null;
}

/** Warn when a derived dimension is implausibly small but still positive. */
export function checkTiny(
  field: string,
  labelFa: string,
  value: number,
  minCm = 1,
): ValidationIssue | null {
  if (Number.isFinite(value) && value > 0 && value < minCm) {
    return issue(
      'warning',
      `${field.toUpperCase()}_TINY`,
      `${labelFa}: ${value} سانتی‌متر بسیار کوچک است؛ ورودی‌ها را بازبینی کنید.`,
      `${field}: ${value} cm is very small, review the inputs.`,
      field,
    );
  }
  return null;
}
