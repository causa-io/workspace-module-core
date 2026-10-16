/**
 * Maps the references to other schemas held by Causa extensions, leaving every other value unchanged:
 *
 * - `constraintFor`, `enumHint`, and `projectionOf`: a reference.
 * - `entityMutationFrom`: a list of references, in which `null` entries denote an absent state.
 * - `identifierOf`: an object whose `schema` is a reference.
 *
 * Values that do not have the expected shape are left unchanged.
 *
 * @param extensions The Causa extensions, as parsed from the source or as exposed by the model.
 * @param fn The function mapping each reference, e.g. resolving it to an absolute path.
 * @returns A copy of the extensions with mapped references, in the same key order.
 */
export function mapExtensionRefs<T extends Record<string, unknown>>(
  extensions: T,
  fn: (ref: string) => string,
): T {
  const ref = (value: unknown) =>
    typeof value === 'string' ? fn(value) : value;
  const mapped: Record<string, unknown> = { ...extensions };

  for (const key of ['constraintFor', 'enumHint', 'projectionOf']) {
    if (key in mapped) {
      mapped[key] = ref(mapped[key]);
    }
  }

  const { entityMutationFrom, identifierOf } = mapped;
  if (Array.isArray(entityMutationFrom)) {
    mapped.entityMutationFrom = entityMutationFrom.map(ref);
  }

  if (
    identifierOf &&
    typeof identifierOf === 'object' &&
    !Array.isArray(identifierOf) &&
    'schema' in identifierOf
  ) {
    mapped.identifierOf = { ...identifierOf, schema: ref(identifierOf.schema) };
  }

  return mapped as T;
}
