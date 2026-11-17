import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { MetadataResponse, RuleSummary } from '../../../core/api/api.models';
import { SavedRulesPageComponent } from './saved-rules-page.component';

const metadata: MetadataResponse = {
  version: 1,
  entities: [{ id: 'customEntity', label: 'נתונים עסקיים לדוגמה', fields: [] }],
  relationships: [],
};

function rule(id: number, description: string | null = 'תיאור עסקי'): RuleSummary {
  return {
    id,
    name: `בקרה ${id}`,
    description,
    rootEntityId: 'customEntity',
    definitionVersion: 1,
    createdAtUtc: '2026-11-12T00:00:00Z',
    updatedAtUtc: '2026-11-12T00:00:00Z',
  };
}

describe('Saved rules page with API services', () => {
  let fixture: ComponentFixture<SavedRulesPageComponent>;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SavedRulesPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SavedRulesPageComponent);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function listRequest(page = 1) {
    const request = http.expectOne(
      (req) =>
        req.url === '/api/rules' &&
        req.params.get('page') === String(page) &&
        req.params.get('pageSize') === '20',
    );
    expect(request.request.method).toBe('GET');
    return request;
  }

  function finishList(items: RuleSummary[], totalCount = items.length, page = 1) {
    listRequest(page).flush({ items, totalCount, page, pageSize: 20 });
    fixture.detectChanges();
  }

  function button(text: string) {
    return Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((element) => element.textContent?.trim() === text)!;
  }

  it('keeps AI creation out of the list heading', () => {
    http.expectOne('/api/metadata').flush(metadata);
    finishList([]);
    expect(fixture.nativeElement.querySelector('.ai-create')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-ai-rule-creator')).toBeNull();
  });

  it('opens saved-rule editing as a route and preserves the current list page', () => {
    http.expectOne('/api/metadata').flush(metadata);
    finishList([rule(1)], 46);
    button('הבא').click();
    finishList([rule(21)], 46, 2);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.nativeElement.querySelector('.entity-field button:not(.primary)').click();
    expect(navigate).toHaveBeenCalledWith(['/rules', 21, 'edit'], { queryParams: { page: 2 } });
    expect(fixture.nativeElement.querySelector('app-rule-editor')).toBeNull();
    http.expectNone('/api/rules/21');
  });

  it('shows loading until both the list and business metadata arrive', () => {
    expect(fixture.nativeElement.textContent).toContain('טוען את הבקרות');
    finishList([rule(1)]);
    expect(fixture.nativeElement.querySelector('.rule')).toBeNull();
    http.expectOne('/api/metadata').flush(metadata);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.rule')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[aria-busy="false"]')).not.toBeNull();
  });

  it('renders business labels from metadata and a fallback for missing descriptions', () => {
    http.expectOne('/api/metadata').flush(metadata);
    finishList([rule(1, null)]);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('בקרה 1');
    expect(text).toContain('נתונים עסקיים לדוגמה');
    expect(text).toContain('לא נוסף תיאור');
    expect(text).not.toContain('customEntity');
  });

  it('numbers list positions independently of IDs and badges only AI-created rules', () => {
    http.expectOne('/api/metadata').flush(metadata);
    finishList([
      { ...rule(7), createdWithAi: true },
      { ...rule(99), createdWithAi: false },
    ]);
    const rows = fixture.nativeElement.querySelectorAll('.rule');
    expect(rows[0].querySelector('.rule-mark').textContent.trim()).toBe('1');
    expect(rows[1].querySelector('.rule-mark').textContent.trim()).toBe('2');
    expect(rows[0].querySelector('.ai-origin').textContent).toContain('נוצרה בעזרת AI');
    expect(rows[1].querySelector('.ai-origin')).toBeNull();
  });

  it('uses server pagination, caches metadata, and disables buttons at the boundaries', () => {
    http.expectOne('/api/metadata').flush(metadata);
    finishList([rule(1)], 21);
    expect(button('הקודם').disabled).toBe(true);
    button('הבא').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.rule')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('טוען');
    http.expectNone('/api/metadata');
    finishList([rule(21)], 21, 2);
    expect(fixture.nativeElement.querySelector('.rule-mark').textContent.trim()).toBe('21');
    expect(fixture.nativeElement.textContent).toContain('עמוד 2 מתוך 2');
    expect(button('הבא').disabled).toBe(true);
    button('הקודם').click();
    finishList([rule(1)], 21);
    expect(fixture.nativeElement.querySelector('.rule-mark').textContent.trim()).toBe('1');
    expect(fixture.nativeElement.textContent).toContain('עמוד 1 מתוך 2');
  });

  it('distinguishes a successfully loaded empty list from a loading or error state', () => {
    http.expectOne('/api/metadata').flush(metadata);
    finishList([]);
    expect(fixture.nativeElement.textContent).toContain('עדיין אין בקרות שמורות');
    expect(fixture.nativeElement.querySelector('app-pagination')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('retries the failed page without exposing internal server details', () => {
    http.expectOne('/api/metadata').flush(metadata);
    finishList([rule(1)], 21);
    button('הבא').click();
    listRequest(2).flush(
      { title: 'Internal SQL details' },
      { status: 503, statusText: 'Unavailable' },
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Internal SQL');
    button('ניסיון חוזר').click();
    finishList([rule(21)], 21, 2);
    expect(fixture.nativeElement.textContent).toContain('בקרה 21');
  });

  it('recovers when metadata fails instead of caching the error', () => {
    finishList([rule(1)]);
    http.expectOne('/api/metadata').flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    button('ניסיון חוזר').click();
    http.expectOne('/api/metadata').flush(metadata);
    finishList([rule(1)]);
    expect(fixture.nativeElement.textContent).toContain('נתונים עסקיים לדוגמה');
  });

  it('cancels an obsolete page request so it cannot replace newer results', () => {
    http.expectOne('/api/metadata').flush(metadata);
    const obsolete = listRequest();
    fixture.componentInstance.loadPage(2);
    expect(obsolete.cancelled).toBe(true);
    finishList([rule(21)], 21, 2);
    expect(fixture.nativeElement.textContent).toContain('בקרה 21');
  });

  it('returns to the last available page if records were deleted by another client', () => {
    http.expectOne('/api/metadata').flush(metadata);
    finishList([rule(1)], 21);
    button('הבא').click();
    finishList([], 20, 2);
    finishList([rule(1)], 20);
    expect(fixture.nativeElement.textContent).toContain('עמוד 1 מתוך 1');
  });

  it('uses a business fallback when an entity is absent from the catalog', () => {
    http.expectOne('/api/metadata').flush({ ...metadata, entities: [] });
    finishList([rule(1)]);
    expect(fixture.nativeElement.textContent).toContain('סוג נתונים לא זמין');
    expect(fixture.nativeElement.textContent).not.toContain('customEntity');
  });

  it('requires confirmation, focuses cancel and cancels with Escape without deleting', async () => {
    http.expectOne('/api/metadata').flush(metadata);
    finishList([rule(1)]);
    button('מחיקה').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.delete-confirmation').textContent).toContain(
      rule(1).name,
    );
    expect(document.activeElement).toBe(button('ביטול'));
    http.expectNone((req) => req.method === 'DELETE');
    button('ביטול').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.delete-confirmation')).toBeNull();
    expect(document.activeElement).toBe(button('מחיקה'));
    http.expectNone((req) => req.method === 'DELETE');
  });

  it('deletes once after confirmation and reloads counts from the server', async () => {
    http.expectOne('/api/metadata').flush(metadata);
    finishList([rule(1), rule(2)]);
    button('מחיקה').click();
    fixture.detectChanges();
    button('מחיקת הבקרה').click();
    fixture.componentInstance.confirmDelete(1);
    fixture.componentInstance.cancelDelete();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(button('ביטול').disabled).toBe(true);
    expect(button('מוחקים…').disabled).toBe(true);
    const request = http.expectOne('/api/rules/1');
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    finishList([rule(2)]);
    expect(fixture.nativeElement.querySelectorAll('.rule').length).toBe(1);
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain(
      rule(1).name,
    );
  });

  it('returns to the previous page after deleting its last rule', () => {
    http.expectOne('/api/metadata').flush(metadata);
    finishList([rule(1)], 21);
    fixture.componentInstance.loadPage(2);
    finishList([rule(21)], 21, 2);
    fixture.componentInstance.requestDelete(21);
    fixture.componentInstance.confirmDelete(21);
    http.expectOne('/api/rules/21').flush(null, { status: 204, statusText: 'No Content' });
    finishList([], 20, 2);
    finishList([rule(1)], 20);
    expect(fixture.componentInstance.state().page).toBe(1);
  });

  it('keeps a failed deletion visible with safe errors and supports retry', () => {
    http.expectOne('/api/metadata').flush(metadata);
    finishList([rule(1)]);
    fixture.componentInstance.requestDelete(1);
    fixture.componentInstance.confirmDelete(1);
    http
      .expectOne('/api/rules/1')
      .flush({ title: 'INTERNAL_DETAILS' }, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.rule').length).toBe(1);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).not.toContain(
      'INTERNAL_DETAILS',
    );
    expect(fixture.componentInstance.deletingId()).toBeNull();
    fixture.componentInstance.confirmDelete(1);
    http.expectOne('/api/rules/1').flush(null, { status: 204, statusText: 'No Content' });
    finishList([]);
    expect(fixture.nativeElement.querySelector('.rule')).toBeNull();
  });

  it('refreshes the list when the rule was already deleted by another client', () => {
    http.expectOne('/api/metadata').flush(metadata);
    finishList([rule(1)]);
    fixture.componentInstance.requestDelete(1);
    fixture.componentInstance.confirmDelete(1);
    http.expectOne('/api/rules/1').flush({}, { status: 404, statusText: 'Not Found' });
    finishList([]);
    expect(fixture.componentInstance.saveNotice()).toContain('כבר אינה קיימת');
  });

  it('does not delete without a matching confirmation', () => {
    http.expectOne('/api/metadata').flush(metadata);
    finishList([rule(1)]);
    fixture.componentInstance.confirmDelete(1);
    fixture.componentInstance.requestDelete(999);
    http.expectNone((req) => req.method === 'DELETE');
  });

  it('cancels in-flight requests when the page is destroyed', () => {
    const rules = listRequest();
    const catalog = http.expectOne('/api/metadata');
    fixture.destroy();
    expect(rules.cancelled).toBe(true);
    expect(catalog.cancelled).toBe(true);
  });
});
