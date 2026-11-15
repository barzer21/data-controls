import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RuleDefinition } from '../../../core/api/api.models';
import { AiRuleCreatorComponent } from './ai-rule-creator.component';

const proposal: RuleDefinition = {
  name: 'בדיקת שכר',
  description: 'שכר מעל הסף',
  rootEntityId: 'employee',
  condition: {
    kind: 'comparison',
    left: { fieldId: 'salary' },
    operator: 'greaterThan',
    right: { kind: 'constant', value: 15000 },
  },
};

describe('AI proposal creator', () => {
  let fixture: ComponentFixture<AiRuleCreatorComponent>;
  let component: AiRuleCreatorComponent;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AiRuleCreatorComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AiRuleCreatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
  afterEach(() => {
    fixture.destroy();
    http.verify();
  });

  it('renders a labelled page with all supported examples and no requests', () => {
    expect(
      fixture.nativeElement.querySelector('main.ai-page[aria-labelledby="ai-title"]'),
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.examples button').length).toBe(5);
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(true);
    http.expectNone(() => true);
  });

  it('uses an example and emits only the proposal without saving or executing', () => {
    const onProposed = vi.fn();
    component.proposed.subscribe(onProposed);
    fixture.nativeElement.querySelectorAll('.examples button')[1].click();
    fixture.detectChanges();
    const description = component.examples[1];
    expect(component.description()).toBe(description);
    fixture.nativeElement
      .querySelector('form')
      .dispatchEvent(new Event('submit', { cancelable: true }));
    const request = http.expectOne('/api/ai/proposals');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ description });
    request.flush(proposal);
    expect(onProposed).toHaveBeenCalledWith(proposal);
    expect(component.busy()).toBe(false);
    http.expectNone((req) => req.url.startsWith('/api/rules'));
  });

  it('blocks empty and excessive input and prevents duplicate requests', () => {
    component.description.set('   ');
    component.generate();
    component.description.set('x'.repeat(2001));
    component.generate();
    http.expectNone(() => true);
    component.updateDescription(component.examples[0]);
    component.generate();
    component.generate();
    expect(component.busy()).toBe(true);
    http.expectOne('/api/ai/proposals').flush(proposal);
  });

  it.each([400, 502, 503, 504, 0])('preserves text and permits retry after HTTP %s', (status) => {
    const onProposed = vi.fn();
    component.proposed.subscribe(onProposed);
    component.updateDescription(component.examples[0]);
    component.generate();
    http
      .expectOne('/api/ai/proposals')
      .flush({ title: 'Internal details' }, { status, statusText: 'Error' });
    fixture.detectChanges();
    expect(component.description()).toBe(component.examples[0]);
    expect(component.busy()).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).not.toContain(
      'Internal details',
    );
    expect(onProposed).not.toHaveBeenCalled();
    component.generate();
    http.expectOne('/api/ai/proposals').flush(proposal);
    expect(onProposed).toHaveBeenCalledOnce();
  });

  it('asks before discarding text and can continue writing', () => {
    const onClosed = vi.fn();
    component.closed.subscribe(onClosed);
    component.updateDescription(component.examples[0]);
    component.requestClose();
    expect(component.confirmClose()).toBe(true);
    expect(onClosed).not.toHaveBeenCalled();
    component.confirmClose.set(false);
    expect(component.description()).toBe(component.examples[0]);
    component.close();
    expect(onClosed).toHaveBeenCalledOnce();
  });

  it('allows cancellation and aborts the request when the creator is removed', () => {
    component.updateDescription(component.examples[0]);
    component.generate();
    const request = http.expectOne('/api/ai/proposals');
    const onClosed = vi.fn();
    component.closed.subscribe(onClosed);
    component.requestClose();
    expect(onClosed).toHaveBeenCalledOnce();
    fixture.destroy();
    expect(request.cancelled).toBe(true);
  });

  it('shows discard confirmation prominently and Escape returns to the unchanged prompt', () => {
    component.updateDescription(component.examples[0]);
    fixture.nativeElement.querySelector('header button').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="region"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.form-content').hidden).toBe(true);
    expect(fixture.nativeElement.querySelector('footer').hidden).toBe(true);
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    fixture.nativeElement.querySelector('main').dispatchEvent(event);
    fixture.detectChanges();
    expect(event.defaultPrevented).toBe(true);
    expect(component.confirmClose()).toBe(false);
    expect(component.description()).toBe(component.examples[0]);
    expect(fixture.nativeElement.querySelector('dialog')).toBeNull();
    http.expectNone(() => true);
  });

  it('notifies the parent after discard confirmation', () => {
    const onClosed = vi.fn();
    component.closed.subscribe(onClosed);
    component.updateDescription(component.examples[0]);
    component.requestClose();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.confirmation button:last-of-type').click();
    expect(fixture.nativeElement.querySelector('dialog')).toBeNull();
    expect(onClosed).toHaveBeenCalledOnce();
    http.expectNone(() => true);
  });
});
