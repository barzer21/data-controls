import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SavedRulesPageComponent } from './features/rules/saved-rules-page/saved-rules-page.component';

@Component({
  imports: [SavedRulesPageComponent],
  selector: 'app-root',
  template: `<app-saved-rules-page />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
