import { ViewportScroller } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../../app.routes';
import { MetadataResponse, RuleDefinition } from '../../../core/api/api.models';
import { AiRuleCreatorComponent } from '../ai-rule-creator/ai-rule-creator.component';
import { RuleEditorComponent } from '../rule-editor/rule-editor.component';
import { AiRulePageComponent } from './ai-rule-page.component';

const metadata: MetadataResponse = {
  version: 1,
  entities: [
    { id: 'employee', label: 'עובדים', fields: [{ id: 'salary', label: 'שכר', type: 'number' }] },
  ],
  relationships: [],
};
const proposal: RuleDefinition = {
  name: 'בקרת שכר',
  description: 'תיאור',
  rootEntityId: 'employee',
  condition: {
    kind: 'comparison',
    left: { fieldId: 'salary' },
    operator: 'greaterThan',
    right: { kind: 'constant', value: 15000 },
  },
};
const saved = {
  id: 41,
  definition: proposal,
  createdWithAi: true,
  definitionVersion: 1,
  createdAtUtc: '',
  updatedAtUtc: '',
};

describe('AI creation page', () => {
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
    const page = await harness.navigateByUrl('/rules/ai/new?page=2', AiRulePageComponent);
    http.expectOne('/api/metadata').flush(metadata);
    harness.detectChanges();
    http
      .expectOne('/api/ai/proposals/examples')
      .flush(['Example A', 'Example B', 'Example C', 'Example D', 'Example E']);
    harness.detectChanges();
    return page;
  }
  function creator() {
    return harness.routeDebugElement!.query(By.directive(AiRuleCreatorComponent))
      .componentInstance as AiRuleCreatorComponent;
  }
  function editor() {
    return harness.routeDebugElement!.query(By.directive(RuleEditorComponent))
      .componentInstance as RuleEditorComponent;
  }
  function generate() {
    creator().updateDescription(creator().examples()[1]);
    creator().generate();
    http.expectOne('/api/ai/proposals').flush(proposal);
    harness.detectChanges();
  }
  function finishList(page: number) {
    http
      .expectOne((req) => req.url === '/api/rules' && req.params.get('page') === String(page))
      .flush({
        items: [{ id: saved.id, ...proposal, createdWithAi: true }],
        totalCount: 41,
        page,
        pageSize: 20,
      });
    harness.detectChanges();
  }

  it('opens directly as a page with examples and no dialog', async () => {
    await open();
    expect(harness.routeNativeElement!.querySelector('main.ai-page')).not.toBeNull();
    expect(harness.routeNativeElement!.querySelector('dialog')).toBeNull();
    expect(harness.routeNativeElement!.querySelectorAll('.examples button').length).toBe(5);
    http.expectNone('/api/ai/proposals');
  });

  it('reviews and executes an approved proposal in the same page without saving', async () => {
    await open();
    generate();
    expect(router.url).toBe('/rules/ai/new?page=2');
    expect(harness.routeNativeElement!.querySelector('dialog')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('h1')!.textContent).toContain('בדיקת הצעת AI');
    expect(editor().requiresApproval()).toBe(true);
    editor().perform('run');
    http.expectNone(() => true);
    editor().proposalApproved.set(true);
    editor().perform('run');
    const execution = http.expectOne('/api/rules/execute?limit=100');
    expect(execution.request.body).toEqual({ definition: proposal });
    execution.flush({
      totalCount: 0,
      returnedCount: 0,
      truncated: false,
      columns: [],
      records: [],
    });
    harness.detectChanges();
    expect(editor().preview()).not.toBeNull();
    http.expectNone((req) => req.url === '/api/rules' && req.method === 'POST');
  });

  it('protects the description on sidebar navigation and preserves it on cancellation', async () => {
    await open();
    const form = creator();
    form.updateDescription(form.examples()[0]);
    const navigation = router.navigateByUrl('/rules?page=2');
    await vi.waitFor(() => expect(form.confirmClose()).toBe(true));
    form.cancelClose();
    expect(await navigation).toBe(false);
    expect(form.description()).toBe(form.examples()[0]);
    expect(router.url).toBe('/rules/ai/new?page=2');
  });

  it('returns to the original list page after discarding text', async () => {
    await open();
    const form = creator();
    form.updateDescription(form.examples()[0]);
    const navigation = router.navigateByUrl('/rules?page=2');
    await vi.waitFor(() => expect(form.confirmClose()).toBe(true));
    form.close();
    expect(await navigation).toBe(true);
    harness.detectChanges();
    finishList(2);
  });

  it('cancels a pending AI request when leaving the page', async () => {
    await open();
    creator().updateDescription(creator().examples()[0]);
    creator().generate();
    const request = http.expectOne('/api/ai/proposals');
    expect(await router.navigateByUrl('/rules?page=2')).toBe(true);
    expect(request.cancelled).toBe(true);
    harness.detectChanges();
    finishList(2);
  });

  it('protects the generated proposal when navigating away', async () => {
    await open();
    generate();
    const form = editor();
    const navigation = router.navigateByUrl('/rules?page=2');
    await vi.waitFor(() => expect(form.confirmClose()).toBe(true));
    form.cancelClose();
    expect(await navigation).toBe(false);
    expect(form.draft()).toEqual(proposal);
  });

  it('saves with AI origin and returns to the last list page with success feedback', async () => {
    await open();
    generate();
    editor().proposalApproved.set(true);
    harness.detectChanges();
    harness
      .routeNativeElement!.querySelector<HTMLButtonElement>('.footer-actions .primary')!
      .click();
    http.expectOne('/api/rules?createdWithAi=true').flush(saved);
    http
      .expectOne((req) => req.url === '/api/rules' && req.params.get('page') === '1')
      .flush({
        items: [],
        totalCount: 41,
        page: 1,
        pageSize: 20,
      });
    await vi.waitFor(() => expect(router.url).toBe('/rules?page=3'));
    harness.detectChanges();
    finishList(3);
    expect(harness.routeNativeElement!.textContent).toContain('נשמרה בהצלחה');
    expect(harness.routeNativeElement!.querySelector('.ai-origin')).not.toBeNull();
  });

  it('retries metadata failures without sending a proposal prematurely', async () => {
    const page = await harness.navigateByUrl('/rules/ai/new', AiRulePageComponent);
    http.expectOne('/api/metadata').flush({}, { status: 503, statusText: 'Unavailable' });
    harness.detectChanges();
    expect(page.error()).not.toBe('');
    page.loadMetadata();
    http.expectOne('/api/metadata').flush(metadata);
    harness.detectChanges();
    http
      .expectOne('/api/ai/proposals/examples')
      .flush(['Example A', 'Example B', 'Example C', 'Example D', 'Example E']);
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('main.ai-page')).not.toBeNull();
    http.expectNone('/api/ai/proposals');
  });
});
