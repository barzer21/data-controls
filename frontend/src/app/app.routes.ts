import { Routes } from '@angular/router';

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
    path: 'rules/:id/results',
    loadComponent: () =>
      import('./features/rules/rule-results-page/rule-results-page.component').then(
        (m) => m.RuleResultsPageComponent,
      ),
    title: 'תוצאות בקרה',
  },
  { path: '**', redirectTo: 'rules' },
];
