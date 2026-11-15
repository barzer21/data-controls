import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-ui-icon',
  templateUrl: './ui-icon.component.html',
  styleUrl: './ui-icon.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiIconComponent {
  readonly name = input('grid');
  readonly paths: Record<string, string> = {
    employee:
      'M12 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM3 20v-2a6 6 0 0 1 12 0v2M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5',
    department: 'M5 21V4h10v17M15 10h4v11M3 21h18M8 8h1m2 0h1M8 12h1m2 0h1M8 16h1m2 0h1',
    grid: 'M4 4h6v6H4V4ZM14 4h6v6h-6V4ZM4 14h6v6H4v-6ZM14 14h6v6h-6v-6Z',
    edit: 'm15 4 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14v6Z',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    trash: 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',
  };
}
