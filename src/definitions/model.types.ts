/**
 * The primitive scalar types the model supports.
 */
export type PrimitiveType =
  | 'string'
  | 'integer'
  | 'number'
  | 'boolean'
  | 'uuid'
  | 'datetime';

/**
 * The underlying type of an {@link EnumSchema}.
 */
export type EnumType = 'string' | 'integer';

/**
 * A bag of format-specific extensions attached to a schema or property.
 *
 * Known keys are typed explicitly; the index signature accepts unknown entries that pass through unchanged.
 * Ref-bearing keys listed in {@link REF_BEARING_CAUSA_EXTENSIONS} are normalized to absolute schema paths during
 * parsing.
 */
export type CausaExtensions = {
  /**
   * Absolute path of the schema this constraint applies to.
   */
  constraintFor?: string;

  /**
   * Absolute path of an enum schema documenting the suggested values for the underlying primitive.
   */
  enumHint?: string;

  [key: string]: unknown;
};

/**
 * Causa extension keys whose values are references to other schemas.
 *
 * Values stored under these keys are normalized to absolute paths during parsing so downstream consumers never need to
 * perform pointer resolution themselves.
 */
export const REF_BEARING_CAUSA_EXTENSIONS: readonly string[] = [
  'constraintFor',
  'enumHint',
];

/**
 * Fields common to every parsed schema.
 *
 * A schema is identified by its absolute {@link BaseSchema.path}, which may carry a JSON Pointer fragment for nested or
 * inline definitions (e.g. `"/abs/file.yaml#/$defs/Address"`).
 */
export type BaseSchema = {
  /**
   * Human-readable name, also used for code generation.
   */
  name: string;

  /**
   * Absolute path identifying this schema. Top-level schemas use the bare file path; nested and inline schemas carry
   * a `#`-fragment.
   */
  path: string;

  /**
   * Description copied from the source schema, if any.
   */
  description?: string;

  /**
   * Causa-specific extension bag. Ref-bearing values are resolved to absolute paths; other entries are passed through
   * unchanged.
   */
  extensions: CausaExtensions;
};

/**
 * A database binding derived from causa extensions on an object schema. Each entry describes one engine the object is
 * persisted in.
 */
export type SchemaDatabase = {
  /**
   * Identifier of the database engine.
   */
  engine: string;

  /**
   * Dot-separated property paths forming the primary key, in order. Each segment references a property name
   * (e.g. `"tenant.id"`).
   */
  primaryKeys?: string[];

  /**
   * Engine-specific table / collection name, when provided.
   */
  table?: string;
};

/**
 * An object schema with named properties.
 */
export type ObjectSchema = BaseSchema & {
  /**
   * Discriminant identifying this as an object schema.
   */
  kind: 'object';

  /**
   * The properties defined on this object schema.
   */
  properties: Property[];

  /**
   * Database bindings derived from causa extensions on this object.
   */
  databases: SchemaDatabase[];
};

/**
 * An object schema before its {@link ObjectSchema.databases} field has been populated.
 *
 * Passed to implementations of `ModelSchemaExtractDatabase` so each engine module decides whether the schema is
 * persisted in its database.
 */
export type ObjectSchemaWithoutDatabases = Omit<ObjectSchema, 'databases'>;

/**
 * An enumeration schema with a fixed set of values. Discriminated on {@link EnumSchema.type} so consumers can narrow
 * {@link EnumSchema.values} to the correct primitive array.
 */
export type EnumSchema = BaseSchema &
  (
    | {
        /**
         * Discriminant identifying this as an enum schema.
         */
        kind: 'enum';

        /**
         * The underlying primitive type of the enum values.
         */
        type: 'string';

        /**
         * The enum values, as JavaScript strings.
         */
        values: string[];
      }
    | {
        /**
         * Discriminant identifying this as an enum schema.
         */
        kind: 'enum';

        /**
         * The underlying primitive type of the enum values.
         */
        type: 'integer';

        /**
         * The enum values, as JavaScript numbers.
         */
        values: number[];
      }
  );

/**
 * A union schema combining two or more member types.
 */
export type UnionSchema = BaseSchema & {
  /**
   * Discriminant identifying this as a union schema.
   */
  kind: 'union';

  /**
   * The non-null member types of the union, in source order.
   */
  types: PropertyType[];
};

/**
 * Union of every concrete schema kind.
 */
export type Schema = ObjectSchema | EnumSchema | UnionSchema;

/**
 * Describes the type of a {@link Property} or union member.
 *
 * Discriminated on {@link PropertyType.kind} so consumers can narrow on the kind tag. References to other schemas
 * (object, enum, union) all use {@link RefPropertyType}; resolving which kind the target is happens at a higher layer.
 */
export type PropertyType =
  | PrimitivePropertyType
  | NullPropertyType
  | ConstPropertyType
  | RefPropertyType
  | ArrayPropertyType
  | MapPropertyType;

/**
 * A scalar primitive type.
 */
export type PrimitivePropertyType = {
  /**
   * Discriminant.
   */
  kind: 'primitive';

  /**
   * The specific primitive type name.
   */
  type: PrimitiveType;
};

/**
 * An explicit null type, typically used in constraint schemas to assert a field must be null in a given state.
 */
export type NullPropertyType = {
  /**
   * Discriminant.
   */
  kind: 'null';
};

/**
 * A constant value. The underlying primitive type is inferred from the source value (string, number, integer, boolean)
 * and narrows the concrete type of {@link ConstPropertyType.value}.
 */
export type ConstPropertyType =
  | { kind: 'const'; type: 'string'; value: string }
  | { kind: 'const'; type: 'integer' | 'number'; value: number }
  | { kind: 'const'; type: 'boolean'; value: boolean };

/**
 * A reference to another schema, regardless of whether the target is an object, enum, or union.
 * The {@link RefPropertyType.ref} string is an absolute schema path.
 */
export type RefPropertyType = {
  /**
   * Discriminant.
   */
  kind: 'ref';

  /**
   * Absolute path of the referenced schema.
   *
   * @example "/abs/entities/user.yaml#/$defs/Address"
   */
  ref: string;
};

/**
 * An array of items, each having their own type.
 */
export type ArrayPropertyType = {
  /**
   * Discriminant.
   */
  kind: 'array';

  /**
   * The type of each array element.
   */
  items: PropertyType;

  /**
   * Whether individual items accept `null`.
   */
  itemNullable: boolean;
};

/**
 * A map (dictionary) keyed by strings with typed values.
 */
export type MapPropertyType = {
  /**
   * Discriminant.
   */
  kind: 'map';

  /**
   * The type of each map value, or `'any'` for unconstrained values.
   */
  items: PropertyType | 'any';
};

/**
 * A single property within an {@link ObjectSchema}.
 */
export type Property = {
  /**
   * The property name (the key in the parent's properties map).
   */
  name: string;

  /**
   * The resolved type of this property.
   */
  type: PropertyType;

  /**
   * Whether this property accepts `null`.
   */
  nullable: boolean;

  /**
   * Whether this property is listed in the parent's `required` set.
   */
  required: boolean;

  /**
   * Description from the source schema, if any.
   */
  description?: string;

  /**
   * Causa-specific extension bag for this property. Ref-bearing values are resolved to absolute paths; other entries
   * pass through.
   */
  extensions: CausaExtensions;
};

/**
 * Result of parsing one or more schema files.
 */
export type LoadSchemasResult = {
  /**
   * Every parsed schema, keyed by its workspace-absolute path (including any `#`-fragment for `$defs` / inline
   * schemas).
   */
  schemas: Record<string, Schema>;

  /**
   * Files that could not be loaded or parsed, keyed by absolute path. Includes file-read failures, deserialization
   * failures, and parser errors.
   */
  errors: Record<string, Error>;
};

/**
 * Thrown by parsers when the supplied input does not represent a parseable schema document.
 */
export class InvalidSchemaError extends Error {
  /**
   * Human-readable reasons describing the failure.
   */
  readonly reasons: string[];

  /**
   * Creates a new {@link InvalidSchemaError}.
   *
   * @param path Absolute path of the document that failed to parse.
   * @param reasons One or more human-readable reasons describing the failure.
   */
  constructor(
    readonly path: string,
    reasons: string | string[],
  ) {
    const reasonList = typeof reasons === 'string' ? [reasons] : reasons;
    super(
      `Invalid schema at '${path}':\n${reasonList.map((r) => `- ${r}`).join('\n')}`,
    );
    this.name = 'InvalidSchemaError';
    this.reasons = reasonList;
  }
}
