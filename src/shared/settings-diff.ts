function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Applies only user-changed fields from next over latest, using previous as the diff base. */
export function mergeChangedSettings<T>(latest: T, previous: T, next: T): T {
  return applyChangedValue(latest, previous, next) as T;
}

function applyChangedValue(latest: unknown, previous: unknown, next: unknown): unknown {
  if (!isPlainRecord(previous) || !isPlainRecord(next)) {
    return valuesEqual(previous, next) ? latest : next;
  }

  const result: Record<string, unknown> = isPlainRecord(latest) ? { ...latest } : {};
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of keys) {
    if (!(key in next)) {
      if (!valuesEqual(previous[key], undefined)) delete result[key];
      continue;
    }
    if (valuesEqual(previous[key], next[key])) continue;
    result[key] = applyChangedValue(
      isPlainRecord(latest) ? latest[key] : undefined,
      previous[key],
      next[key]
    );
  }
  return result;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  if (isPlainRecord(left) && isPlainRecord(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].every((key) => valuesEqual(left[key], right[key]));
  }
  return false;
}
