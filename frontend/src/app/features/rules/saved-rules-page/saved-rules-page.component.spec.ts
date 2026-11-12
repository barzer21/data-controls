import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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

  it('refreshes the final list page after creating a rule and reports success', () => {
    http.expectOne('/api/metadata').flush(metadata);
    finishList([rule(1)], 46);
    const page = fixture.componentInstance;
    page.openEditor(null);
    page.onSaved({
      id: 47,
      definition: {
        name: 'בקרה חדשה',
        description: null,
        rootEntityId: 'customEntity',
        condition: { kind: 'comparison', left: { fieldId: 'any' }, operator: 'isNull' },
      },
      definitionVersion: 1,
      createdAtUtc: '',
      updatedAtUtc: '',
    });
    finishList([rule(47)], 47, 3);
    expect(page.editor()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('נשמרה בהצלחה');
    expect(fixture.nativeElement.textContent).toContain('עמוד 3 מתוך 3');
  });

  it('refreshes the current page after editing an existing rule', () => {
    http.expectOne('/api/metadata').flush(metadata);
    finishList([rule(1)], 46);
    button('הבא').click();
    finishList([rule(21)], 46, 2);
    const page = fixture.componentInstance;
    page.openEditor(21);
    page.onSaved({
      id: 21,
      definition: {
        name: 'בקרה מעודכנת',
        description: null,
        rootEntityId: 'customEntity',
        condition: { kind: 'comparison', left: { fieldId: 'any' }, operator: 'isNull' },
      },
      definitionVersion: 1,
      createdAtUtc: '',
      updatedAtUtc: '',
    });
    finishList([rule(21)], 46, 2);
    expect(fixture.nativeElement.textContent).toContain('עמוד 2 מתוך 3');
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
    expect(fixture.nativeElement.textContent).toContain('עמוד 2 מתוך 2');
    expect(button('הבא').disabled).toBe(true);
    button('הקודם').click();
    finishList([rule(1)], 21);
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

  it('cancels in-flight requests when the page is destroyed', () => {
    const rules = listRequest();
    const catalog = http.expectOne('/api/metadata');
    fixture.destroy();
    expect(rules.cancelled).toBe(true);
    expect(catalog.cancelled).toBe(true);
  });
});
