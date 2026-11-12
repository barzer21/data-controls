import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RuleExecutionResponse } from '../../core/api/api.models';
import { BusinessValuePipe } from '../business-value.pipe';

@Component({
  selector: 'app-execution-results',
  imports: [BusinessValuePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './execution-results.component.html',
  styleUrl: './execution-results.component.scss',
})
export class ExecutionResultsComponent {
  readonly result = input.required<RuleExecutionResponse>();
}
