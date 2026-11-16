import { HttpErrorResponse } from '@angular/common/http';
import { apiErrorMessages } from './api-error-messages';

const options = { fallback: 'Fallback' };
const httpError = (error: unknown, status = 400) => new HttpErrorResponse({ status, error });

describe('API error messages', () => {
  it('reads rule validation errors and preserves nested condition numbering when requested', () => {
    const error = httpError({
      errors: [{ path: 'condition.children[0].children[2].right', message: 'Invalid value' }],
    });
    expect(apiErrorMessages(error, { ...options, includeConditionPath: true })).toEqual([
      'תנאי 1 › תנאי 3: Invalid value',
    ]);
    expect(apiErrorMessages(error, options)).toEqual(['Invalid value']);
  });

  it('supports locally returned validation failures', () => {
    expect(apiErrorMessages({ validationErrors: [{ message: 'Missing field' }] }, options)).toEqual(
      ['Missing field'],
    );
  });

  it('reads ModelState errors across multiple fields without exposing trace metadata', () => {
    expect(
      apiErrorMessages(
        httpError({
          title: 'Generic validation title',
          traceId: 'private',
          errors: { Name: ['Name required'], Description: ['Too long'], malformed: [null, 4] },
        }),
        options,
      ),
    ).toEqual(['Name required', 'Too long']);
  });

  it('keeps valid entries in a mixed array without failing on null or malformed items', () => {
    expect(
      apiErrorMessages(
        httpError({
          errors: [
            null,
            {},
            3,
            false,
            { message: 2 },
            { message: 'Valid error' },
            'Another error',
            { message: ' ' },
          ],
        }),
        options,
      ),
    ).toEqual(['Valid error', 'Another error']);
  });

  it.each([
    null,
    undefined,
    '',
    'not JSON',
    [],
    {},
    { errors: [] },
    { errors: [null] },
    { errors: { Name: [null, false] } },
    { title: 3 },
  ])('uses a fallback for an unusable response: %j', (body) => {
    expect(apiErrorMessages(httpError(body), options)).toEqual(['Fallback']);
  });

  it('uses a ProblemDetails title only when the screen opts in', () => {
    const error = httpError({ title: 'Cannot perform this request' });
    expect(apiErrorMessages(error, options)).toEqual(['Fallback']);
    expect(apiErrorMessages(error, { ...options, useProblemTitle: true })).toEqual([
      'Cannot perform this request',
    ]);
  });

  it('prefers the screen status message to a problem title', () => {
    expect(
      apiErrorMessages(httpError({ title: 'Internal title' }, 404), {
        ...options,
        useProblemTitle: true,
        statusMessages: { 404: 'Rule not found' },
      }),
    ).toEqual(['Rule not found']);
  });

  it.each([0, 500, 502, 503, 504])(
    'does not display raw network/server error bodies (%i)',
    (status) => {
      expect(
        apiErrorMessages(
          httpError({ title: 'SQL details', errors: [{ message: 'SQL details' }] }, status),
          {
            ...options,
            useProblemTitle: true,
            statusMessages: { 504: 'Timeout' },
          },
        ),
      ).toEqual([status === 504 ? 'Timeout' : 'Fallback']);
    },
  );
});
