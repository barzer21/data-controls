import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MetadataResponse } from '../../core/api/api.models';
import { ResultFiltersComponent } from './result-filters.component';
import {
  emptySelection,
  executionOptions,
  filterColumns,
  parseColumnFilter,
} from './result-filters.model';

const metadata: MetadataResponse = {
  version: 1,
  entities: [
    {
      id: 'item',
      label: 'נתונים',
      fields: [
        { id: 'amount', label: 'סכום', type: 'number' },
        { id: 'date', label: 'תאריך', type: 'date' },
        { id: 'active', label: 'פעיל', type: 'boolean' },
        { id: 'name', label: 'שם', type: 'text' },
      ],
    },
    { id: 'unit', label: 'יחידות', fields: [{ id: 'name', label: 'שם יחידה', type: 'text' }] },
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
const columns = filterColumns(
  [
    { id: 'amount', label: 'סכום', type: 'number' },
    { id: 'date', label: 'תאריך', type: 'date' },
    { id: 'active', label: 'פעיל', type: 'boolean' },
    { id: 'name', label: 'שם', type: 'text' },
    { id: 'unitLink.name', label: 'יחידה ← שם', type: 'text' },
  ],
  metadata,
  'item',
);

describe('Result filter model', () => {
  it('maps only displayed fields that agree with metadata, including relationship paths', () => {
    expect(columns[4].reference).toEqual({ fieldId: 'name', relationshipPath: ['unitLink'] });
    expect(
      filterColumns(
        [
          { id: 'sql.secret', label: 'לא מוכר', type: 'text' },
          { id: 'amount', label: 'סוג שונה', type: 'text' },
        ],
        metadata,
        'item',
      ),
    ).toEqual([]);
  });
  it('builds typed AND filters and keeps the original search literal', () => {
    const options = executionOptions(
      {
        search: "Sales%_'",
        filters: [
          { columnId: 'amount', operator: 'greaterThanOrEqual', value: 0 },
          { columnId: 'active', operator: 'equals', value: false },
          { columnId: 'unitLink.name', operator: 'isNull' },
        ],
      },
      columns,
    );
    expect(options.search).toBe("Sales%_'");
    expect(options.filter).toEqual({
      kind: 'group',
      operator: 'and',
      children: [
        {
          kind: 'comparison',
          left: { fieldId: 'amount' },
          operator: 'greaterThanOrEqual',
          right: { kind: 'constant', value: 0 },
        },
        {
          kind: 'comparison',
          left: { fieldId: 'active' },
          operator: 'equals',
          right: { kind: 'constant', value: false },
        },
        {
          kind: 'comparison',
          left: { fieldId: 'name', relationshipPath: ['unitLink'] },
          operator: 'isNull',
        },
      ],
    });
  });
  it('omits empty options and uses a single comparison without an unnecessary group', () => {
    expect(executionOptions(emptySelection(), columns)).toEqual({});
    expect(
      executionOptions(
        { search: '   ', filters: [{ columnId: 'name', operator: 'equals', value: '' }] },
        columns,
      ).filter,
    ).toMatchObject({ kind: 'comparison', right: { value: '' } });
  });
  it('rejects blank or non-finite numbers, bad dates, invalid booleans and unsupported operators', () => {
    for (const value of ['', ' ', 'Infinity', 'not-a-number'])
      expect(parseColumnFilter(columns[0], 'equals', value)).toHaveProperty('error');
    expect(parseColumnFilter(columns[1], 'equals', '2026-02-30')).toHaveProperty('error');
    expect(parseColumnFilter(columns[1], 'equals', '2026-11-12')).toMatchObject({
      filter: { value: '2026-11-12' },
    });
    expect(parseColumnFilter(columns[2], 'equals', 'no')).toHaveProperty('error');
    expect(parseColumnFilter(columns[3], 'greaterThan', 'a')).toHaveProperty('error');
  });
  it('does not invent filters for unavailable columns and bounds search length', () => {
    expect(() =>
      executionOptions(
        { search: '', filters: [{ columnId: 'missing', operator: 'equals', value: 'x' }] },
        columns,
      ),
    ).toThrow();
    expect(() => executionOptions({ search: 'x'.repeat(201), filters: [] }, columns)).toThrow();
  });
});

describe('Result filter controls', () => {
  let fixture: ComponentFixture<ResultFiltersComponent>;
  let component: ResultFiltersComponent;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ResultFiltersComponent] });
    fixture = TestBed.createComponent(ResultFiltersComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('selection', emptySelection());
    component.selectionChange.subscribe((selection) =>
      fixture.componentRef.setInput('selection', selection),
    );
    fixture.detectChanges();
  });
  it('combines search and per-column filters and replaces an existing column filter', () => {
    component.searchDraft.set('דנה');
    component.applySearch();
    component.openColumn('amount');
    component.operator.set('greaterThan');
    component.value.set('15000');
    component.applyColumn();
    component.openColumn('amount');
    component.value.set('20000');
    component.applyColumn();
    expect(component.selection()).toEqual({
      search: 'דנה',
      filters: [{ columnId: 'amount', operator: 'greaterThan', value: 20000 }],
    });
  });
  it.each(['9007199254740993', '0.10000000000000001'])(
    'preserves raw numeric input %s and rejects it without applying a rounded filter',
    async (raw) => {
      const emit = vi.fn();
      component.selectionChange.subscribe(emit);
      component.openColumn('amount');
      fixture.detectChanges();
      await fixture.whenStable();
      const input = fixture.nativeElement.querySelector(
        'input[inputmode="decimal"]',
      ) as HTMLInputElement;
      input.value = raw;
      input.dispatchEvent(new Event('input'));
      component.applyColumn();
      fixture.detectChanges();
      expect(component.value()).toBe(raw);
      expect(input.value).toBe(raw);
      expect(emit).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('15');
      input.value = '123.45';
      input.dispatchEvent(new Event('input'));
      component.applyColumn();
      expect(component.selection().filters[0].value).toBe(123.45);
    },
  );

  it('removes one filter independently and clears everything explicitly', () => {
    component.searchDraft.set('דנה');
    component.applySearch();
    component.openColumn('amount');
    component.value.set('0');
    component.applyColumn();
    component.openColumn('active');
    component.value.set('false');
    component.applyColumn();
    component.removeColumn('amount');
    expect(component.selection()).toEqual({
      search: 'דנה',
      filters: [{ columnId: 'active', operator: 'equals', value: false }],
    });
    component.clear();
    expect(component.selection()).toEqual(emptySelection());
    expect(component.searchDraft()).toBe('');
  });
  it('keeps invalid filters local instead of emitting a server request', () => {
    const emit = vi.fn();
    component.selectionChange.subscribe(emit);
    component.openColumn('amount');
    component.value.set('');
    component.applyColumn();
    expect(emit).not.toHaveBeenCalled();
    expect(component.error()).toContain('מספר תקין');
    expect(component.column()?.id).toBe('amount');
  });
  it('offers typed operators and edits the already applied value', () => {
    component.openColumn('active');
    expect(component.operators().map((op) => op.id)).toEqual([
      'equals',
      'notEquals',
      'isNull',
      'isNotNull',
    ]);
    component.value.set('false');
    component.applyColumn();
    component.openColumn('active');
    expect(component.value()).toBe('false');
    component.operator.set('isNull');
    component.applyColumn();
    expect(component.selection().filters[0]).toEqual({ columnId: 'active', operator: 'isNull' });
  });
});
