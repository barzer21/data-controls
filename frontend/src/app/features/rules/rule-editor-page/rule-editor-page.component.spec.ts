import { ViewportScroller } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../../app.routes';
import { MetadataResponse, SavedRuleResponse } from '../../../core/api/api.models';
import { RuleEditorComponent } from '../rule-editor/rule-editor.component';
import { RuleEditorPageComponent } from './rule-editor-page.component';

const metadata: MetadataResponse = {
  version: 1,
  entities: [
    { id: 'employee', label: 'עובדים', fields: [{ id: 'salary', label: 'שכר', type: 'number' }] },
  ],
  relationships: [],
};
const saved: SavedRuleResponse = {
  id: 7,
  createdWithAi: true,
  definitionVersion: 1,
  createdAtUtc: '',
  updatedAtUtc: '',
  definition: {
    name: 'בקרת שכר',
    description: 'תיאור',
    rootEntityId: 'employee',
    condition: {
      kind: 'comparison',
      left: { fieldId: 'salary' },
      operator: 'greaterThan',
      right: { kind: 'constant', value: 15000 },
    },
  },
};

describe('Full-page rule editing', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let router: Router;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter(routes),
        { provide: ViewportScroller, useValue: { scrollToPosition: vi.fn() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    harness = await RouterTestingHarness.create();
  });
  afterEach(() => http.verify());

  async function open() {
    const page = await harness.navigateByUrl('/rules/7/edit?page=3', RuleEditorPageComponent);
    http.expectOne('/api/metadata').flush(metadata);
    harness.detectChanges();
    http.expectOne('/api/rules/7').flush(saved);
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    return page;
  }
  function editor() {
    return harness.routeDebugElement!.query(By.directive(RuleEditorComponent))
      .componentInstance as RuleEditorComponent;
  }
  function finishList(page = 3) {
    http
      .expectOne((req) => req.url === '/api/rules' && req.params.get('page') === String(page))
      .flush({
        items: [
          {
            id: 7,
            ...saved.definition,
            definitionVersion: 1,
            createdAtUtc: '',
            updatedAtUtc: '',
            createdWithAi: true,
          },
        ],
        totalCount: 60,
        page,
        pageSize: 20,
      });
    harness.detectChanges();
  }

  it('loads a saved definition on a real route without a dialog or automatic execution', async () => {
    await open();
    expect(harness.routeNativeElement!.querySelector('main.editor-page')).not.toBeNull();
    expect(harness.routeNativeElement!.querySelector('dialog')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('h1')!.textContent).toContain('עריכת בקרה');
    expect(editor().draft()).toEqual(saved.definition);
    expect(editor().dirty()).toBe(false);
    expect(editor().requiresApproval()).toBe(false);
    http.expectNone((req) => req.method !== 'GET');
  });

  it('creates on a full page, protects the draft and returns to the final list page after POST', async () => {
    await harness.navigateByUrl('/rules/new?page=2', RuleEditorPageComponent);
    http.expectOne('/api/metadata').flush(metadata);
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('main.editor-page')).not.toBeNull();
    expect(harness.routeNativeElement!.querySelector('dialog')).toBeNull();
    expect(editor().ruleId()).toBeNull();
    http.expectNone('/api/rules/0');
    editor().update({ ...saved.definition, name: 'בקרה חדשה' });
    const navigation = router.navigateByUrl('/rules?page=2');
    await vi.waitFor(() => expect(editor().confirmClose()).toBe(true));
    editor().cancelClose();
    expect(await navigation).toBe(false);
    harness.detectChanges();
    harness
      .routeNativeElement!.querySelector<HTMLButtonElement>('.footer-actions .primary')!
      .click();
    const request = http.expectOne('/api/rules');
    expect(request.request.method).toBe('POST');
    expect(request.request.params.has('createdWithAi')).toBe(false);
    request.flush({ ...saved, id: 61, createdWithAi: false, definition: request.request.body });
    http
      .expectOne((req) => req.url === '/api/rules' && req.params.get('page') === '1')
      .flush({ items: [], totalCount: 61, page: 1, pageSize: 20 });
    await vi.waitFor(() => expect(router.url).toBe('/rules?page=4'));
    harness.detectChanges();
    finishList(4);
    expect(harness.routeNativeElement!.textContent).toContain('נשמרה בהצלחה');
    expect(TestBed.inject(ViewportScroller).scrollToPosition).toHaveBeenCalledWith([0, 0]);
  });

  it('returns with success feedback even when the count request fails after creation', async () => {
    await harness.navigateByUrl('/rules/new?page=2', RuleEditorPageComponent);
    http.expectOne('/api/metadata').flush(metadata);
    harness.detectChanges();
    editor().update(structuredClone(saved.definition));
    harness.detectChanges();
    harness
      .routeNativeElement!.querySelector<HTMLButtonElement>('.footer-actions .primary')!
      .click();
    http.expectOne('/api/rules').flush({ ...saved, createdWithAi: false });
    http
      .expectOne((req) => req.url === '/api/rules' && req.params.get('page') === '1')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    await vi.waitFor(() => expect(router.url).toBe('/rules?page=2'));
    harness.detectChanges();
    finishList(2);
    expect(harness.routeNativeElement!.textContent).toContain('נשמרה בהצלחה');
    expect(TestBed.inject(ViewportScroller).scrollToPosition).toHaveBeenCalledWith([0, 0]);
  });

  it('returns to the same list page without confirmation when nothing changed', async () => {
    await open();
    harness.routeNativeElement!.querySelector<HTMLButtonElement>('header button')!.click();
    await vi.waitFor(() => expect(router.url).toBe('/rules?page=3'));
    harness.detectChanges();
    finishList();
    expect(harness.routeNativeElement!.querySelector('.rule-mark')!.textContent!.trim()).toBe('41');
  });

  it('protects dirty edits during navigation and keeps the draft when departure is cancelled', async () => {
    await open();
    const form = editor();
    form.update({ name: 'טיוטה' });
    const navigation = router.navigateByUrl('/rules?page=3');
    await vi.waitFor(() => expect(form.confirmClose()).toBe(true));
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('[role="region"]')).not.toBeNull();
    form.cancelClose();
    expect(await navigation).toBe(false);
    expect(router.url).toBe('/rules/7/edit?page=3');
    expect(form.draft().name).toBe('טיוטה');
    http.expectNone(() => true);
  });

  it('continues the requested navigation after explicit discard', async () => {
    await open();
    const form = editor();
    form.update({ name: 'טיוטה' });
    const navigation = router.navigateByUrl('/rules?page=3');
    await vi.waitFor(() => expect(form.confirmClose()).toBe(true));
    form.close();
    expect(await navigation).toBe(true);
    harness.detectChanges();
    finishList();
    expect(router.url).toBe('/rules?page=3');
    http.expectNone((req) => req.method !== 'GET');
  });

  it('saves through the existing endpoint then returns with a success notice', async () => {
    await open();
    const form = editor();
    form.update({ name: 'בקרה מעודכנת' });
    harness.detectChanges();
    harness
      .routeNativeElement!.querySelector<HTMLButtonElement>('.footer-actions .primary')!
      .click();
    const request = http.expectOne('/api/rules/7');
    expect(request.request.method).toBe('PUT');
    expect(request.request.params.has('createdWithAi')).toBe(false);
    request.flush({ ...saved, definition: request.request.body });
    await vi.waitFor(() => expect(router.url).toBe('/rules?page=3'));
    harness.detectChanges();
    finishList();
    expect(harness.routeNativeElement!.textContent).toContain('הבקרה „בקרה מעודכנת” נשמרה בהצלחה.');
    http.expectNone('/api/rules/execute?limit=100');
  });

  it('blocks navigation during execution and runs an unsaved snapshot without saving', async () => {
    await open();
    const form = editor();
    form.update({ name: 'טיוטה' });
    form.perform('run');
    expect(await router.navigateByUrl('/rules?page=3')).toBe(false);
    const execution = http.expectOne('/api/rules/execute?limit=100');
    expect(execution.request.body.definition.name).toBe('טיוטה');
    execution.flush({
      totalCount: 0,
      returnedCount: 0,
      truncated: false,
      columns: [],
      records: [],
    });
    harness.detectChanges();
    expect(form.preview()).not.toBeNull();
    expect(form.dirty()).toBe(true);
    http.expectNone(
      (req) => req.method === 'PUT' || (req.method === 'POST' && req.url === '/api/rules'),
    );
  });

  it('protects edits on ID changes and creates a new editor for the next rule', async () => {
    await open();
    const first = editor();
    first.update({ name: 'טיוטה' });
    const navigation = router.navigateByUrl('/rules/8/edit?page=2');
    await vi.waitFor(() => expect(first.confirmClose()).toBe(true));
    first.close();
    expect(await navigation).toBe(true);
    harness.detectChanges();
    http
      .expectOne('/api/rules/8')
      .flush({ ...saved, id: 8, definition: { ...saved.definition, name: 'בקרה אחרת' } });
    harness.detectChanges();
    const next = editor();
    expect(next).not.toBe(first);
    expect(next.draft().name).toBe('בקרה אחרת');
    next.update({ name: 'טיוטה אחרת' });
    const back = router.navigateByUrl('/rules?page=2');
    await vi.waitFor(() => expect(next.confirmClose()).toBe(true));
    next.cancelClose();
    expect(await back).toBe(false);
  });

  it('shows invalid-ID and load errors without losing the return link', async () => {
    const page = await harness.navigateByUrl('/rules/invalid/edit?page=2', RuleEditorPageComponent);
    expect(page.state().status).toBe('error');
    expect(harness.routeNativeElement!.textContent).toContain('מזהה הבקרה אינו תקין');
    http.expectNone(() => true);
  });
});
