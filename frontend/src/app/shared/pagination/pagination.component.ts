import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav aria-label="דפדוף ברשימת הבקרות" class="pagination">
      <button type="button" [disabled]="page() <= 1" (click)="pageChange.emit(page() - 1)">
        הקודם
      </button>
      <span aria-live="polite">עמוד {{ page() }} מתוך {{ totalPages() }}</span>
      <button
        type="button"
        [disabled]="page() >= totalPages()"
        (click)="pageChange.emit(page() + 1)"
      >
        הבא
      </button>
    </nav>
  `,
  styleUrl: './pagination.component.scss',
})
export class PaginationComponent {
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly totalCount = input.required<number>();
  readonly pageChange = output<number>();
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.totalCount() / this.pageSize())));
}
