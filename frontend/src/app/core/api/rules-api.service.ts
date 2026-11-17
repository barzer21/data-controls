import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  RuleDefinition,
  RuleExecutionResponse,
  RuleExecutionOptions,
  RuleListResponse,
  SavedRuleResponse,
} from './api.models';

@Injectable({ providedIn: 'root' })
export class RulesApiService {
  private readonly http = inject(HttpClient);

  list(page: number, pageSize: number) {
    return this.http.get<RuleListResponse>('/api/rules', { params: { page, pageSize } });
  }

  get(id: number) {
    return this.http.get<SavedRuleResponse>(`/api/rules/${id}`);
  }

  delete(id: number) {
    return this.http.delete<void>(`/api/rules/${id}`);
  }

  save(id: number | null, definition: RuleDefinition, createdWithAi = false) {
    return id === null
      ? this.http.post<SavedRuleResponse>('/api/rules', definition, {
          params: createdWithAi ? { createdWithAi: 'true' } : {},
        })
      : this.http.put<SavedRuleResponse>(`/api/rules/${id}`, definition);
  }

  execute(definition: RuleDefinition, options?: RuleExecutionOptions) {
    // Execute the exact saved snapshot displayed in the results header. This never saves it.
    return this.http.post<RuleExecutionResponse>(
      '/api/rules/execute',
      { definition, ...(options && Object.keys(options).length ? { options } : {}) },
      { params: { limit: 100 } },
    );
  }
}
