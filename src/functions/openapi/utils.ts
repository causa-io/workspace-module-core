/**
 * Recursively traverses an object and transforms `$ref` string values using the provided function.
 *
 * @param obj The object to process.
 * @param transform A function that receives the `$ref` string value and returns the transformed value.
 * @returns A new object with transformed `$ref` values.
 */
export function rewriteRefs(obj: any, transform: (ref: string) => string): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => rewriteRefs(item, transform));
  }

  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => {
      if (key === '$ref' && typeof value === 'string') {
        return [key, transform(value)];
      }

      return [key, rewriteRefs(value, transform)];
    }),
  );
}
