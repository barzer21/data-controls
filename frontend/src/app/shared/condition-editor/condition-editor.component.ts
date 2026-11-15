import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UiIconComponent } from '../ui-icon/ui-icon.component';
import { MetadataResponse, RuleCondition } from '../../core/api/api.models';
import {
  comparisonOperators,
  constantFor,
  editableFields,
  fieldKey,
  newComparison,
} from './condition-editor.model';

@Component({
  selector: 'app-condition-editor',
  imports: [FormsModule, UiIconComponent],
  templateUrl: './condition-editor.component.html',
  styleUrl: './condition-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConditionEditorComponent {
  readonly condition = input.required<RuleCondition>();
  readonly rootEntityId = input.required<string>();
  readonly metadata = input.required<MetadataResponse>();
  readonly depth = input(1);
  readonly conditionChange = output<RuleCondition>();
  readonly fields = computed(() => editableFields(this.metadata(), this.rootEntityId()));
  readonly leftField = computed(() => {
    const node = this.condition();
    return node.kind === 'comparison'
      ? this.fields().find((f) => f.key === fieldKey(node.left))
      : undefined;
  });
  readonly compatibleFields = computed(() =>
    this.fields().filter(
      (f) => f.type === this.leftField()?.type && f.key !== this.leftField()?.key,
    ),
  );
  readonly operators = computed(() => {
    const type = this.leftField()?.type;
    if (!['number', 'date', 'text', 'boolean'].includes(type ?? '')) return [];
    return comparisonOperators.filter(
      (op) =>
        ['number', 'date'].includes(type ?? '') ||
        ['equals', 'notEquals', 'isNull', 'isNotNull'].includes(op.id),
    );
  });
  readonly fieldKey = fieldKey;
  operatorAvailable(operator: string): boolean {
    return this.operators().some((op) => op.id === operator);
  }
  rightFieldAvailable(key: string): boolean {
    return this.compatibleFields().some((field) => field.key === key);
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  changeLeft(key: string): void {
    const node = this.condition();
    const field = this.fields().find((f) => f.key === key);
    if (node.kind !== 'comparison' || !field) return;
    this.conditionChange.emit({
      kind: 'comparison',
      left: field.reference,
      operator: 'equals',
      right: constantFor(field.type),
    });
  }

  changeOperator(operator: string): void {
    const node = this.condition();
    if (node.kind !== 'comparison' || !this.operatorAvailable(operator)) return;
    const { right, ...withoutRight } = node;
    this.conditionChange.emit(
      operator === 'isNull' || operator === 'isNotNull'
        ? { ...withoutRight, operator }
        : { ...node, operator, right: right ?? constantFor(this.leftField()?.type) },
    );
  }

  changeOperand(kind: string): void {
    const node = this.condition();
    if (
      node.kind !== 'comparison' ||
      !this.leftField() ||
      node.operator === 'isNull' ||
      node.operator === 'isNotNull' ||
      (kind !== 'constant' && kind !== 'field')
    )
      return;
    const otherField = this.compatibleFields()[0];
    if (kind === 'field' && !otherField) return;
    this.conditionChange.emit({
      ...node,
      right:
        kind === 'field'
          ? { kind: 'field', field: otherField!.reference }
          : constantFor(this.leftField()?.type),
    });
  }

  changeRightField(key: string): void {
    const node = this.condition();
    const field = this.compatibleFields().find((f) => f.key === key);
    if (node.kind === 'comparison' && field)
      this.conditionChange.emit({ ...node, right: { kind: 'field', field: field.reference } });
  }

  changeConstant(value: string): void {
    const node = this.condition();
    if (node.kind !== 'comparison' || node.right?.kind !== 'constant') return;
    const type = this.leftField()?.type;
    if (type === 'boolean' && value !== 'true' && value !== 'false') return;
    const typed =
      type === 'number'
        ? value === ''
          ? null
          : Number(value)
        : type === 'boolean'
          ? value === 'true'
          : value;
    this.conditionChange.emit({ ...node, right: { kind: 'constant', value: typed } });
  }

  changeGroup(operator: string): void {
    const node = this.condition();
    if (node.kind === 'group')
      this.conditionChange.emit({ ...node, operator: operator === 'or' ? 'or' : 'and' });
  }

  replaceChild(index: number, child: RuleCondition): void {
    const node = this.condition();
    if (node.kind === 'group')
      this.conditionChange.emit({
        ...node,
        children: node.children.map((old, i) => (i === index ? child : old)),
      });
  }

  removeChild(index: number): void {
    const node = this.condition();
    if (node.kind === 'group' && node.children.length > 1)
      this.conditionChange.emit({ ...node, children: node.children.filter((_, i) => i !== index) });
  }

  addChild(group: boolean): void {
    const node = this.condition();
    if (node.kind !== 'group' || this.depth() >= (group ? 7 : 8)) return;
    const comparison = newComparison(this.fields());
    this.conditionChange.emit({
      ...node,
      children: [
        ...node.children,
        group ? { kind: 'group', operator: 'and', children: [comparison] } : comparison,
      ],
    });
  }

  wrapInGroup(): void {
    if (this.depth() < 8)
      this.conditionChange.emit({
        kind: 'group',
        operator: 'and',
        children: [this.condition(), newComparison(this.fields())],
      });
  }
}
