import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, startWith } from 'rxjs';
import { ruleListPage } from './core/routing/rule-list-page';

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly router = inject(Router);
  private readonly navigation = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
    ),
  );
  readonly isAiPage = computed(() => {
    this.navigation();
    return this.router.url.split('?')[0] === '/rules/ai/new';
  });
  readonly isNewPage = computed(() => {
    this.navigation();
    return this.router.url.split('?')[0] === '/rules/new';
  });
  readonly listPage = computed(() => {
    this.navigation();
    return ruleListPage(this.router.parseUrl(this.router.url).queryParams['page']);
  });
}
