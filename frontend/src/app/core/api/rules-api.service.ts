import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { RuleListResponse } from './api.models';

@Injectable({ providedIn: 'root' })
export class RulesApiService {
  private readonly http = inject(HttpClient);

  list(page: number, pageSize: number) {
    return this.http.get<RuleListResponse>('/api/rules', { params: { page, pageSize } });
  }
}
