import { TestBed } from '@angular/core/testing';
import { RuleExecutionResponse } from '../../core/api/api.models';
import { ExecutionResultsComponent } from './execution-results.component';

describe('Execution counts', () => {
  function render(result: RuleExecutionResponse, filtered = false) {
    const fixture = TestBed.createComponent(ExecutionResultsComponent);
    fixture.componentRef.setInput('result', result);
    fixture.componentRef.setInput('filtered', filtered);
    fixture.componentRef.setInput('enableFilters', filtered);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const result: RuleExecutionResponse = {
    totalCount: 5,
    evaluatedCount: 30,
    returnedCount: 1,
    truncated: true,
    columns: [],
    records: [
      {
        id: 1,
        values: {},
        failureReason: 'חריגה לדוגמה',
        explanation: {
          path: 'condition',
          kind: 'comparison',
          operator: 'isNotNull',
          message: 'חריגה לדוגמה',
          left: null,
          right: null,
          children: [],
        },
      },
    ],
  };

  it('shows all matching violations out of all evaluated records, independently of the display cap', () => {
    const element = render(result);
    expect(element.querySelector('.result-summary strong')!.textContent).toContain('5');
    expect(element.querySelector('.evaluated-count')!.textContent).toContain('30 רשומות שנבדקו');
  });

  it('retains the denominator when a search or filter has no matches', () => {
    const element = render(
      { ...result, totalCount: 0, returnedCount: 0, records: [], truncated: false },
      true,
    );
    expect(element.querySelector('.result-summary')!.textContent).toContain(
      'חריגות התואמות לחיפוש ולסינון:',
    );
    expect(element.querySelector('.result-summary strong')!.textContent).toContain('0');
    expect(element.querySelector('.evaluated-count')!.textContent).toContain('30');
  });

  it('shows zero evaluated records for an empty entity', () => {
    const element = render({
      ...result,
      totalCount: 0,
      evaluatedCount: 0,
      returnedCount: 0,
      records: [],
      truncated: false,
    });
    expect(element.querySelector('.evaluated-count')!.textContent).toContain('0 רשומות שנבדקו');
  });

  it('does not invent a denominator if an older API does not supply it', () => {
    const { evaluatedCount, ...oldResponse } = result;
    expect(render(oldResponse).querySelector('.evaluated-count')).toBeNull();
  });
});
