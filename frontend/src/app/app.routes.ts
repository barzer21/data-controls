import { Routes } from '@angular/router';
import type { RuleEditorPageComponent } from './features/rules/rule-editor-page/rule-editor-page.component';
import type { AiRulePageComponent } from './features/rules/ai-rule-page/ai-rule-page.component';

export const routes: Routes = [
  { path: '', redirectTo: 'rules', pathMatch: 'full' },
  {
    path: 'rules',
    loadComponent: () =>
      import('./features/rules/saved-rules-page/saved-rules-page.component').then(
        (m) => m.SavedRulesPageComponent,
      ),
    title: 'בקרות שמורות',
  },
  {
    path: 'rules/ai/new',
    loadComponent: () =>
      import('./features/rules/ai-rule-page/ai-rule-page.component').then(
        (m) => m.AiRulePageComponent,
      ),
    canDeactivate: [(component: AiRulePageComponent) => component.canLeave()],
    title: 'יצירת בקרה בעזרת AI',
  },
  {
    path: 'rules/new',
    loadComponent: () =>
      import('./features/rules/rule-editor-page/rule-editor-page.component').then(
        (m) => m.RuleEditorPageComponent,
      ),
    canDeactivate: [(component: RuleEditorPageComponent) => component.canLeave()],
    title: 'יצירת בקרה חדשה',
  },
  {
    path: 'rules/:id/edit',
    loadComponent: () =>
      import('./features/rules/rule-editor-page/rule-editor-page.component').then(
        (m) => m.RuleEditorPageComponent,
      ),
    canDeactivate: [(component: RuleEditorPageComponent) => component.canLeave()],
    title: 'עריכת בקרה',
  },
  {
    path: 'rules/:id/results',
    loadComponent: () =>
      import('./features/rules/rule-results-page/rule-results-page.component').then(
        (m) => m.RuleResultsPageComponent,
      ),
    title: 'תוצאות בקרה',
  },
  { path: '**', redirectTo: 'rules' },
];
