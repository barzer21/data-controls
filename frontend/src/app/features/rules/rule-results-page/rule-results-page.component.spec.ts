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
    return component;
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
    expect(text()).toContain('הבקרה מתבצעת');
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

  it('keeps conditions visible on execution errors and retries with a freshly loaded snapshot', async () => {
    const component = await open();
    execution().flush({ title: 'private SQL details' }, { status: 504, statusText: 'Timeout' });
    harness.detectChanges();
    expect(text()).toContain('חרגה מזמן ההמתנה');
    expect(text()).toContain('בקרת דוגמה');
    expect(text()).not.toContain('private SQL');
    component.retry();
    http.expectOne('/api/rules/7').flush(saved);
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
});
