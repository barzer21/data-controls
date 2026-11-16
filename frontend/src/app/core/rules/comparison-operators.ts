export const comparisonOperators = [
  { id: 'equals', label: 'שווה ל־' },
  { id: 'notEquals', label: 'שונה מ־' },
  { id: 'greaterThan', label: 'גדול מ־' },
  { id: 'greaterThanOrEqual', label: 'גדול או שווה ל־' },
  { id: 'lessThan', label: 'קטן מ־' },
  { id: 'lessThanOrEqual', label: 'קטן או שווה ל־' },
  { id: 'isNull', label: 'חסר' },
  { id: 'isNotNull', label: 'אינו חסר' },
] as const;

export type ComparisonOperator = (typeof comparisonOperators)[number]['id'];

export function operatorsForType(type: string | undefined) {
  if (type === 'number' || type === 'date') return comparisonOperators;
  if (type !== 'text' && type !== 'boolean') return [];
  return comparisonOperators.filter(
    (op) =>
      op.id === 'equals' || op.id === 'notEquals' || op.id === 'isNull' || op.id === 'isNotNull',
  );
}

export function isComparisonOperator(value: string): value is ComparisonOperator {
  return comparisonOperators.some((op) => op.id === value);
}

export function comparisonOperatorLabel(value: string): string | undefined {
  return comparisonOperators.find((op) => op.id === value)?.label;
}
