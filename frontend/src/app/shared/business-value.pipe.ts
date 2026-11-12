import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'businessValue' })
export class BusinessValuePipe implements PipeTransform {
  transform(value: unknown, type?: string): string {
    if (value === null || value === undefined) return 'לא צוין';
    if (typeof value === 'boolean') return value ? 'כן' : 'לא';
    if (typeof value === 'number')
      return new Intl.NumberFormat('he-IL', { maximumFractionDigits: 20 }).format(value);
    if (type === 'date' && typeof value === 'string') {
      const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
      if (match) return `${match[3]}/${match[2]}/${match[1]}`;
    }
    return String(value);
  }
}
