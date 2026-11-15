import { MetadataResponse, RuleCondition } from '../../core/api/api.models';
import { BusinessValuePipe } from '../business-value.pipe';
import {
  comparisonOperators,
  editableFields,
  fieldKey,
} from '../condition-editor/condition-editor.model';

// Explicit group boundaries preserve the meaning of arbitrary nested AND/OR trees.
export function ruleSummary(
  condition: RuleCondition,
  root: string,
  metadata: MetadataResponse,
): string {
  const fields = editableFields(metadata, root);
  const formatter = new BusinessValuePipe();
  function describe(node: RuleCondition): string {
    if (node.kind === 'group') {
      const label = node.operator === 'and' ? 'כל הבאים מתקיימים' : 'לפחות אחד מהבאים מתקיים';
      return `${label}: (${node.children.map(describe).join(node.operator === 'and' ? '; וגם ' : '; או ')})`;
    }
    const left = fields.find((field) => field.key === fieldKey(node.left));
    const operator =
      comparisonOperators.find((op) => op.id === node.operator)?.label ?? 'השוואה שאינה זמינה';
    const label = left?.label ?? 'שדה שאינו זמין';
    if (node.operator === 'isNull' || node.operator === 'isNotNull') return `${label} ${operator}`;
    const right = node.right;
    const value =
      right?.kind === 'field'
        ? (fields.find((field) => field.key === fieldKey(right.field))?.label ?? 'שדה שאינו זמין')
        : right?.value === null || right?.value === undefined
          ? 'ערך שטרם הוזן'
          : right.value === ''
            ? 'טקסט ריק'
            : formatter.transform(right.value, left?.type);
    return `${label} ${operator} ${value}`;
  }
  return describe(condition);
}
