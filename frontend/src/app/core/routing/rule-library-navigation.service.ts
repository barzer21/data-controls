import { ViewportScroller } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { SavedRuleResponse } from '../api/api.models';
import { RulesApiService } from '../api/rules-api.service';
import { RULE_LIST_PAGE_SIZE } from './rule-list-page';

@Injectable({ providedIn: 'root' })
export class RuleLibraryNavigationService {
  private readonly rules = inject(RulesApiService);
  private readonly router = inject(Router);
  private readonly viewport = inject(ViewportScroller);

  afterSave(saved: SavedRuleResponse, returnPage: number, created: boolean) {
    const destination = created
      ? this.rules.list(1, RULE_LIST_PAGE_SIZE).pipe(
          map((result) => Math.max(1, Math.ceil(result.totalCount / result.pageSize))),
          catchError(() => of(returnPage)),
        )
      : of(returnPage);

    return destination.pipe(
      switchMap((page) =>
        this.router
          .navigate(['/rules'], {
            queryParams: { page },
            state: { saveNotice: `הבקרה „${saved.definition.name}” נשמרה בהצלחה.` },
          })
          .then((navigated) => {
            // Navigation destroys the editor; keep this completion outside its subscription.
            if (navigated) this.viewport.scrollToPosition([0, 0]);
            return navigated;
          }),
      ),
    );
  }
}
