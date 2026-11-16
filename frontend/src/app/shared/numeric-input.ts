export const NUMERIC_INPUT_LIMITS =
  'ניתן להזין עד 15 ספרות משמעותיות ועד 6 ספרות אחרי הנקודה, בטווח שבין ‎-999999999999999 ל־999999999999999.';
const INVALID_NUMBER = 'יש להזין מספר תקין, עם נקודה עשרונית וללא פסיקים או כתיב מעריכי.';

// Validate the original text before Number conversion. Compare the JSON decimal spelling
// too, so accepted input cannot silently become a different decimal in the API request.
export function parseNumericInput(raw: string): { value: number } | { error: string } {
  const input = raw.trim();
  if (!input || input.length > 128 || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(input)) {
    return { error: INVALID_NUMBER };
  }
  const negative = input.startsWith('-');
  const [integer = '', fraction = ''] = input.replace(/^[+-]/, '').split('.');
  const whole = integer.replace(/^0+/, '') || '0';
  const decimal = fraction.replace(/0+$/, '');
  const significant = (whole + decimal).replace(/^0+/, '');
  if (whole.length > 15 || significant.length > 15 || decimal.length > 6) {
    return { error: NUMERIC_INPUT_LIMITS };
  }
  const normalized = `${negative && significant ? '-' : ''}${whole}${decimal ? '.' + decimal : ''}`;
  const value = Number(input) || 0;
  if (!Number.isFinite(value) || String(value) !== normalized) {
    return { error: NUMERIC_INPUT_LIMITS };
  }
  return { value };
}

export function numericConstantError(value: unknown): string | null {
  const parsed = parseNumericInput(
    typeof value === 'number' || typeof value === 'string' ? String(value) : '',
  );
  if ('error' in parsed) return parsed.error;
  // Invalid editor input stays text in the draft, never an old/rounded numeric value.
  return typeof value === 'number' ? null : INVALID_NUMBER;
}
