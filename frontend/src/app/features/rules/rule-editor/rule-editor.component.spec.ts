import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RuleResultsComponent } from '../../../shared/rule-results/rule-results.component';
import { MetadataResponse, RuleDefinition, SavedRuleResponse } from '../../../core/api/api.models';
import { RuleEditorComponent } from './rule-editor.component';

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

describe('Rule editor with API transport', () => {
  let fixture: ComponentFixture<RuleEditorComponent>;
  let editor: RuleEditorComponent;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RuleEditorComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(RuleEditorComponent);
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

  it('renders an accessible new-rule editor with business metadata and separate actions', () => {
    open();
    expect(
      fixture.nativeElement.querySelector('main.editor-page[aria-labelledby="editor-title"]'),
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
    fixture.nativeElement.querySelector('.footer-actions .primary').click();
    validate();
    const request = http.expectOne('/api/rules');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(definition);
    http.expectNone('/api/rules/execute?limit=100');
    request.flush(saved);
    expect(onSaved).toHaveBeenCalledWith(saved);
    expect(editor.dirty()).toBe(false);
  });

  it('switches to a readable view of the current draft without mutation or requests', async () => {
    open(7);
    editor.update({ name: 'טיוטה מעודכנת' });
    fixture.detectChanges();
    fixture.nativeElement.querySelectorAll('.mode-switch button')[1].click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.read-view').textContent).toContain(
      'טיוטה מעודכנת',
    );
    expect(fixture.nativeElement.querySelector('.read-view').textContent).toContain('15,000');
    expect(fixture.nativeElement.querySelector('.read-view').textContent).toContain(
      'שינויים שטרם נשמרו',
    );
    expect(fixture.nativeElement.querySelector('#rule-editor-form').hidden).toBe(true);
    fixture.nativeElement.querySelector('.back-to-edit').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(editor.draft().name).toBe('טיוטה מעודכנת');
    expect(editor.dirty()).toBe(true);
    expect(fixture.nativeElement.querySelector('input[name="name"]').value).toBe('טיוטה מעודכנת');
    http.expectNone(() => true);
  });

  it('saves the current draft from read mode through the existing validation and PUT flow', () => {
    open(7);
    editor.mode.set('view');
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.footer-actions .primary').click();
    validate();
    const request = http.expectOne('/api/rules/7');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(definition);
    request.flush(saved);
    http.expectNone('/api/rules/execute?limit=100');
  });

  it('retains the selected entity and condition when a requested switch is cancelled', () => {
    open(7);
    fixture.nativeElement.querySelectorAll('.entity-option')[1].click();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelectorAll('.entity-option')[0].getAttribute('aria-pressed'),
    ).toBe('true');
    expect(editor.pendingRoot()).toBe('other');
    fixture.nativeElement.querySelector('.notice button:last-child').click();
    fixture.detectChanges();
    expect(editor.draft()).toEqual(definition);
    expect(editor.pendingRoot()).toBeNull();
    expect(editor.dirty()).toBe(false);
    http.expectNone(() => true);
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
    http.expectOne('/api/rules/validate').flush(
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

  it('shows a distinct discard view from the header and keeps changes when it is cancelled', () => {
    open();
    fill();
    fixture.nativeElement.querySelector('header button').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="region"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.form-content').hidden).toBe(true);
    expect(fixture.nativeElement.querySelector('footer').hidden).toBe(true);
    fixture.nativeElement.querySelector('.close-confirmation .primary').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="region"]')).toBeNull();
    expect(editor.draft()).toEqual(definition);
    editor.requestClose();
    fixture.detectChanges();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    fixture.nativeElement.querySelector('main').dispatchEvent(event);
    fixture.detectChanges();
    expect(event.defaultPrevented).toBe(true);
    expect(editor.confirmClose()).toBe(false);
    http.expectNone(() => true);
  });

  it('requires confirmation before root changes reset existing conditions', () => {
    open(7);
    fixture.nativeElement.querySelectorAll('.entity-option')[1].click();
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

  function openProposal() {
    fixture.componentRef.setInput('initialDefinition', definition);
    open();
  }

  it('opens an AI proposal as an unsaved copy and blocks both actions until approval', () => {
    openProposal();
    expect(editor.draft()).toEqual(definition);
    expect(editor.dirty()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('בדיקת הצעת AI');
    const actions = fixture.nativeElement.querySelectorAll('.footer-actions button');
    expect(actions[1].disabled).toBe(true);
    expect(actions[2].disabled).toBe(true);
    editor.perform('run');
    editor.perform('save');
    http.expectNone(() => true);
  });

  it('runs only the approved AI draft through validation and never saves automatically', () => {
    openProposal();
    const checkbox = fixture.nativeElement.querySelector('.ai-approval input') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(editor.proposalApproved()).toBe(true);
    editor.perform('run');
    validate();
    http
      .expectOne('/api/rules/execute?limit=100')
      .flush({ totalCount: 0, returnedCount: 0, truncated: false, columns: [], records: [] });
    expect(editor.preview()).not.toBeNull();
    expect(editor.dirty()).toBe(true);
    http.expectNone((req) => req.url === '/api/rules' || req.method === 'PUT');
  });

  it('revokes AI approval after editing and requires approval of the updated snapshot', () => {
    openProposal();
    editor.proposalApproved.set(true);
    editor.update({ name: 'הצעה מעודכנת' });
    expect(editor.proposalApproved()).toBe(false);
    expect(definition.name).toBe('בקרה שמורה');
    editor.perform('run');
    http.expectNone(() => true);
    editor.proposalApproved.set(true);
    editor.perform('save');
    const validation = http.expectOne('/api/rules/validate');
    expect(validation.request.body.name).toBe('הצעה מעודכנת');
    validation.flush({ isValid: true, errors: [] });
    const save = http.expectOne('/api/rules?createdWithAi=true');
    expect(save.request.body.name).toBe('הצעה מעודכנת');
    save.flush({ ...saved, definition: save.request.body });
    http.expectNone('/api/rules/execute?limit=100');
  });

  it('does not send requests when an AI proposal is rejected', () => {
    openProposal();
    const onClosed = vi.fn();
    editor.closed.subscribe(onClosed);
    editor.requestClose();
    expect(editor.confirmClose()).toBe(true);
    editor.close();
    expect(onClosed).toHaveBeenCalledOnce();
    http.expectNone(() => true);
  });

  it('does not replace a saved AI rule origin when editing its definition', () => {
    fixture.componentRef.setInput('ruleId', 7);
    fixture.detectChanges();
    http.expectOne('/api/rules/7').flush({ ...saved, createdWithAi: true });
    fixture.detectChanges();
    editor.update({ name: 'בקרה שנערכה' });
    editor.perform('save');
    http.expectOne('/api/rules/validate').flush({ isValid: true, errors: [] });
    const request = http.expectOne('/api/rules/7');
    expect(request.request.method).toBe('PUT');
    expect(request.request.params.has('createdWithAi')).toBe(false);
    expect(request.request.body.createdWithAi).toBeUndefined();
    request.flush({ ...saved, createdWithAi: true, definition: request.request.body });
  });

  it('filters an unsaved run snapshot and cancels filtering when the draft changes again', () => {
    open(7);
    editor.update({ name: 'טיוטה מעודכנת' });
    editor.perform('run');
    http.expectOne('/api/rules/validate').flush({ isValid: true, errors: [] });
    const initial = http.expectOne('/api/rules/execute?limit=100');
    const snapshot = initial.request.body.definition;
    initial.flush({
      totalCount: 0,
      returnedCount: 0,
      truncated: false,
      columns: [{ id: 'amount', label: 'סכום עסקי', type: 'number' }],
      records: [],
    });
    fixture.detectChanges();
    const results = fixture.debugElement.query(By.directive(RuleResultsComponent))
      .componentInstance as RuleResultsComponent;
    results.applyFilters({
      search: '',
      filters: [{ columnId: 'amount', operator: 'greaterThan', value: 20000 }],
    });
    const filtered = http.expectOne('/api/rules/execute?limit=100');
    expect(filtered.request.body.definition).toEqual(snapshot);
    expect(filtered.request.body.definition.name).toBe('טיוטה מעודכנת');
    expect(filtered.request.body.options.filter.right.value).toBe(20000);
    expect(editor.dirty()).toBe(true);
    editor.update({ name: 'עריכה נוספת' });
    fixture.detectChanges();
    expect(filtered.cancelled).toBe(true);
    expect(editor.preview()).toBeNull();
    expect(fixture.debugElement.query(By.directive(RuleResultsComponent))).toBeNull();
    http.expectNone(
      (req) => req.method === 'GET' || req.method === 'PUT' || req.url === '/api/rules',
    );
  });
});
