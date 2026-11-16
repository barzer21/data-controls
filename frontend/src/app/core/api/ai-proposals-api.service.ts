import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { RuleDefinition } from './api.models';

@Injectable({ providedIn: 'root' })
export class AiProposalsApiService {
  private readonly http = inject(HttpClient);

  examples() {
    return this.http.get<readonly string[]>('/api/ai/proposals/examples');
  }

  propose(description: string) {
    return this.http.post<RuleDefinition>('/api/ai/proposals', { description });
  }
}
