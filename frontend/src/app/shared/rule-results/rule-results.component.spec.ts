import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MetadataResponse, RuleDefinition, RuleExecutionResponse } from '../../core/api/api.models';
import { ResultFiltersComponent } from '../result-filters/result-filters.component';
import { RuleResultsComponent } from './rule-results.component';

const metadata: MetadataResponse = {
  version: 1,
  entities: [
    {
      id: 'employee',
      label: 'עובדים',
      fields: [
        { id: 'salary', label: 'שכר', type: 'number' },
        { id: 'firstName', label: 'שם פרטי', type: 'text' },
        { id: 'isActive', label: 'עובד פעיל', type: 'boolean' },
        { id: 'startDate', label: 'תחילת העסקה', type: 'date' },
      ],
    },
    {
      id: 'department',
      label: 'מחלקות',
      fields: [{ id: 'name', label: 'שם מחלקה', type: 'text' }],
    },
  ],
  relationships: [
    {
      id: 'employeeDepartment',
      label: 'מחלקת העובד',
      fromEntity: 'employee',
      toEntity: 'department',
      cardinality: 'manyToOne',
    },
  ],
};
const definition: RuleDefinition = {
  name: 'טיוטה ששונתה',
  description: 'לא נשמרה',
  rootEntityId: 'employee',
  condition: {
    kind: 'comparison',
    left: { fieldId: 'salary' },
    operator: 'greaterThan',
    right: { kind: 'constant', value: 15000 },
  },
};
const result: RuleExecutionResponse = {
  totalCount: 1,
  returnedCount: 1,
  truncated: false,
  columns: [
    { id: 'salary', label: 'שכר', type: 'number' },
    { id: 'firstName', label: 'שם פרטי', type: 'text' },
    { id: 'isActive', label: 'עובד פעיל', type: 'boolean' },
    { id: 'startDate', label: 'תחילת העסקה', type: 'date' },
    { id: 'employeeDepartment.name', label: 'שם מחלקה', type: 'text' },
  ],
  records: [
    {
      id: 1,
      values: {
        salary: 20000,
        firstName: 'דנה',
        isActive: false,
        startDate: '2026-01-01',
        'employeeDepartment.name': 'תפעול',
      },
      failureReason: 'השכר גבוה מהסף',
      explanation: {
        path: 'condition',
        kind: 'comparison',
        operator: 'greaterThan',
        message: 'השכר גבוה מהסף',
        left: null,
        right: null,
        children: [],
      },
    },
  ],
};

describe('Shared rule results', () => {
  let fixture: ComponentFixture<RuleResultsComponent>;
  let component: RuleResultsComponent;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RuleResultsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(RuleResultsComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('definition', structuredClone(definition));
    fixture.componentRef.setInput('metadata', metadata);
    fixture.componentRef.setInput('initialResult', result);
    fixture.detectChanges();
  });
  afterEach(() => {
    fixture.destroy();
    http.verify();
  });
  function filters() {
    return fixture.debugElement.query(By.directive(ResultFiltersComponent))
      .componentInstance as ResultFiltersComponent;
  }

  it('shows the initial result with search and typed column filters without an extra request', () => {
    expect(fixture.nativeElement.textContent).toContain('השכר גבוה מהסף');
    expect(fixture.nativeElement.querySelector('input[type="search"]').disabled).toBe(false);
    expect(fixture.nativeElement.querySelectorAll('.column-filter-button').length).toBe(5);
    http.expectNone(() => true);
  });

  it('searches server-side on the executed definition and keeps controls at zero matches', () => {
    filters().searchDraft.set('דנה');
    fixture.nativeElement
      .querySelector('.search-form')
      .dispatchEvent(new Event('submit', { cancelable: true }));
    const request = http.expectOne('/api/rules/execute?limit=100');
    expect(request.request.body).toEqual({ definition, options: { search: 'דנה' } });
    request.flush({ ...result, totalCount: 0, returnedCount: 0, records: [] });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('לא נמצאו תוצאות התואמות לחיפוש ולסינון');
    expect(fixture.nativeElement.querySelector('input[type="search"]').disabled).toBe(false);
    filters().clear();
    const cleared = http.expectOne('/api/rules/execute?limit=100');
    expect(cleared.request.body).toEqual({ definition });
    cleared.flush(result);
    http.expectNone(
      (req) => req.method === 'GET' || req.method === 'PUT' || req.url === '/api/rules',
    );
  });

  it('opens header filters and sends numeric and boolean filters as a typed AND group', () => {
    fixture.nativeElement.querySelector('button[aria-label="סינון לפי שכר"]').click();
    expect(filters().selectedColumnId()).toBe('salary');
    filters().operator.set('greaterThan');
    filters().value.set('18000');
    filters().applyColumn();
    const first = http.expectOne('/api/rules/execute?limit=100');
    expect(first.request.body.options.filter.right.value).toBe(18000);
    first.flush(result);
    fixture.detectChanges();
    filters().openColumn('isActive');
    filters().value.set('false');
    filters().applyColumn();
    const combined = http.expectOne('/api/rules/execute?limit=100');
    expect(combined.request.body.definition).toEqual(definition);
    expect(combined.request.body.options.filter).toEqual({
      kind: 'group',
      operator: 'and',
      children: [
        {
          kind: 'comparison',
          left: { fieldId: 'salary' },
          operator: 'greaterThan',
          right: { kind: 'constant', value: 18000 },
        },
        {
          kind: 'comparison',
          left: { fieldId: 'isActive' },
          operator: 'equals',
          right: { kind: 'constant', value: false },
        },
      ],
    });
    combined.flush(result);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.active-filters .chip').length).toBe(2);
  });

  it('maps related-column filters to the approved relationship path', () => {
    component.applyFilters({
      search: '',
      filters: [{ columnId: 'employeeDepartment.name', operator: 'isNull' }],
    });
    const request = http.expectOne('/api/rules/execute?limit=100');
    expect(request.request.body.options.filter).toEqual({
      kind: 'comparison',
      left: { fieldId: 'name', relationshipPath: ['employeeDepartment'] },
      operator: 'isNull',
    });
    request.flush(result);
  });

  it('cancels obsolete filtering requests so the latest selection wins', () => {
    component.applyFilters({ search: 'old', filters: [] });
    const first = http.expectOne('/api/rules/execute?limit=100');
    component.applyFilters({ search: 'new', filters: [] });
    expect(first.cancelled).toBe(true);
    const second = http.expectOne('/api/rules/execute?limit=100');
    expect(second.request.body.options.search).toBe('new');
    second.flush(result);
    expect(component.state().status).toBe('ready');
    expect(component.selection().search).toBe('new');
  });

  it('preserves filters after failure and retries the same snapshot', () => {
    component.applyFilters({ search: 'דנה', filters: [] });
    http
      .expectOne('/api/rules/execute?limit=100')
      .flush({}, { status: 504, statusText: 'Timeout' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'זמן ההמתנה',
    );
    expect(fixture.nativeElement.querySelector('input[type="search"]').disabled).toBe(false);
    component.retry();
    const retry = http.expectOne('/api/rules/execute?limit=100');
    expect(retry.request.body).toEqual({ definition, options: { search: 'דנה' } });
    retry.flush(result);
  });

  it('cancels and resets the selection when a different executed snapshot is provided', () => {
    component.applyFilters({ search: 'דנה', filters: [] });
    const pending = http.expectOne('/api/rules/execute?limit=100');
    fixture.componentRef.setInput('definition', { ...definition, name: 'טיוטה אחרת' });
    fixture.detectChanges();
    expect(pending.cancelled).toBe(true);
    expect(component.selection()).toEqual({ search: '', filters: [] });
    component.applyFilters({ search: 'new', filters: [] });
    const next = http.expectOne('/api/rules/execute?limit=100');
    expect(next.request.body.definition.name).toBe('טיוטה אחרת');
    next.flush(result);
  });

  it('rejects filters on IDs or failure reasons without sending an invalid request', () => {
    component.applyFilters({
      search: '',
      filters: [{ columnId: 'failureReason', operator: 'equals', value: 'x' }],
    });
    expect(component.state().status).toBe('error');
    http.expectNone(() => true);
  });

  it('keeps simultaneous result views isolated when one view is filtered or removed', () => {
    const other = TestBed.createComponent(RuleResultsComponent);
    other.componentRef.setInput('definition', { ...definition, name: 'Another draft' });
    other.componentRef.setInput('metadata', metadata);
    other.componentRef.setInput('initialResult', result);
    other.detectChanges();
    try {
      component.applyFilters({ search: 'first view', filters: [] });
      const first = http.expectOne('/api/rules/execute?limit=100');
      other.componentInstance.applyFilters({ search: 'second view', filters: [] });
      const second = http.expectOne('/api/rules/execute?limit=100');
      expect(first.cancelled).toBe(false);
      expect(second.request.body.definition.name).toBe('Another draft');
      expect(component.selection().search).toBe('first view');
      expect(other.componentInstance.selection().search).toBe('second view');
      other.destroy();
      expect(second.cancelled).toBe(true);
      expect(first.cancelled).toBe(false);
      first.flush(result);
      expect(component.state().status).toBe('ready');
    } finally {
      other.destroy();
    }
  });

  it('keeps the executed definition unchanged if its input object is later mutated', () => {
    const input = structuredClone(definition);
    fixture.componentRef.setInput('definition', input);
    fixture.detectChanges();
    Object.assign(input, {
      name: 'Changed after execution',
      condition: { kind: 'comparison', left: { fieldId: 'salary' }, operator: 'isNull' },
    });
    component.applyFilters({ search: 'snapshot', filters: [] });
    const request = http.expectOne('/api/rules/execute?limit=100');
    expect(request.request.body.definition).toEqual(definition);
    request.flush(result);
  });

  it('executes automatically without an initial result and resets filters for a new definition', () => {
    fixture.componentRef.setInput('initialResult', undefined);
    fixture.detectChanges();
    const initial = http.expectOne('/api/rules/execute?limit=100');
    expect(initial.request.body).toEqual({ definition });
    initial.flush(result);
    component.applyFilters({ search: 'previous search', filters: [] });
    const pending = http.expectOne('/api/rules/execute?limit=100');
    const nextDefinition = { ...definition, name: 'New rule' };
    fixture.componentRef.setInput('definition', nextDefinition);
    fixture.detectChanges();
    expect(pending.cancelled).toBe(true);
    expect(component.selection()).toEqual({ search: '', filters: [] });
    const next = http.expectOne('/api/rules/execute?limit=100');
    expect(next.request.body).toEqual({ definition: nextDefinition });
    next.flush(result);
  });

  it('starts with empty filters after closing and reopening results', () => {
    component.applyFilters({ search: 'previous opening', filters: [] });
    const pending = http.expectOne('/api/rules/execute?limit=100');
    fixture.destroy();
    expect(pending.cancelled).toBe(true);
    fixture = TestBed.createComponent(RuleResultsComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('definition', definition);
    fixture.componentRef.setInput('metadata', metadata);
    fixture.detectChanges();
    expect(component.selection()).toEqual({ search: '', filters: [] });
    const request = http.expectOne('/api/rules/execute?limit=100');
    expect(request.request.body).toEqual({ definition });
    request.flush(result);
  });

  it('aborts filtering when the results component is removed', () => {
    component.applyFilters({ search: 'דנה', filters: [] });
    const request = http.expectOne('/api/rules/execute?limit=100');
    fixture.destroy();
    expect(request.cancelled).toBe(true);
  });
});
