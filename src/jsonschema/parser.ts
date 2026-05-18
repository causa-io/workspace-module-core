import type { JSONSchema7 } from 'json-schema';
import { dirname, join, normalize } from 'node:path';
import * as yaml from 'yaml';
import {
  InvalidSchemaError,
  REF_BEARING_CAUSA_EXTENSIONS,
  type CausaExtensions,
  type EnumSchema,
  type EnumType,
  type PrimitiveType,
  type Property,
  type PropertyType,
  type Schema,
} from '../definitions/index.js';

/**
 * Internal alias used while walking the source JSON Schema.
 */
type CausaSchema = JSONSchema7 & { causa?: Record<string, unknown> };

/**
 * Set of primitive type names recognized by the model.
 */
const PRIMITIVE_TYPES = new Set<PrimitiveType>([
  'string',
  'integer',
  'number',
  'boolean',
  'uuid',
  'datetime',
]);

/**
 * Parse a single JSON Schema document (written in JSON or YAML) into one or more {@link Schema} entries.
 *
 * The parser performs no cross-file lookups. Object schemas are returned with an empty {@link Schema.databases} list.
 *
 * @param source Raw text of the source document.
 * @param path Absolute filesystem path of the source document, used to resolve relative `$ref` values and to identify
 *   the top-level schema's {@link Schema.path}.
 * @returns The parsed schemas.
 * @throws {InvalidSchemaError} When the input is not an object, has no title, or has an unsupported root shape.
 * @throws When `source` fails to deserialize (errors raised by the `yaml` package).
 */
export function parseJsonSchema(source: string, path: string): Schema[] {
  const schema = yaml.parse(source) as CausaSchema;
  const result = parseSchema(schema, path);
  const containers = [
    ['$defs', schema.$defs],
    ['definitions', schema.definitions],
  ] as const;
  result.push(
    ...containers
      .flatMap(([c, defs]) =>
        Object.entries(defs ?? {}).map(([k, v]) => ({ c, k, v })),
      )
      .filter(({ v }) => typeof v === 'object')
      .flatMap(({ c, k, v }) => parseSchema(v, `${path}#/${c}/${k}`)),
  );
  return result;
}

/**
 * Parse a single schema node into one or more {@link Schema} entries.
 *
 * @param rawSchema The deserialized schema node.
 * @param path Absolute path identifying this schema.
 * @returns The parsed schema followed by any inline schemas extracted from its properties.
 * @throws {InvalidSchemaError} When the node is not an object, has no `title`, or has an unsupported shape.
 */
function parseSchema(rawSchema: unknown, path: string): Schema[] {
  if (!isPlainObject(rawSchema)) {
    throw new InvalidSchemaError(path, 'document is not an object');
  }

  const schema = rawSchema as CausaSchema;
  const name = schema.title;
  if (!name) {
    throw new InvalidSchemaError(path, 'missing title');
  }

  return parseSchemaBody(schema, name, path);
}

/**
 * Build one or more {@link Schema} entries from a recognized node shape.
 *
 * @param schema The source schema node.
 * @param name Display name for the produced schema.
 * @param path Full path identifying the produced schema.
 * @returns The produced schema followed by any inline schemas extracted from its properties (object case only).
 * @throws {InvalidSchemaError} When the node's shape is not enum, oneOf union with at least 2 non-null variants, or
 *   `type: object`.
 */
function parseSchemaBody(
  schema: CausaSchema,
  name: string,
  path: string,
): Schema[] {
  const description = schema.description;
  const extensions = buildExtensions(schema.causa, path);

  if (Array.isArray(schema.enum)) {
    const type = inferEnumType(schema);
    const values =
      type === 'integer' ? schema.enum.map(Number) : schema.enum.map(String);
    return [
      {
        kind: 'enum',
        name,
        path,
        type,
        values,
        description,
        extensions,
      } as EnumSchema,
    ];
  }

  if (schema.oneOf) {
    const types = schema.oneOf.filter(
      (o): o is JSONSchema7 => typeof o === 'object' && o.type !== 'null',
    );
    if (types.length < 2) {
      throw new InvalidSchemaError(
        path,
        'a union must have at least two non-null variants',
      );
    }

    return [
      {
        kind: 'union',
        name,
        path,
        description,
        types: types.map((v) => resolveInnerType(v, path)),
        extensions,
      },
    ];
  }

  if (schema.type !== 'object') {
    throw new InvalidSchemaError(
      path,
      'must be an object, an enum, or a union',
    );
  }

  const propertiesPointer = path.includes('#')
    ? `${path}/properties`
    : `${path}#/properties`;
  const { properties, nested } = parseProperties(
    schema,
    path,
    propertiesPointer,
  );

  return [
    {
      kind: 'object',
      name,
      path,
      description,
      properties,
      extensions,
      databases: [],
    },
    ...nested,
  ];
}

/**
 * Parse the `properties` of an object schema into a {@link Property} array, also returning any inline schemas
 * discovered while walking the property values.
 *
 * @param schema Object schema whose `properties` and `required` are parsed.
 * @param path Absolute path of the containing file.
 * @param pointerPrefix JSON Pointer prefix used to address each property, e.g. `"/abs/file.yaml#/properties"`.
 * @returns The parsed properties (in source order) and any inline schemas extracted from them.
 */
function parseProperties(
  schema: CausaSchema,
  path: string,
  pointerPrefix: string,
): { properties: Property[]; nested: Schema[] } {
  const properties: Property[] = [];
  const nested: Schema[] = [];
  if (!schema.properties) {
    return { properties, nested };
  }

  const requiredSet = new Set(schema.required ?? []);

  for (const [name, rawProp] of Object.entries(schema.properties)) {
    if (typeof rawProp === 'boolean') {
      continue;
    }

    const prop = rawProp as CausaSchema;
    const extensions = buildExtensions(prop.causa, path);
    const required = requiredSet.has(name);
    const { description } = prop;
    const inline = tryResolveInlineSchema(prop, `${pointerPrefix}/${name}`);
    if (inline) {
      nested.push(...inline.nested);
      properties.push({
        name,
        type: inline.type,
        nullable: false,
        required,
        description,
        extensions,
      });
      continue;
    }

    const { type, nullable } = resolvePropertyType(prop, path);
    properties.push({
      name,
      type,
      nullable,
      required,
      description,
      extensions,
    });
  }

  return { properties, nested };
}

/**
 * Attempt to recognize a property as an inline schema definition (an object or enum shape defined directly on the
 * property instead of via `$ref`).
 *
 * When matched, the returned object carries the resolved {@link PropertyType} (a `ref` to the synthetic pointer)
 * together with the inline {@link Schema} entries that were extracted.
 *
 * @param prop Raw property schema.
 * @param pointer JSON Pointer that will identify the inline schema, e.g. `"/abs/file.yaml#/properties/address"`.
 * @returns The resolved type and extracted nested schemas, or `null` to fall through.
 */
function tryResolveInlineSchema(
  prop: CausaSchema,
  pointer: string,
): { type: PropertyType; nested: Schema[] } | null {
  const isEnum = Array.isArray(prop.enum);
  const isObject = prop.type === 'object' && prop.properties !== undefined;
  if (!isEnum && !isObject) {
    return null;
  }

  const name = prop.title;
  if (!name) {
    throw new InvalidSchemaError(pointer, 'missing title');
  }

  return {
    type: { kind: 'ref', ref: pointer },
    nested: parseSchemaBody(prop, name, pointer),
  };
}

/**
 * Resolve a property's outer shape into a {@link PropertyType} plus a nullability flag.
 *
 * @param prop Raw property schema.
 * @param path Absolute path of the containing file.
 * @returns The resolved type and whether `null` is an accepted value.
 */
function resolvePropertyType(
  prop: CausaSchema,
  path: string,
): Pick<Property, 'type' | 'nullable'> {
  const oneOf = prop.oneOf as CausaSchema[] | undefined;
  if (!oneOf) {
    return { type: resolveInnerType(prop, path), nullable: false };
  }

  const nullVariants = oneOf.filter((o) => o.type === 'null');
  const nonNullVariants = oneOf.filter((o) => o.type !== 'null');
  if (nullVariants.length > 1) {
    throw new InvalidSchemaError(
      path,
      'oneOf may contain at most one null variant',
    );
  }
  if (nonNullVariants.length !== 1) {
    throw new InvalidSchemaError(
      path,
      'oneOf must have exactly one non-null variant',
    );
  }

  return {
    type: resolveInnerType(nonNullVariants[0], path),
    nullable: nullVariants.length === 1,
  };
}

/**
 * Resolve a single (non-nullable) schema node into a {@link PropertyType}.
 *
 * @param prop Raw schema node.
 * @param path Absolute path of the containing file.
 * @returns The resolved type.
 */
function resolveInnerType(prop: CausaSchema, path: string): PropertyType {
  if (typeof prop.$ref === 'string') {
    return { kind: 'ref', ref: resolveRef(prop.$ref, path) };
  }

  if (prop.const !== undefined) {
    return resolveConstType(prop, path);
  }

  const rawType = prop.type;
  if (Array.isArray(rawType)) {
    throw new InvalidSchemaError(
      path,
      'array `type` declarations are not supported; use `oneOf` with a `null` variant for nullable types',
    );
  }

  if (rawType === 'null') {
    return { kind: 'null' };
  }

  if (rawType === 'array') {
    return resolveArrayType(prop, path);
  }

  if (rawType === 'object' && prop.additionalProperties !== undefined) {
    return resolveMapType(prop, path);
  }

  return resolvePrimitiveType(rawType, prop.format, path);
}

/**
 * Resolve a `const`-bearing schema node into a {@link PropertyType} of kind `const`.
 *
 * @param prop Raw schema node carrying `const`.
 * @param path Absolute path of the containing schema, used for error reporting.
 * @returns The resolved const type.
 * @throws {InvalidSchemaError} When the const value is not a string, number, or boolean.
 */
function resolveConstType(prop: CausaSchema, path: string): PropertyType {
  const value = prop.const;

  if (prop.type === 'string' && typeof value === 'string') {
    return { kind: 'const', type: 'string', value };
  }
  if (prop.type === 'number' && typeof value === 'number') {
    return { kind: 'const', type: 'number', value };
  }
  if (prop.type === 'boolean' && typeof value === 'boolean') {
    return { kind: 'const', type: 'boolean', value };
  }
  if (
    prop.type === 'integer' &&
    typeof value === 'number' &&
    Number.isInteger(value)
  ) {
    return { kind: 'const', type: 'integer', value };
  }
  if (prop.type !== undefined) {
    throw new InvalidSchemaError(
      path,
      `const value does not match declared type '${prop.type}'`,
    );
  }

  if (typeof value === 'string') {
    return { kind: 'const', type: 'string', value };
  }
  if (typeof value === 'number') {
    return {
      kind: 'const',
      type: Number.isInteger(value) ? 'integer' : 'number',
      value,
    };
  }
  if (typeof value === 'boolean') {
    return { kind: 'const', type: 'boolean', value };
  }

  throw new InvalidSchemaError(
    path,
    `unsupported const value type '${typeof value}'`,
  );
}

/**
 * Resolve an `array`-typed schema node into a {@link PropertyType} of kind `array`.
 *
 * Item types may themselves use the nullable `oneOf: [..., {type: null}]` pattern.
 *
 * @param prop Raw schema node with `type: 'array'`.
 * @param path Absolute path of the containing file.
 * @returns The resolved array type.
 */
function resolveArrayType(prop: CausaSchema, path: string): PropertyType {
  if (
    !prop.items ||
    typeof prop.items !== 'object' ||
    Array.isArray(prop.items)
  ) {
    throw new InvalidSchemaError(path, 'array must declare an items schema');
  }

  const rawItems = prop.items as CausaSchema;
  const itemOneOf = rawItems.oneOf as CausaSchema[] | undefined;
  if (itemOneOf) {
    const nonNull = itemOneOf.filter((o) => o.type !== 'null');
    if (nonNull.length !== 1) {
      throw new InvalidSchemaError(
        path,
        'array items oneOf must have exactly one non-null variant',
      );
    }

    return {
      kind: 'array',
      items: resolveInnerType(nonNull[0], path),
      itemNullable: itemOneOf.some((o) => o.type === 'null'),
    };
  }

  return {
    kind: 'array',
    items: resolveInnerType(rawItems, path),
    itemNullable: false,
  };
}

/**
 * Resolve a `type: object` schema node carrying `additionalProperties` into a {@link PropertyType} of kind `map`.
 *
 * The value type is `'any'` when `additionalProperties` is the boolean `true`, or the resolved inner type when it is
 * a schema. Any other shape throws.
 *
 * @param prop Raw schema node.
 * @param path Absolute path of the containing file.
 * @returns The resolved map type.
 * @throws {InvalidSchemaError} When `additionalProperties` is `false` or any value other than `true` or a schema.
 */
function resolveMapType(prop: CausaSchema, path: string): PropertyType {
  const additional = prop.additionalProperties;
  if (additional === true) {
    return { kind: 'map', items: 'any' };
  }

  if (additional === false) {
    throw new InvalidSchemaError(
      path,
      "map cannot have 'additionalProperties: false'",
    );
  }

  if (
    typeof additional !== 'object' ||
    additional === null ||
    Array.isArray(additional)
  ) {
    throw new InvalidSchemaError(
      path,
      'map additionalProperties must be a schema or true',
    );
  }

  return {
    kind: 'map',
    items: resolveInnerType(additional as CausaSchema, path),
  };
}

/**
 * Resolve a primitive schema node (`type` + optional `format`) into a {@link PropertyType} of kind `primitive`.
 *
 * @param rawType The raw JSON Schema `type` value, if any.
 * @param format The raw JSON Schema `format` value, if any.
 * @param path Absolute path of the containing file, used for error reporting.
 * @returns The resolved primitive type.
 * @throws {InvalidSchemaError} When the type/format combination is missing, unrecognized, or inconsistent.
 */
function resolvePrimitiveType(
  rawType: string | undefined,
  format: string | undefined,
  path: string,
): PropertyType {
  if (rawType === 'string' && format === 'date-time') {
    return { kind: 'primitive', type: 'datetime' };
  }
  if (rawType === 'string' && format === 'uuid') {
    return { kind: 'primitive', type: 'uuid' };
  }
  if (!format && rawType && PRIMITIVE_TYPES.has(rawType as PrimitiveType)) {
    return { kind: 'primitive', type: rawType as PrimitiveType };
  }
  throw new InvalidSchemaError(
    path,
    `unsupported primitive (type: '${rawType ?? ''}', format: '${format ?? ''}')`,
  );
}

/**
 * Infer the {@link EnumType} of an enum schema node.
 *
 * Uses the explicit `type` declaration when present; otherwise inspects the first enum value's runtime type.
 *
 * @param schema Raw schema node carrying `enum`.
 * @returns The inferred enum type.
 */
function inferEnumType(schema: CausaSchema): EnumType {
  if (schema.type === 'integer') {
    return 'integer';
  }

  if (schema.type === 'string') {
    return 'string';
  }

  if (
    Array.isArray(schema.enum) &&
    schema.enum.length > 0 &&
    typeof schema.enum[0] === 'number'
  ) {
    return 'integer';
  }

  return 'string';
}

/**
 * Build the {@link CausaExtensions} for a schema or property by cloning the raw `causa` value with ref-bearing keys
 * (see {@link REF_BEARING_CAUSA_EXTENSIONS}) normalized to absolute paths.
 *
 * Other entries are passed through unchanged.
 *
 * @param raw The raw `causa` value, if any.
 * @param path Absolute path of the containing file, used to resolve ref-bearing values.
 * @returns The processed extensions, or an empty object when `raw` is not an object.
 */
function buildExtensions(raw: unknown, path: string): CausaExtensions {
  if (!isPlainObject(raw)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => {
      return [
        key,
        REF_BEARING_CAUSA_EXTENSIONS.includes(key) && typeof value === 'string'
          ? resolveRef(value, path)
          : value,
      ];
    }),
  );
}

/**
 * Resolve a raw `$ref` value found in a schema to an absolute schema path.
 *
 * - `"#"` resolves to the current file path (whole-document self-ref).
 * - A fragment-only ref (`"#/$defs/Foo"`) is prefixed with the current file path, yielding e.g.
 *   `"/abs/file.yaml#/$defs/Foo"`.
 * - Any other value is treated as a path relative to the current file's directory; the fragment portion (if any) is
 *   preserved as part of the normalized result.
 *
 * @param rawRef The `$ref` value as it appears in the source schema.
 * @param currentPath Absolute path of the file containing the ref (may carry a fragment, which is ignored).
 * @returns The absolute, normalized schema path the ref points to.
 */
function resolveRef(rawRef: string, currentPath: string): string {
  const filePath = currentPath.split('#')[0];
  if (rawRef === '#') {
    return filePath;
  }
  if (rawRef.startsWith('#')) {
    return `${filePath}${rawRef}`;
  }
  return normalize(join(dirname(filePath), rawRef));
}

/**
 * Type-guard narrowing an `unknown` value to a plain object.
 *
 * @param value The value to test.
 * @returns `true` for non-null, non-array objects.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
