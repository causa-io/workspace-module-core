import type { OpenAPIV3_1 } from '@scalar/openapi-types';

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

/**
 * Renames keys in security requirement objects throughout an OpenAPI specification.
 * This handles both the top-level `security` array and per-operation `security` arrays.
 *
 * @param spec The OpenAPI specification to modify in place.
 * @param renames A mapping from old security scheme names to new names.
 */
export function renameSecurityRequirements(
  spec: OpenAPIV3_1.Document,
  renames: Record<string, string>,
): void {
  function rewrite(security?: OpenAPIV3_1.SecurityRequirementObject[]) {
    if (!security) {
      return;
    }

    for (const requirement of security) {
      for (const oldName of Object.keys(requirement)) {
        const newName = renames[oldName];
        if (newName) {
          requirement[newName] = requirement[oldName];
          delete requirement[oldName];
        }
      }
    }
  }

  const methods: Record<OpenAPIV3_1.HttpMethods, true> = {
    get: true,
    put: true,
    post: true,
    delete: true,
    options: true,
    head: true,
    patch: true,
    trace: true,
  };

  rewrite(spec.security);

  for (const pathItem of Object.values(spec.paths ?? {})) {
    if (!pathItem || typeof pathItem !== 'object') {
      continue;
    }

    for (const method of Object.keys(methods)) {
      rewrite(pathItem[method]?.security);
    }
  }
}
