export function createSpecId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function uniqStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
