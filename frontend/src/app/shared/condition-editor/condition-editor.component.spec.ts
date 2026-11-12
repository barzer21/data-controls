import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MetadataResponse, RuleCondition } from '../../core/api/api.models';
import { ConditionEditorComponent } from './condition-editor.component';
import { conditionCount, editableFields, newComparison } from './condition-editor.model';

const metadata: MetadataResponse = {
  version: 1,
  entities: [
    {
      id: 'item',
      label: 'נתונים',
      fields: [
        { id: 'amount', label: 'סכום', type: 'number' },
        { id: 'start', label: 'התחלה', type: 'date' },
        { id: 'end', label: 'סיום', type: 'date' },
        { id: 'active', label: 'פעיל', type: 'boolean' },
        { id: 'name', label: 'שם', type: 'text' },
      ],
    },
    {
      id: 'unit',
      label: 'יחידות',
      fields: [{ id: 'active', label: 'יחידה פעילה', type: 'boolean' }],
    },
  ],
  relationships: [
    {
      id: 'unitLink',
      label: 'יחידת הרשומה',
      fromEntity: 'item',
      toEntity: 'unit',
      cardinality: 'manyToOne',
    },
  ],
};

describe('Metadata-driven condition editing', () => {
  let fixture: ComponentFixture<ConditionEditorComponent>;
  let editor: ConditionEditorComponent;
  let emitted: RuleCondition;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ConditionEditorComponent] });
    fixture = TestBed.createComponent(ConditionEditorComponent);
    editor = fixture.componentInstance;
    fixture.componentRef.setInput('metadata', metadata);
    fixture.componentRef.setInput('rootEntityId', 'item');
    fixture.componentRef.setInput('condition', newComparison(editableFields(metadata, 'item')));
    editor.conditionChange.subscribe((node) => {
      emitted = node;
      fixture.componentRef.setInput('condition', node);
    });
    fixture.detectChanges();
  });
  function field(id: string) {
    return editor
      .fields()
      .find((f) => f.reference.fieldId === id && !f.reference.relationshipPath)!;
  }

  it('offers business relationship labels and serializes approved paths', () => {
    const related = editor.fields().find((f) => !!f.reference.relationshipPath)!;
    expect(related.label).toBe('יחידת הרשומה › יחידה פעילה');
    editor.changeLeft(related.key);
    expect(emitted).toMatchObject({
      left: { fieldId: 'active', relationshipPath: ['unitLink'] },
      right: { kind: 'constant', value: true },
    });
  });

  it('converts number, boolean and date input into correctly typed JSON values', () => {
    editor.changeConstant('123.5');
    expect(emitted).toMatchObject({ right: { value: 123.5 } });
    editor.changeConstant('');
    expect(emitted).toMatchObject({ right: { value: null } });
    editor.changeLeft(field('active').key);
    editor.changeConstant('false');
    expect(emitted).toMatchObject({ right: { value: false } });
    editor.changeLeft(field('start').key);
    editor.changeConstant('2026-11-12');
    expect(emitted).toMatchObject({ right: { value: '2026-11-12' } });
  });

  it('restricts comparisons by type and removes operands from NULL checks', () => {
    editor.changeLeft(field('name').key);
    expect(editor.operators().map((op) => op.id)).toEqual([
      'equals',
      'notEquals',
      'isNull',
      'isNotNull',
    ]);
    editor.changeOperator('isNull');
    expect('right' in emitted).toBe(false);
    editor.changeOperator('equals');
    expect(emitted).toMatchObject({ right: { kind: 'constant', value: '' } });
  });

  it('offers only matching types for field-to-field comparisons', () => {
    editor.changeLeft(field('start').key);
    editor.changeOperand('field');
    expect(editor.compatibleFields().map((f) => f.reference.fieldId)).toEqual(['start', 'end']);
    editor.changeRightField(field('end').key);
    expect(emitted).toMatchObject({ right: { kind: 'field', field: { fieldId: 'end' } } });
  });

  it('builds nested AND/OR groups and preserves siblings during updates and removals', () => {
    editor.wrapInGroup();
    editor.changeGroup('or');
    editor.addChild(true);
    expect(emitted).toMatchObject({
      kind: 'group',
      operator: 'or',
      children: [{}, {}, { kind: 'group', operator: 'and' }],
    });
    expect(conditionCount(emitted)).toBe(5);
    const replacement: RuleCondition = {
      kind: 'comparison',
      left: { fieldId: 'name' },
      operator: 'isNull',
    };
    editor.replaceChild(0, replacement);
    editor.removeChild(1);
    if (emitted.kind !== 'group') throw new Error('Expected group');
    expect(emitted.children[0]).toEqual(replacement);
    expect(emitted.children[1].kind).toBe('group');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('app-condition-editor').length).toBeGreaterThan(
      1,
    );
  });

  it('prevents empty groups and adding nodes beyond the depth limit', () => {
    fixture.componentRef.setInput('condition', {
      kind: 'group',
      operator: 'and',
      children: [newComparison(editor.fields())],
    });
    fixture.componentRef.setInput('depth', 8);
    fixture.detectChanges();
    const listener = vi.fn();
    editor.conditionChange.subscribe(listener);
    editor.removeChild(0);
    editor.addChild(false);
    editor.addChild(true);
    editor.wrapInGroup();
    expect(listener).not.toHaveBeenCalled();
  });

  it('bounds traversal even when the metadata contains a cycle', () => {
    const cyclic = {
      ...metadata,
      relationships: [
        {
          id: 'loop',
          label: 'קישור',
          fromEntity: 'item',
          toEntity: 'item',
          cardinality: 'manyToOne',
        },
      ],
    };
    const fields = editableFields(cyclic, 'item');
    expect(fields.length).toBe(25);
    expect(Math.max(...fields.map((f) => f.reference.relationshipPath?.length ?? 0))).toBe(4);
  });

  it('keeps the displayed field and operator selected after wrapping an existing condition in a group', async () => {
    editor.changeLeft(field('end').key);
    editor.changeOperator('lessThan');
    editor.wrapInGroup();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const selects = fixture.nativeElement
      .querySelector('.comparison')
      .querySelectorAll('select') as NodeListOf<HTMLSelectElement>;
    expect(selects[0].selectedOptions[0].textContent?.trim()).toBe('סיום');
    expect(selects[1].selectedOptions[0].textContent?.trim()).toBe('קטן מ־');
  });
});
