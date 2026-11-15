export const RULE_LIST_PAGE_SIZE = 20;

export function ruleListPage(value: unknown): number {
  const page = Number(value ?? 1);
  const offset = (page - 1) * RULE_LIST_PAGE_SIZE;
  return Number.isSafeInteger(page) && page > 0 && offset <= 2147483647 ? page : 1;
}
