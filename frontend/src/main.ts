import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app.component';

const navigation = performance.getEntriesByType('navigation')[0] as
  PerformanceNavigationTiming | undefined;
if (navigation?.type === 'reload') {
  // Set the starting URL before Angular activates a route or sends page-specific requests.
  history.replaceState(null, '', new URL('rules', document.baseURI));
}

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
