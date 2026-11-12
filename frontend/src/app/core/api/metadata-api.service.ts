import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { shareReplay } from 'rxjs';
import { MetadataResponse } from './api.models';

@Injectable({ providedIn: 'root' })
export class MetadataApiService {
  // The catalog is fixed until the backend restarts; share it across list pages.
  private readonly catalog = inject(HttpClient)
    .get<MetadataResponse>('/api/metadata')
    .pipe(shareReplay({ bufferSize: 1, refCount: true }));

  get() {
    return this.catalog;
  }
}
