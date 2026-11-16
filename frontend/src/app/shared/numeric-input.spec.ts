import { numericConstantError, parseNumericInput } from './numeric-input';

describe('Supported numeric input', () => {
  it.each([
    ['0', 0],
    ['-0', 0],
    ['0.1', 0.1],
    ['123.5', 123.5],
    ['-123.456789', -123.456789],
    ['999999999999999', 999999999999999],
    ['-999999999999999', -999999999999999],
    ['123456789.123456', 123456789.123456],
    ['0.000001', 0.000001],
    ['+00123.4500000', 123.45],
    ['.5', 0.5],
    ['1.', 1],
  ])('preserves accepted decimal input %s in JSON', (raw, value) => {
    const parsed = parseNumericInput(raw);
    expect(parsed).toEqual({ value });
    if ('value' in parsed) expect(JSON.parse(JSON.stringify(parsed.value))).toBe(value);
  });

  it.each([
    '9007199254740993',
    '9007199254740992',
    '1000000000000000',
    '-1000000000000000',
    '1234567890.123456',
    '0.1234567',
    '0.0000001',
    '0.10000000000000001',
    'NaN',
    'Infinity',
    '1e20',
    '1e-6',
    '0x10',
    '1,000',
    '',
    ' ',
    '-',
    '.',
  ])('rejects unsupported input before conversion: %s', (raw) => {
    expect(parseNumericInput(raw)).toHaveProperty('error');
  });

  it('also detects unsupported numbers in loaded definitions', () => {
    expect(numericConstantError(9007199254740992)).toBeTruthy();
    expect(numericConstantError(0.1234567)).toBeTruthy();
    expect(numericConstantError('15000')).toBeTruthy();
    expect(numericConstantError(null)).toBeTruthy();
    expect(numericConstantError(15000.25)).toBeNull();
  });
});
