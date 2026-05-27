import type { JSONSchema7 } from 'json-schema';
import { basename, dirname, extname, join, normalize } from 'node:path';
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
  type UnionSchema,
} from '../definitions/index.js';

/**
 * Internal alias used while walking the source JSON Schema.
 */
type CausaSchema = JSONSchema7 & { causa?: Record<string, unknown> };

/**
 * Context threaded through type resolution to enable extraction of inline schemas (objects, enums, unions) declared
 * directly inside `items`, `additionalProperties`, or as the property's own type.
 *
 * When this context is provided, {@link resolveInnerType} runs inline detection before its normal type-handling
 * branches; any inline schemas it finds are appended to {@link InlineContext.schemas}, and the returned
 * {@link PropertyType} is a `ref` pointing at the inline schema's pointer.
 *
 * `pointer` is the JSON Pointer addressing the current node; `fallbackName` is used as the schema name when the inline
 * schema does not declare its own `title`.
 */
type InlineContext = {
  /**
   * List of inline schemas extracted so far, to which new entries are appended when discovered.
   */
  schemas: Schema[];

  /**
   * JSON Pointer addressing the current node, used to build the ref for any inline schema discovered at this node.
   */
  pointer: string;

  /**
   * Fallback name to use for any inline schema discovered at this node.
   */
  fallbackName: string;
};

/**
 * Identifies the JSON Schema combiner keyword used by a node, if any, returning its key and variants.
 *
 * @param schema Raw schema node.
 * @param path Absolute path of the containing schema, used for error reporting.
 * @returns The combiner key and its variant list, or `null` when neither keyword is present.
 * @throws {InvalidSchemaError} When both `oneOf` and `anyOf` are declared on the same node.
 */
function readCombiner(
  schema: CausaSchema,
  path: string,
): { key: UnionSchema['combiner']; variants: JSONSchema7[] } | null {
  if (schema.oneOf && schema.anyOf) {
    throw new InvalidSchemaError(
      path,
      'cannot combine `oneOf` and `anyOf` on the same node',
    );
  }
  if (schema.oneOf) {
    return { key: 'oneOf', variants: schema.oneOf as JSONSchema7[] };
  }
  if (schema.anyOf) {
    return { key: 'anyOf', variants: schema.anyOf as JSONSchema7[] };
  }
  return null;
}

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
  const name = schema.title ?? defaultSchemaName(path);
  if (!name) {
    throw new InvalidSchemaError(path, 'missing title');
  }

  return parseSchemaBody(schema, name, path);
}

/**
 * Derive a default schema name from a schema's path.
 *
 * - When the path is a plain file path (`/abs/file.yaml`), the basename without extension is returned (`file`).
 * - When the path carries a JSON Pointer fragment (`/abs/file.yaml#/$defs/Foo`), the last fragment segment is
 *   returned (`Foo`).
 *
 * @param path Absolute path identifying the schema (with or without a fragment).
 * @returns The fallback name, or an empty string when nothing usable can be derived.
 */
function defaultSchemaName(path: string): string {
  const [filePath, fragment] = path.split('#', 2);
  if (fragment !== undefined) {
    return fragment.split('/').filter(Boolean).pop() ?? '';
  }
  const base = basename(filePath);
  const ext = extname(base);
  return ext ? base.slice(0, -ext.length) : base;
}

/**
 * Build one or more {@link Schema} entries from a recognized node shape.
 *
 * @param rawSchema The source schema node.
 * @param name Display name for the produced schema.
 * @param path Full path identifying the produced schema.
 * @returns The produced schema followed by any inline schemas extracted from its properties (object case only).
 * @throws {InvalidSchemaError} When the node's shape is not enum, oneOf union with at least 2 non-null variants, or
 *   `type: object`.
 */
function parseSchemaBody(
  rawSchema: CausaSchema,
  name: string,
  path: string,
): Schema[] {
  const schema = expandTypeArray(rawSchema, path);
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

  const combiner = readCombiner(schema, path);
  if (combiner) {
    const { key, variants } = combiner;
    const selfPointer = path.includes('#') ? path : `${path}#`;
    const nested: Schema[] = [];
    const types = variants.flatMap((t, i) =>
      typeof t === 'object'
        ? resolveInnerType(t as CausaSchema, path, {
            schemas: nested,
            pointer: `${selfPointer}/${key}/${i}`,
            fallbackName: `${name}Variant${i}`,
          })
        : [],
    );

    return [
      {
        kind: 'union',
        name,
        path,
        description,
        combiner: key,
        types,
        extensions,
      },
      ...nested,
    ];
  }

  if (schema.type !== 'object') {
    throw new InvalidSchemaError(
      path,
      'must be an object, an enum, or a union',
    );
  }

  const selfPointer = path.includes('#') ? path : `${path}#`;
  const propertiesPointer = `${selfPointer}/properties`;
  const { properties, nested } = parseProperties(
    schema,
    path,
    propertiesPointer,
  );

  const additionalProperties = resolveAdditionalProperties(schema, path, {
    schemas: nested,
    pointer: selfPointer,
    fallbackName: name,
  });

  return [
    {
      kind: 'object',
      name,
      path,
      description,
      properties,
      additionalProperties,
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
    const { inner, nullable, pointer } = unwrapNullableOneOf(
      prop,
      `${pointerPrefix}/${name}`,
      path,
    );

    const type = resolveInnerType(inner, path, {
      schemas: nested,
      pointer,
      fallbackName: name,
    });
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
 * @param fallbackName Name to use when the inline schema does not declare a `title` (typically the property name).
 * @returns The resolved type and extracted nested schemas, or `null` to fall through.
 */
function tryResolveInlineSchema(
  prop: CausaSchema,
  pointer: string,
  fallbackName: string,
  path: string,
): { type: PropertyType; nested: Schema[] } | null {
  const isEnum = Array.isArray(prop.enum);
  const isObject = prop.type === 'object' && prop.properties !== undefined;
  const combiner = readCombiner(prop, path);
  const isUnion =
    combiner !== null &&
    combiner.variants.filter((v) => typeof v === 'object' && v.type !== 'null')
      .length >= 2;
  if (!isEnum && !isObject && !isUnion) {
    return null;
  }

  const name = prop.title ?? fallbackName;

  return {
    type: { kind: 'ref', ref: pointer },
    nested: parseSchemaBody(prop, name, pointer),
  };
}

/**
 * Unwrap a property's `oneOf` (or array `type`) into the inner schema that drives type resolution, plus the property's
 * nullability and the JSON Pointer addressing the inner schema.
 *
 * Behavior by `oneOf` shape (after array-`type` normalization):
 * - Absent: the prop itself is returned, `nullable` false.
 * - Exactly one non-null variant: that variant becomes the inner schema; `nullable` reflects the presence of a `null`
 *   variant; the pointer is suffixed with `"/oneOf/<index>"`.
 * - Two or more non-null variants: the prop itself is returned (will be recognized as an inline union by the caller);
 *   `nullable` is false because the `null` variant, if any, belongs to the union schema rather than to the property.
 * - Only `null` variants: the inner schema is `{ type: 'null' }`, `nullable` false.
 *
 * @param prop Raw property schema.
 * @param pointer JSON Pointer addressing the property itself.
 * @param path Absolute path of the containing file, used for error reporting.
 * @returns The inner schema, its nullability, and the pointer addressing it.
 */
function unwrapNullableOneOf(
  prop: CausaSchema,
  pointer: string,
  path: string,
): { inner: CausaSchema; nullable: boolean; pointer: string } {
  const normalized = expandTypeArray(prop, path);
  const combiner = readCombiner(normalized, path);
  if (!combiner) {
    return { inner: normalized, nullable: false, pointer };
  }

  const nullable = combiner.variants.some((v) => v.type === 'null');
  const nonNullIndices = combiner.variants.flatMap((v, i) =>
    v.type === 'null' ? [] : [i],
  );

  if (nonNullIndices.length === 0) {
    return { inner: { type: 'null' }, nullable: false, pointer };
  }

  if (nonNullIndices.length === 1) {
    const idx = nonNullIndices[0];
    return {
      inner: combiner.variants[idx],
      nullable,
      pointer: `${pointer}/${combiner.key}/${idx}`,
    };
  }

  return { inner: normalized, nullable: false, pointer };
}

/**
 * Rewrite a schema node that declares `type` as an array into an equivalent `oneOf` form, leaving other shapes
 * unchanged.
 *
 * Each entry in the source `type` array becomes a `oneOf` variant carrying that single type. The non-`null` variants
 * also inherit the rest of the original node's fields (e.g. `properties`, `items`, `format`, `title`), so that
 * downstream nullable-unwrapping and inline-schema detection apply unchanged.
 *
 * Validation of how many `null`/non-`null` entries are present is left to the consuming `oneOf` logic.
 *
 * @param prop Raw schema node.
 * @param path Absolute path of the containing file, used for error reporting.
 * @returns The normalized schema node.
 * @throws {InvalidSchemaError} When both `type` (as an array) and `oneOf` are declared on the same node.
 */
function expandTypeArray(prop: CausaSchema, path: string): CausaSchema {
  if (!Array.isArray(prop.type)) {
    return prop;
  }
  if (prop.oneOf !== undefined || prop.anyOf !== undefined) {
    throw new InvalidSchemaError(
      path,
      'cannot combine an array `type` with `oneOf` or `anyOf`',
    );
  }

  const { type, ...rest } = prop;
  const oneOf: CausaSchema[] = type.map((type) => ({
    type,
    ...(type !== 'null' ? rest : {}),
  }));
  const { title, description, causa } = rest;
  return {
    oneOf,
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(causa !== undefined && { causa }),
  };
}

/**
 * Resolve a single (non-nullable) schema node into a {@link PropertyType}.
 *
 * @param prop Raw schema node.
 * @param path Absolute path of the containing file.
 * @param inline Optional context enabling inline-schema extraction. When provided, inline objects/enums/unions become
 *   nested {@link Schema} entries pushed onto {@link InlineContext.schemas} and a `ref` is returned in their place.
 * @returns The resolved type.
 */
function resolveInnerType(
  prop: CausaSchema,
  path: string,
  inline?: InlineContext,
): PropertyType {
  if (inline) {
    const matched = tryResolveInlineSchema(
      prop,
      inline.pointer,
      inline.fallbackName,
      path,
    );
    if (matched) {
      inline.schemas.push(...matched.nested);
      return matched.type;
    }
  }

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
    return resolveArrayType(prop, path, inline);
  }

  if (rawType === 'object') {
    if (prop.properties !== undefined) {
      throw new InvalidSchemaError(
        path,
        'inline object schemas with `properties` are not supported here',
      );
    }
    return resolveMapType(prop, path, inline);
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
 * Item types may themselves use the nullable `oneOf: [..., {type: null}]` pattern, or carry inline object/enum/union
 * shapes when an {@link InlineContext} is threaded in.
 *
 * @param prop Raw schema node with `type: 'array'`.
 * @param path Absolute path of the containing file.
 * @param inline Optional context propagated to the items so inline schemas declared inside `items` can be extracted.
 * @returns The resolved array type.
 */
function resolveArrayType(
  prop: CausaSchema,
  path: string,
  inline?: InlineContext,
): PropertyType {
  if (
    !prop.items ||
    typeof prop.items !== 'object' ||
    Array.isArray(prop.items)
  ) {
    throw new InvalidSchemaError(path, 'array must declare an items schema');
  }

  const itemsPointer = inline ? `${inline.pointer}/items` : '';
  const {
    inner,
    nullable: itemNullable,
    pointer,
  } = unwrapNullableOneOf(prop.items as CausaSchema, itemsPointer, path);
  const itemInline = inline
    ? {
        schemas: inline.schemas,
        pointer,
        fallbackName: `${inline.fallbackName}Item`,
      }
    : undefined;

  return {
    kind: 'array',
    items: resolveInnerType(inner, path, itemInline),
    itemNullable,
  };
}

/**
 * Resolve a `type: object` schema node carrying `additionalProperties` into a {@link PropertyType} of kind `map`.
 *
 * Behavior follows {@link resolveAdditionalProperties}. `false` is rejected because a map cannot forbid all entries.
 *
 * @param prop Raw schema node.
 * @param path Absolute path of the containing file.
 * @param inline Optional context propagated to the value schema so inline schemas declared inside
 *   `additionalProperties` can be extracted.
 * @returns The resolved map type.
 * @throws {InvalidSchemaError} When `additionalProperties` is `false` or any value other than `true` or a schema.
 */
function resolveMapType(
  prop: CausaSchema,
  path: string,
  inline?: InlineContext,
): PropertyType {
  const value = resolveAdditionalProperties(prop, path, inline);

  if (value === false) {
    throw new InvalidSchemaError(
      path,
      "map cannot have 'additionalProperties: false'",
    );
  }

  return { kind: 'map', items: value === true ? 'any' : value };
}

/**
 * Resolve an `additionalProperties` declaration on a schema node into either a boolean or a {@link PropertyType}.
 *
 * - `undefined` and `true` yield `true` (the JSON Schema default).
 * - `false` yields `false`.
 * - A schema value is resolved via {@link resolveInnerType}, propagating the inline context to extract inline
 *   object/enum/union shapes. The inline pointer is suffixed with `/additionalProperties` and the fallback name is
 *   `${inline.fallbackName}Value` to match the convention used for map values.
 *
 * @param prop Raw schema node carrying (or not) `additionalProperties`.
 * @param path Absolute path of the containing file.
 * @param inline Optional context propagated to the value schema so inline schemas can be extracted.
 * @returns The resolved boolean or property type.
 * @throws {InvalidSchemaError} When `additionalProperties` is not `true`, `false`, or a schema.
 */
function resolveAdditionalProperties(
  prop: CausaSchema,
  path: string,
  inline?: InlineContext,
): boolean | PropertyType {
  const additional = prop.additionalProperties;
  if (additional === undefined || additional === true) {
    return true;
  }

  if (additional === false) {
    return false;
  }

  if (
    typeof additional !== 'object' ||
    additional === null ||
    Array.isArray(additional)
  ) {
    throw new InvalidSchemaError(
      path,
      'additionalProperties must be a boolean or a schema',
    );
  }

  const valueInline = inline
    ? {
        schemas: inline.schemas,
        pointer: `${inline.pointer}/additionalProperties`,
        fallbackName: `${inline.fallbackName}Value`,
      }
    : undefined;

  return resolveInnerType(additional as CausaSchema, path, valueInline);
}

/**
 * Resolve a primitive schema node (`type` + optional `format`) into a {@link PropertyType} of kind `primitive`.
 *
 * @param rawType The raw JSON Schema `type` value, if any.
 * @param format The raw JSON Schema `format` value, if any.
 * @param path Absolute path of the containing file, used for error reporting.
 * @returns The resolved primitive type.
 * @throws {InvalidSchemaError} When `type` is missing or not a recognized primitive.
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
  if (rawType && PRIMITIVE_TYPES.has(rawType as PrimitiveType)) {
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
