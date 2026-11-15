import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MetadataResponse, RuleDefinition, SavedRuleResponse } from '../../../core/api/api.models';
import { RuleEditorDialogComponent } from './rule-editor-dialog.component';

const metadata: MetadataResponse = {
  version: 1,
  entities: [
    {
      id: 'custom',
      label: 'נתוני בדיקה',
      fields: [{ id: 'amount', label: 'סכום עסקי', type: 'number' }],
    },
    {
      id: 'other',
      label: 'נתונים אחרים',
      fields: [{ id: 'title', label: 'כותרת עסקית', type: 'text' }],
    },
  ],
  relationships: [],
};
const definition: RuleDefinition = {
  name: 'בקרה שמורה',
  description: 'תיאור שמור',
  rootEntityId: 'custom',
  condition: {
    kind: 'comparison',
    left: { fieldId: 'amount' },
    operator: 'greaterThan',
    right: { kind: 'constant', value: 15000 },
  },
};
const saved: SavedRuleResponse = {
  id: 7,
  definition,
  definitionVersion: 1,
  createdAtUtc: '',
  updatedAtUtc: '',
};

describe('Rule editor dialog with API transport', () => {
  let fixture: ComponentFixture<RuleEditorDialogComponent>;
  let editor: RuleEditorDialogComponent;
  let http: HttpTestingController;
  const showModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
  const close = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');

  beforeAll(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value() {
        this.setAttribute('open', '');
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value() {
        this.removeAttribute('open');
      },
    });
  });
  afterAll(() => {
    for (const [key, descriptor] of [
      ['showModal', showModal],
      ['close', close],
    ] as const) {
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, key, descriptor);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, key);
    }
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RuleEditorDialogComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(RuleEditorDialogComponent);
    fixture.componentRef.setInput('metadata', metadata);
    editor = fixture.componentInstance;
  });
  afterEach(() => {
    fixture.destroy();
    http.verify();
  });

  function open(id: number | null = null) {
    fixture.componentRef.setInput('ruleId', id);
    fixture.detectChanges();
    if (id !== null) {
      http.expectOne(`/api/rules/${id}`).flush(saved);
      fixture.detectChanges();
    }
  }
  function fill() {
    editor.update(structuredClone(definition));
    fixture.detectChanges();
  }
  function validate() {
    const request = http.expectOne('/api/rules/validate');
    expect(request.request.body).toEqual(definition);
    request.flush({ isValid: true, errors: [] });
  }

  it('opens an accessible new-rule modal with business metadata and separate actions', () => {
    open();
    expect(
      fixture.nativeElement.querySelector('dialog[open][aria-labelledby="editor-title"]'),
    ).not.toBeNull();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('בקרה חדשה');
    expect(text).toContain('נתוני בדיקה');
    expect(text).toContain('סכום עסקי');
    const runButton = Array.from(
      fixture.nativeElement.querySelectorAll('.footer-actions button[type="button"]'),
    ).find((node) => (node as HTMLButtonElement).textContent?.trim() === 'הרצה');
    expect(runButton).toBeDefined();
    expect(text).toContain('שמירה והרצה הן פעולות נפרדות.');
    expect(text).toContain('שמירת בקרה');
    http.expectNone(() => true);
  });

  it('validates then explicitly creates without executing', () => {
    open();
    fill();
    const onSaved = vi.fn();
    editor.saved.subscribe(onSaved);
    editor.perform('save');
    validate();
    const request = http.expectOne('/api/rules');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(definition);
    http.expectNone('/api/rules/execute?limit=100');
    request.flush(saved);
    expect(onSaved).toHaveBeenCalledWith(saved);
    expect(editor.dirty()).toBe(false);
  });

  it('loads the full saved tree, edits a copy and uses PUT with the same ID', () => {
    open(7);
    expect(editor.draft()).toEqual(definition);
    editor.update({ name: 'שם מעודכן' });
    expect(saved.definition.name).toBe('בקרה שמורה');
    editor.perform('save');
    http.expectOne('/api/rules/validate').flush({ isValid: true, errors: [] });
    const request = http.expectOne('/api/rules/7');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body.name).toBe('שם מעודכן');
    request.flush({ ...saved, definition: request.request.body });
  });

  it('runs the current draft without creating or updating and clears stale preview after edits', () => {
    open(7);
    fill();
    editor.perform('run');
    validate();
    const request = http.expectOne('/api/rules/execute?limit=100');
    expect(request.request.body).toEqual({ definition });
    expect(editor.busy()).toBe('run');
    request.flush({ totalCount: 0, returnedCount: 0, truncated: false, columns: [], records: [] });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('לא נמצאו חריגות');
    expect(fixture.nativeElement.textContent).toContain('ללא שמירה אוטומטית');
    expect(editor.dirty()).toBe(true);
    http.expectNone(
      (req) => req.method === 'PUT' || (req.method === 'POST' && req.url === '/api/rules'),
    );
    editor.update({ name: 'שינוי אחרי הרצה' });
    expect(editor.preview()).toBeNull();
  });

  it('shows semantic server errors in Hebrew and preserves all entered data', () => {
    open();
    fill();
    editor.perform('save');
    http
      .expectOne('/api/rules/validate')
      .flush(
        {
          isValid: false,
          errors: [
            {
              path: 'condition.children[1].right.value',
              code: 'invalidValue',
              message: 'יש להזין מספר תקין.',
            },
          ],
        },
        { status: 400, statusText: 'Bad Request' },
      );
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'תנאי 2: יש להזין מספר תקין',
    );
    expect(editor.draft()).toEqual(definition);
    expect(editor.busy()).toBeNull();
    http.expectNone('/api/rules');
  });

  it('blocks duplicate operations and closing while an operation is in flight', () => {
    open();
    fill();
    const onClosed = vi.fn();
    editor.closed.subscribe(onClosed);
    editor.perform('save');
    editor.perform('save');
    editor.perform('run');
    editor.requestClose();
    validate();
    expect(onClosed).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('fieldset').disabled).toBe(true);
    http.expectOne('/api/rules').flush(saved);
  });

  it('asks before discarding edits, allows continuing and discards only on explicit close', () => {
    open();
    fill();
    const onClosed = vi.fn();
    editor.closed.subscribe(onClosed);
    editor.requestClose();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('יש שינויים שלא נשמרו');
    expect(onClosed).not.toHaveBeenCalled();
    editor.confirmClose.set(false);
    expect(editor.draft()).toEqual(definition);
    editor.requestClose();
    editor.close();
    expect(onClosed).toHaveBeenCalledOnce();
    http.expectNone(() => true);
  });

  it('requires confirmation before root changes reset existing conditions', () => {
    open(7);
    const select = fixture.nativeElement.querySelector('.basic-fields select') as HTMLSelectElement;
    select.value = 'other';
    select.dispatchEvent(new Event('change'));
    expect(editor.draft().rootEntityId).toBe('custom');
    expect(editor.pendingRoot()).toBe('other');
    editor.applyRoot();
    fixture.detectChanges();
    expect(editor.draft().rootEntityId).toBe('other');
    expect(editor.draft().condition).toMatchObject({
      left: { fieldId: 'title' },
      right: { kind: 'constant', value: '' },
    });
    expect(editor.dirty()).toBe(true);
  });

  it('does not send a nameless rule to the server', () => {
    open();
    editor.perform('save');
    expect(editor.errors()).toContain('יש להזין שם לבקרה.');
    http.expectNone(() => true);
  });

  it('rejects a tree exceeding the node limit without replacing the current conditions', () => {
    open();
    fill();
    editor.updateCondition({
      kind: 'group',
      operator: 'and',
      children: Array.from({ length: 100 }, () => definition.condition),
    });
    expect(editor.draft().condition).toEqual(definition.condition);
    expect(editor.errors().join()).toContain('100');
  });

  it('handles load failures without overwriting the rule with an empty definition', () => {
    fixture.componentRef.setInput('ruleId', 7);
    fixture.detectChanges();
    http.expectOne('/api/rules/7').flush({}, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    editor.perform('save');
    expect(fixture.nativeElement.textContent).toContain('ייתכן שנמחקה');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    http.expectNone('/api/rules/validate');
  });
});
