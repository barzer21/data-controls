import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-root',
  template: `
    <a class="skip-link" href="#workspace">דילוג לתוכן</a>
    <div class="app-shell">
      <aside class="app-rail" aria-label="ניווט ראשי">
        <a class="app-brand" routerLink="/rules">
          <span class="brand-mark" aria-hidden="true"></span>
          <span>בקרת נתונים<small lang="en" dir="ltr">DATA CONTROLS</small></span>
        </a>
        <nav>
          <a routerLink="/rules" routerLinkActive="active" ariaCurrentWhenActive="page">
            <span aria-hidden="true">▦</span> ספריית הבקרות
          </a>
        </nav>
        <div class="rail-note">מנתונים לתובנה.<br />מגדירים, בודקים, מבינים.</div>
      </aside>
      <div class="app-workspace" id="workspace" tabindex="-1">
        <header class="workspace-header">
          <span>מרחב עבודה <span aria-hidden="true">/</span> בקרות עסקיות</span>
          <span class="workspace-label">בקרת נתונים</span>
        </header>
        <router-outlet />
      </div>
    </div>
  `,
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
