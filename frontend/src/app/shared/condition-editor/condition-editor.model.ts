import {
  FieldReference,
  MetadataResponse,
  RuleCondition,
  RuleOperand,
} from '../../core/api/api.models';
import { numericConstantError } from '../numeric-input';

export interface EditableField {
  key: string;
  label: string;
  type: string;
  reference: FieldReference;
}

export function fieldKey(reference: FieldReference): string {
  return JSON.stringify([
    ...(reference.relationshipPath ?? []).map((id) => id.toLowerCase()),
    reference.fieldId.toLowerCase(),
  ]);
}

// Traverse only metadata-approved outgoing links, with the same four-link bound as the API.
export function editableFields(metadata: MetadataResponse, rootEntityId: string): EditableField[] {
  const fields: EditableField[] = [];
  function visit(entityId: string, path: string[], labels: string[]): void {
    const entity = metadata.entities.find((e) => e.id.toLowerCase() === entityId.toLowerCase());
    if (!entity) return;
    for (const field of entity.fields) {
      const reference: FieldReference = {
        fieldId: field.id,
        ...(path.length ? { relationshipPath: path } : {}),
      };
      fields.push({
        key: fieldKey(reference),
        label: [...labels, field.label].join(' › '),
        type: field.type,
        reference,
      });
    }
    if (path.length >= 4) return;
    for (const relationship of metadata.relationships.filter(
      (r) => r.fromEntity.toLowerCase() === entityId.toLowerCase(),
    )) {
      visit(relationship.toEntity, [...path, relationship.id], [...labels, relationship.label]);
    }
  }
  visit(rootEntityId, [], []);
  return fields;
}

export function constantFor(type?: string): RuleOperand {
  return { kind: 'constant', value: type === 'boolean' ? true : type === 'number' ? null : '' };
}

export function newComparison(fields: readonly EditableField[]): RuleCondition {
  return {
    kind: 'comparison',
    left: fields[0]?.reference ?? { fieldId: '' },
    operator: 'equals',
    right: constantFor(fields[0]?.type),
  };
}

export function conditionCount(condition: RuleCondition): number {
  return condition.kind === 'group'
    ? 1 + condition.children.reduce((count, child) => count + conditionCount(child), 0)
    : 1;
}

export function numericConditionErrors(
  condition: RuleCondition,
  metadata: MetadataResponse,
  rootEntityId: string,
): string[] {
  const fields = editableFields(metadata, rootEntityId);
  const errors: string[] = [];
  function visit(node: RuleCondition): void {
    if (node.kind === 'group') {
      node.children.forEach(visit);
      return;
    }
    const field = fields.find((item) => item.key === fieldKey(node.left));
    if (
      field?.type !== 'number' ||
      node.right?.kind !== 'constant' ||
      node.operator === 'isNull' ||
      node.operator === 'isNotNull'
    )
      return;
    const message = numericConstantError(node.right.value);
    if (message) errors.push(`${field.label}: ${message}`);
  }
  visit(condition);
  return errors;
}

export const comparisonOperators = [
  { id: 'equals', label: 'שווה ל־' },
  { id: 'notEquals', label: 'שונה מ־' },
  { id: 'greaterThan', label: 'גדול מ־' },
  { id: 'greaterThanOrEqual', label: 'גדול או שווה ל־' },
  { id: 'lessThan', label: 'קטן מ־' },
  { id: 'lessThanOrEqual', label: 'קטן או שווה ל־' },
  { id: 'isNull', label: 'חסר' },
  { id: 'isNotNull', label: 'אינו חסר' },
];
