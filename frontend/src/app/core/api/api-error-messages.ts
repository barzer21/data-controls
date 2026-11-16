import { HttpErrorResponse } from '@angular/common/http';

interface ErrorMessageOptions {
  readonly fallback: string;
  readonly statusMessages?: Readonly<Partial<Record<number, string>>>;
  readonly includeConditionPath?: boolean;
  readonly useProblemTitle?: boolean;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

// Decode known API error shapes; each screen still chooses its messages and focus behavior.
export function apiErrorMessages(error: unknown, options: ErrorMessageOptions): readonly string[] {
  const http = error instanceof HttpErrorResponse ? error : null;
  const body = record(http ? http.error : error);
  // Server/network errors must not expose arbitrary response bodies to the user.
  const isValidation = !http || http.status === 400 || http.status === 422;
  if (body && isValidation) {
    const messages: string[] = [];
    const errors = body['errors'] ?? body['validationErrors'];
    if (Array.isArray(errors)) {
      for (const item of errors) {
        const entry = record(item);
        const message = text(entry?.['message']) ?? text(item);
        if (!message) continue;
        const path = text(entry?.['path']);
        const indices =
          options.includeConditionPath && path
            ? [...path.matchAll(/children\[(\d+)\]/g)].map(
                (match) => `תנאי ${Number(match[1]) + 1}`,
              )
            : [];
        messages.push(`${indices.length ? indices.join(' › ') + ': ' : ''}${message}`);
      }
    } else {
      const fields = record(errors);
      if (fields) {
        for (const value of Object.values(fields)) {
          for (const item of Array.isArray(value) ? value : [value]) {
            const message = text(item);
            if (message) messages.push(message);
          }
        }
      }
    }
    if (messages.length) return messages;
  }

  const statusMessage = http ? options.statusMessages?.[http.status] : undefined;
  if (statusMessage) return [statusMessage];
  if (body && isValidation && options.useProblemTitle) {
    const title = text(body['title']);
    if (title) return [title];
  }
  return [options.fallback];
}
