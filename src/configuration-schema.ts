import type { OpenAPIV3_1 } from '@scalar/openapi-types';

/**
 * Composes the full configuration schema from the given module schemas.
 * The composed schema validates the top-level configuration and also validates each environment's `configuration`
 * property using the same schema (excluding the `environments` key to prevent recursion).
 *
 * @param schemas The module schemas to compose, either as inline schema objects or `$ref` references.
 * @returns The composed JSON Schema.
 */
export function composeConfigurationSchema(
  schemas: OpenAPIV3_1.SchemaObject[],
): OpenAPIV3_1.SchemaObject {
  const configurationDefinition: OpenAPIV3_1.SchemaObject = {
    allOf: schemas,
  };

  const configurationWithoutEnvironments: OpenAPIV3_1.SchemaObject = {
    allOf: [
      { $ref: '#/$defs/Configuration' },
      { not: { required: ['environments'] } },
    ],
  };

  return {
    allOf: [
      { $ref: '#/$defs/Configuration' },
      {
        type: 'object',
        properties: {
          environments: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                configuration: configurationWithoutEnvironments,
              },
            },
          },
        },
      },
    ],
    $defs: { Configuration: configurationDefinition },
  };
}
