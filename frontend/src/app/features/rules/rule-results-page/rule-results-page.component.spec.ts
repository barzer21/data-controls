import { By } from '@angular/platform-browser';
import { RuleResultsComponent } from '../../../shared/rule-results/rule-results.component';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { MetadataResponse, RuleDefinition, SavedRuleResponse } from '../../../core/api/api.models';
import { SavedRulesPageComponent } from '../saved-rules-page/saved-rules-page.component';
import { RuleResultsPageComponent } from './rule-results-page.component';

const metadata: MetadataResponse = {
  version: 1,
  entities: [
    {
      id: 'worker',
      label: 'עובדים',
      fields: [
        { id: 'name', label: 'שם', type: 'text' },
        { id: 'pay', label: 'שכר', type: 'number' },
        { id: 'active', label: 'עובד פעיל', type: 'boolean' },
      ],
    },
    {
      id: 'unit',
      label: 'מחלקות',
      fields: [{ id: 'active', label: 'מחלקה פעילה', type: 'boolean' }],
    },
  ],
  relationships: [
    {
      id: 'unitLink',
      label: 'מחלקת העובד',
      fromEntity: 'worker',
      toEntity: 'unit',
      cardinality: 'manyToOne',
    },
  ],
};
const definition: RuleDefinition = {
  name: 'בקרת דוגמה',
  description: 'תיאור הבקרה',
  rootEntityId: 'worker',
  condition: {
    kind: 'group',
    operator: 'and',
    children: [
      {
        kind: 'comparison',
        left: { fieldId: 'pay' },
        operator: 'greaterThan',
        right: { kind: 'constant', value: 15000 },
      },
      {
        kind: 'group',
        operator: 'or',
        children: [
          {
            kind: 'comparison',
            left: { fieldId: 'active', relationshipPath: ['unitLink'] },
            operator: 'equals',
            right: { kind: 'constant', value: false },
          },
          { kind: 'comparison', left: { fieldId: 'pay' }, operator: 'isNull' },
        ],
      },
    ],
  },
};
const saved: SavedRuleResponse = {
  id: 7,
  definition,
  definitionVersion: 1,
  createdAtUtc: '',
  updatedAtUtc: '',
};
const emptyResult = { totalCount: 0, returnedCount: 0, truncated: false, columns: [], records: [] };
const filterResult = {
  totalCount: 301,
  returnedCount: 1,
  truncated: true,
  columns: [
    { id: 'pay', label: 'שכר', type: 'number' },
    { id: 'active', label: 'פעיל', type: 'boolean' },
    { id: 'name', label: 'שם', type: 'text' },
    { id: 'unitLink.active', label: 'מחלקה פעילה', type: 'boolean' },
  ],
  records: [
    {
      id: 17,
      values: { pay: 20000, active: true, name: 'דנה', 'unitLink.active': false },
      failureReason: 'סיבת החריגה המקורית',
      explanation: {},
    },
  ],
};

describe('Rule results route', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'rules/:id/results', component: RuleResultsPageComponent },
          { path: 'rules', component: SavedRulesPageComponent },
        ]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });
  afterEach(() => http.verify());

  async function open() {
    const component = await harness.navigateByUrl(
      '/rules/7/results?page=2',
      RuleResultsPageComponent,
    );
    http.expectOne('/api/rules/7').flush(saved);
    http.expectOne('/api/metadata').flush(metadata);
    harness.detectChanges();
    return results();
  }
  function results(): RuleResultsComponent {
    return harness.fixture.debugElement.query(By.directive(RuleResultsComponent)).componentInstance;
  }
  function execution() {
    const request = http.expectOne('/api/rules/execute?limit=100');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ definition });
    return request;
  }
  function text() {
    return harness.routeNativeElement!.textContent!;
  }

  it('runs the displayed saved snapshot without saving and preserves the summary during execution', async () => {
    await open();
    expect(text()).toContain('בקרת דוגמה');
    expect(text()).toContain('מעדכנים את תוצאות ההרצה');
    expect(text()).toContain('כל התנאים');
    expect(text()).toContain('לפחות אחד');
    expect(text()).toContain('מחלקת העובד › מחלקה פעילה');
    expect(text()).toContain('15,000');
    expect(text()).not.toContain('unitLink');
    http.expectNone(
      (request) =>
        request.method === 'PUT' || (request.url === '/api/rules' && request.method === 'POST'),
    );
    execution().flush(emptyResult);
    harness.detectChanges();
    expect(text()).toContain('לא נמצאו חריגות');
    expect(text()).toContain('בקרת דוגמה');
  });

  it('renders server-defined column order, typed values, IDs and failure reasons', async () => {
    await open();
    execution().flush({
      totalCount: 301,
      returnedCount: 1,
      truncated: true,
      columns: [
        { id: 'b', label: 'תאריך עסקי', type: 'date' },
        { id: 'a', label: 'סכום', type: 'number' },
        { id: 'c', label: 'מצב', type: 'boolean' },
        { id: 'd', label: 'ערך חסר', type: 'text' },
      ],
      records: [
        {
          id: 17,
          values: { a: 0, b: '2026-11-12T00:00:00', c: false, d: null },
          failureReason: 'השכר אינו תקין\nתנאי נוסף התקיים',
          explanation: {},
        },
      ],
    });
    harness.detectChanges();
    const headers = Array.from(harness.routeNativeElement!.querySelectorAll('th')).map((node) =>
      node.textContent!.trim(),
    );
    expect(headers).toEqual(['מזהה רשומה', 'תאריך עסקי', 'סכום', 'מצב', 'ערך חסר', 'הסיבה לחריגה']);
    const cells = Array.from(harness.routeNativeElement!.querySelectorAll('td')).map((node) =>
      node.textContent!.trim(),
    );
    expect(cells).toEqual([
      '17',
      '12/11/2026',
      '0',
      'לא',
      'לא צוין',
      'השכר אינו תקין\nתנאי נוסף התקיים',
    ]);
    expect(text()).toContain('מתוך 301');
    expect(text()).toContain('דפדוף בתוצאות עדיין אינו זמין');
  });

  it('handles a deleted rule without sending an execution request', async () => {
    await harness.navigateByUrl('/rules/7/results', RuleResultsPageComponent);
    http.expectOne('/api/metadata').flush(metadata);
    http.expectOne('/api/rules/7').flush({}, { status: 404, statusText: 'Not Found' });
    harness.detectChanges();
    expect(text()).toContain('ייתכן שנמחקה');
    http.expectNone('/api/rules/execute?limit=100');
  });

  it('keeps conditions visible on execution errors and retries the displayed snapshot', async () => {
    const component = await open();
    execution().flush({ title: 'private SQL details' }, { status: 504, statusText: 'Timeout' });
    harness.detectChanges();
    expect(text()).toContain('חרגה מזמן ההמתנה');
    expect(text()).toContain('בקרת דוגמה');
    expect(text()).not.toContain('private SQL');
    component.retry();
    http.expectNone('/api/rules/7');
    http.expectNone('/api/metadata');
    execution().flush(emptyResult);
    harness.detectChanges();
    expect(text()).toContain('לא נמצאו חריגות');
  });

  it('rejects invalid route IDs without HTTP requests', async () => {
    await harness.navigateByUrl('/rules/invalid/results', RuleResultsPageComponent);
    expect(text()).toContain('מזהה הבקרה אינו תקין');
    http.expectNone(() => true);
  });

  it('returns to the previous list page and restores server pagination', async () => {
    await open();
    execution().flush(emptyResult);
    await harness.navigateByUrl('/rules?page=2', SavedRulesPageComponent);
    const request = http.expectOne('/api/rules?page=2&pageSize=20');
    request.flush({ items: [{ id: 7, ...definition }], totalCount: 21, page: 2, pageSize: 20 });
    harness.detectChanges();
    const link = harness.routeNativeElement!.querySelector(
      'button[aria-label="הרץ בקרה: בקרת דוגמה"]',
    );
    expect(link).not.toBeNull();
    expect(text()).toContain('עמוד 2 מתוך 2');
  });

  it('cancels pending execution when leaving the results route', async () => {
    await open();
    const request = execution();
    harness.fixture.destroy();
    expect(request.cancelled).toBe(true);
  });

  it('sends search and numeric filters with the original snapshot without fetching or saving again', async () => {
    const component = await open();
    execution().flush(filterResult);
    harness.detectChanges();
    component.applyFilters({
      search: 'דנה',
      filters: [{ columnId: 'pay', operator: 'greaterThanOrEqual', value: 18000 }],
    });
    const request = http.expectOne('/api/rules/execute?limit=100');
    expect(request.request.body).toEqual({
      definition,
      options: {
        search: 'דנה',
        filter: {
          kind: 'comparison',
          left: { fieldId: 'pay' },
          operator: 'greaterThanOrEqual',
          right: { kind: 'constant', value: 18000 },
        },
      },
    });
    http.expectNone('/api/rules/7');
    http.expectNone(
      (req) => req.method === 'PUT' || (req.method === 'POST' && req.url === '/api/rules'),
    );
    request.flush({ ...filterResult, totalCount: 1, truncated: false });
    harness.detectChanges();
    expect(text()).toContain('התואמות לחיפוש ולסינון');
    expect(text()).toContain('סיבת החריגה המקורית');
    expect(text()).toContain('כל התנאים');
  });

  it('opens a typed filter from a table column header and submits its value', async () => {
    await open();
    execution().flush(filterResult);
    harness.detectChanges();
    (
      harness.routeNativeElement!.querySelector(
        'button[aria-label="סינון לפי שכר"]',
      ) as HTMLButtonElement
    ).click();
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const panel = harness.routeNativeElement!.querySelector('.column-panel')!;
    const operator = panel.querySelector('select')!;
    operator.value = 'greaterThan';
    operator.dispatchEvent(new Event('change'));
    const value = panel.querySelector('input')!;
    value.value = '25000';
    value.dispatchEvent(new Event('input'));
    panel.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const request = http.expectOne('/api/rules/execute?limit=100');
    expect(request.request.body.options.filter.right.value).toBe(25000);
    request.flush({
      ...filterResult,
      totalCount: 0,
      returnedCount: 0,
      truncated: false,
      records: [],
    });
    harness.detectChanges();
    expect(text()).toContain('לא נמצאו תוצאות התואמות');
    expect(
      harness.routeNativeElement!.querySelector('button[aria-label="סינון לפי שכר"]'),
    ).not.toBeNull();
  });

  it('clears filtering after zero matches and returns to the original execution request', async () => {
    const component = await open();
    execution().flush(filterResult);
    harness.detectChanges();
    component.applyFilters({ search: 'אין תוצאות', filters: [] });
    http
      .expectOne('/api/rules/execute?limit=100')
      .flush({ ...filterResult, totalCount: 0, returnedCount: 0, truncated: false, records: [] });
    harness.detectChanges();
    const clear = Array.from(harness.routeNativeElement!.querySelectorAll('button')).find(
      (button) => button.textContent!.trim() === 'נקה הכל',
    )!;
    clear.click();
    execution().flush(filterResult);
    harness.detectChanges();
    expect(component.filtered()).toBe(false);
    expect(text()).toContain('סיבת החריגה המקורית');
  });

  it('cancels outdated filter requests and never shows an old response under new criteria', async () => {
    const component = await open();
    execution().flush(filterResult);
    component.applyFilters({ search: 'ראשון', filters: [] });
    const first = http.expectOne('/api/rules/execute?limit=100');
    component.applyFilters({ search: 'שני', filters: [] });
    expect(first.cancelled).toBe(true);
    const second = http.expectOne('/api/rules/execute?limit=100');
    expect(second.request.body.options.search).toBe('שני');
    second.flush({ ...filterResult, totalCount: 2 });
    harness.detectChanges();
    expect(component.selection().search).toBe('שני');
    expect(text()).toContain('סיבת החריגה המקורית');
  });

  it('keeps controls and active criteria on server errors so the user can clear them', async () => {
    const component = await open();
    execution().flush(filterResult);
    harness.detectChanges();
    component.applyFilters({ search: 'דנה', filters: [] });
    http
      .expectOne('/api/rules/execute?limit=100')
      .flush(
        { errors: [{ message: 'אפשרויות החיפוש אינן תקינות.' }] },
        { status: 400, statusText: 'Bad Request' },
      );
    harness.detectChanges();
    expect(text()).toContain('אפשרויות החיפוש אינן תקינות');
    expect(harness.routeNativeElement!.querySelector('app-result-filters')).not.toBeNull();
    component.applyFilters({ search: '', filters: [] });
    execution().flush(filterResult);
  });

  it('preserves active criteria when retrying a failed execution', async () => {
    const component = await open();
    execution().flush(filterResult);
    component.applyFilters({ search: 'דנה', filters: [] });
    http
      .expectOne('/api/rules/execute?limit=100')
      .flush({}, { status: 504, statusText: 'Timeout' });
    component.retry();
    http.expectNone('/api/rules/7');
    const request = http.expectOne('/api/rules/execute?limit=100');
    expect(request.request.body.options.search).toBe('דנה');
    request.flush(filterResult);
    expect(component.selection().search).toBe('דנה');
  });

  it('resets filters and cancels pending work when navigating to another rule', async () => {
    const component = await open();
    execution().flush(filterResult);
    component.applyFilters({ search: 'דנה', filters: [] });
    const old = http.expectOne('/api/rules/execute?limit=100');
    const next = await harness.navigateByUrl('/rules/8/results?page=2', RuleResultsPageComponent);
    expect(old.cancelled).toBe(true);
    http.expectOne('/api/rules/8').flush({ ...saved, id: 8 });
    harness.detectChanges();
    execution().flush(filterResult);
    expect(results().selection()).toEqual({ search: '', filters: [] });
  });
});
