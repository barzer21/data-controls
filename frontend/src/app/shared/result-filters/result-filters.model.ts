import {
  FieldReference,
  MetadataResponse,
  RuleCondition,
  RuleExecutionOptions,
  RuleResultColumn,
} from '../../core/api/api.models';
import { comparisonOperators, editableFields } from '../condition-editor/condition-editor.model';
import { parseNumericInput } from '../numeric-input';

export interface FilterColumn extends RuleResultColumn {
  readonly reference: FieldReference;
}
export interface ColumnFilter {
  readonly columnId: string;
  readonly operator: string;
  readonly value?: string | number | boolean;
}
export interface ResultFilterSelection {
  readonly search: string;
  readonly filters: readonly ColumnFilter[];
}
export const emptySelection = (): ResultFilterSelection => ({ search: '', filters: [] });

// Result column IDs use the server's documented relationship.path.field convention.
// Match against metadata rather than accepting arbitrary field paths from a column ID.
export function filterColumns(
  columns: readonly RuleResultColumn[],
  metadata: MetadataResponse,
  root: string,
): FilterColumn[] {
  const fields = editableFields(metadata, root);
  return columns.flatMap((column) => {
    const field = fields.find(
      (field) =>
        [...(field.reference.relationshipPath ?? []), field.reference.fieldId]
          .join('.')
          .toLowerCase() === column.id.toLowerCase() && field.type === column.type,
    );
    return field ? [{ ...column, reference: field.reference }] : [];
  });
}

export function filterOperators(type: string) {
  return comparisonOperators.filter(
    (op) =>
      ['number', 'date'].includes(type) ||
      ['equals', 'notEquals', 'isNull', 'isNotNull'].includes(op.id),
  );
}

export function parseColumnFilter(
  column: FilterColumn,
  operator: string,
  raw: string,
): { filter: ColumnFilter } | { error: string } {
  if (!filterOperators(column.type).some((op) => op.id === operator))
    return { error: 'יש לבחור השוואה המתאימה לסוג העמודה.' };
  if (operator === 'isNull' || operator === 'isNotNull')
    return { filter: { columnId: column.id, operator } };
  let value: string | number | boolean = raw;
  if (column.type === 'number') {
    const parsed = parseNumericInput(raw);
    if ('error' in parsed) return parsed;
    value = parsed.value;
  } else if (column.type === 'boolean') {
    if (raw !== 'true' && raw !== 'false') return { error: 'יש לבחור כן או לא.' };
    value = raw === 'true';
  } else if (column.type === 'date') {
    const date = new Date(raw);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(raw) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== raw
    )
      return { error: 'יש להזין תאריך תקין.' };
  } else if (raw.length > 4000) return { error: 'ערך הטקסט מוגבל ל־4,000 תווים.' };
  return { filter: { columnId: column.id, operator, value } };
}

export function executionOptions(
  selection: ResultFilterSelection,
  columns: readonly FilterColumn[],
): RuleExecutionOptions {
  const options: { search?: string; filter?: RuleCondition } = {};
  if (selection.search.trim()) options.search = selection.search;
  if (selection.search.length > 200 || selection.filters.length > 99)
    throw new Error('אפשרויות הסינון חורגות מהמגבלות הנתמכות.');
  const children: RuleCondition[] = selection.filters.map((filter) => {
    const column = columns.find((column) => column.id === filter.columnId);
    if (!column)
      throw new Error('אחת מעמודות הסינון אינה זמינה כעת. יש לנקות את הסינון ולנסות שוב.');
    const parsed = parseColumnFilter(
      column,
      filter.operator,
      filter.value === undefined ? '' : String(filter.value),
    );
    if ('error' in parsed) throw new Error(parsed.error);
    return {
      kind: 'comparison',
      left: column.reference,
      operator: filter.operator,
      ...(filter.operator === 'isNull' || filter.operator === 'isNotNull'
        ? {}
        : { right: { kind: 'constant' as const, value: parsed.filter.value! } }),
    };
  });
  if (children.length)
    options.filter =
      children.length === 1 ? children[0] : { kind: 'group', operator: 'and', children };
  return options;
}
