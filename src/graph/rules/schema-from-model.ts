import { relative } from 'path';
import {
  GraphOriginKind,
  SchemaGraphNodeKind,
  SchemaPropertyCollection,
  type EmbedsGraphEdgeData,
  type GraphOriginSource,
  type GraphRule,
  type GraphRuleEdge,
  type GraphRuleNode,
  type GraphWarning,
  type IdentifierOfExtension,
  type PropertyType,
  type ReferencesGraphEdgeData,
  type Schema,
  type SchemaGraphNodeCombiner,
  type SchemaGraphNodeData,
} from '../../definitions/index.js';
import { appendToSchemaPath, splitSchemaPath } from '../../jsonschema/index.js';
import { topicId } from '../ids.js';
import type { DocumentPath } from '../locate.js';
import { ModelFact, type ModelFacts, type SchemaFacts } from '../model.js';

/**
 * A schema referenced by a schema, and how.
 */
type SchemaReference = {
  /**
   * The absolute path of the referenced schema.
   */
  readonly ref: string;

  /**
   * The path within the referencing schema's file to the construct holding the reference.
   */
  readonly segments: DocumentPath;

  /**
   * The name of the property holding the reference, if any.
   */
  readonly property?: string;

  /**
   * How the property holds several values, if it does.
   */
  readonly collection?: SchemaPropertyCollection;
};

/**
 * Returns the schema referenced by a type, and how a property of that type holds it.
 *
 * @param type The type of the property.
 * @returns The referenced schema and the collection holding it, or `undefined` if the type references no schema.
 */
function refOfType(
  type: PropertyType | 'any',
): { ref: string; collection?: SchemaPropertyCollection } | undefined {
  if (type === 'any') {
    return undefined;
  }

  switch (type.kind) {
    case 'ref':
      return { ref: type.ref };
    case 'array': {
      const inner = refOfType(type.items);
      return inner && { ...inner, collection: SchemaPropertyCollection.Array };
    }
    case 'map': {
      const inner = refOfType(type.items);
      return inner && { ...inner, collection: SchemaPropertyCollection.Map };
    }
    default:
      return undefined;
  }
}

/**
 * Returns how a property of the given type holds several values, if it does.
 *
 * @param type The type of the property.
 * @returns The collection, or `undefined` for a single value.
 */
function collectionOfType(
  type: PropertyType,
): SchemaPropertyCollection | undefined {
  switch (type.kind) {
    case 'array':
      return SchemaPropertyCollection.Array;
    case 'map':
      return SchemaPropertyCollection.Map;
    default:
      return undefined;
  }
}

/**
 * Lists the schemas embedded by a schema: the types of its properties and additional properties, and the members of a
 * union.
 *
 * @param schema The schema.
 * @param segments The path to the schema within its file.
 * @returns The embedded schemas.
 */
function embeddedSchemas(
  schema: Schema,
  segments: DocumentPath,
): SchemaReference[] {
  if (schema.kind === 'union') {
    return schema.types.flatMap((type) => {
      const inner = refOfType(type);
      return inner
        ? [{ ...inner, segments: [...segments, schema.combiner] }]
        : [];
    });
  }

  if (schema.kind !== 'object') {
    return [];
  }

  const references: SchemaReference[] = schema.properties.flatMap(
    ({ name, type }) => {
      const inner = refOfType(type);
      return inner
        ? [
            {
              ...inner,
              property: name,
              segments: [...segments, 'properties', name],
            },
          ]
        : [];
    },
  );
  const { additionalProperties } = schema;
  if (typeof additionalProperties === 'object') {
    const inner = refOfType(additionalProperties);
    if (inner) {
      references.push({
        ref: inner.ref,
        collection: SchemaPropertyCollection.Map,
        segments: [...segments, 'additionalProperties'],
      });
    }
  }

  return references;
}

/**
 * Lists the enums hinting the values of the properties of an object schema (`causa.enumHint`).
 *
 * @param schema The schema.
 * @param segments The path to the schema within its file.
 * @returns The enums named by the extension.
 */
function enumHints(schema: Schema, segments: DocumentPath): SchemaReference[] {
  if (schema.kind !== 'object') {
    return [];
  }

  return schema.properties.flatMap(({ name, type, extensions }) => {
    const ref = extensions.enumHint;
    return typeof ref === 'string'
      ? [
          {
            ref,
            property: name,
            collection: collectionOfType(type),
            segments: [...segments, 'properties', name, 'causa', 'enumHint'],
          },
        ]
      : [];
  });
}

/**
 * A property of an object schema declaring the schema whose instances it identifies (`causa.identifierOf`).
 */
type PropertyIdentifier = Omit<SchemaReference, 'ref'> & {
  /**
   * The name of the property.
   */
  readonly property: string;

  /**
   * The value of the extension, which is not validated.
   */
  readonly identifierOf: unknown;
};

/**
 * Lists the properties of an object schema declaring the schema whose instances they identify (`causa.identifierOf`).
 *
 * @param schema The schema.
 * @param segments The path to the schema within its file.
 * @returns The properties declaring the extension.
 */
function propertyIdentifiers(
  schema: Schema,
  segments: DocumentPath,
): PropertyIdentifier[] {
  if (schema.kind !== 'object') {
    return [];
  }

  return schema.properties.flatMap(({ name, type, extensions }) =>
    extensions.identifierOf !== undefined
      ? [
          {
            property: name,
            collection: collectionOfType(type),
            segments: [
              ...segments,
              'properties',
              name,
              'causa',
              'identifierOf',
            ],
            identifierOf: extensions.identifierOf,
          },
        ]
      : [],
  );
}

/**
 * Checks whether a dot-separated property path exists in an object schema. Each segment but the last must be a
 * property holding a single object. A property missing from a constraint schema is looked up in the schema it
 * constrains (`causa.constraintFor`).
 *
 * @param schemas The schemas of the model, keyed by path.
 * @param schema The object schema.
 * @param path The dot-separated property path.
 * @param visited The paths of the schemas already looked up for the path, to stop on cycles.
 * @returns Whether the path exists.
 */
function hasPropertyPath(
  schemas: ModelFacts['schemas'],
  schema: SchemaFacts | undefined,
  path: string,
  visited: ReadonlySet<string> = new Set(),
): boolean {
  const definition = schema?.definition;
  if (definition?.kind !== 'object' || visited.has(schema!.path)) {
    return false;
  }

  const [name, ...rest] = path.split('.');
  const property = definition.properties.find((p) => p.name === name);
  if (!property) {
    const { constraintFor } = definition.extensions;
    return (
      typeof constraintFor === 'string' &&
      hasPropertyPath(
        schemas,
        schemas.get(constraintFor),
        path,
        new Set([...visited, schema!.path]),
      )
    );
  }

  if (rest.length === 0) {
    return true;
  }

  const inner = refOfType(property.type);
  return (
    !!inner &&
    !inner.collection &&
    hasPropertyPath(schemas, schemas.get(inner.ref), rest.join('.'))
  );
}

/**
 * Checks whether the value of `causa.identifierOf` has the expected shape.
 *
 * @param value The value of the extension.
 * @returns Whether the value is an object with a `schema`, and a `property` and `scope` of the expected types when set.
 */
function isIdentifierOf(value: unknown): value is IdentifierOfExtension {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const { schema, property, scope } = value as Record<string, unknown>;
  return (
    typeof schema === 'string' &&
    (property === undefined || typeof property === 'string') &&
    (scope === undefined ||
      (!!scope &&
        typeof scope === 'object' &&
        !Array.isArray(scope) &&
        Object.values(scope).every((v) => typeof v === 'string')))
  );
}

/**
 * Returns the schema enclosing a nested schema in its file, i.e. the schema at the longest prefix of its pointer.
 *
 * @param schemas The schemas of the model, keyed by path.
 * @param schema The schema.
 * @returns The enclosing schema, or `undefined` for the root schema of a file.
 */
function enclosingSchema(
  schemas: ModelFacts['schemas'],
  schema: SchemaFacts,
): SchemaFacts | undefined {
  const { file } = splitSchemaPath(schema.path);
  for (let length = schema.segments.length - 1; length >= 0; length--) {
    const enclosing = schemas.get(
      appendToSchemaPath(file, ...schema.segments.slice(0, length)),
    );
    if (enclosing) {
      return enclosing;
    }
  }

  return undefined;
}

/**
 * Returns the type-specific payload of a `schema` node.
 *
 * @param schema The parsed schema.
 * @returns The {@link SchemaGraphNodeData}.
 */
function schemaData(schema: Schema): SchemaGraphNodeData {
  switch (schema.kind) {
    case 'object':
      return {
        kind: SchemaGraphNodeKind.Object,
        databases: schema.databases.length > 0 ? schema.databases : undefined,
      };
    case 'enum':
      return { kind: SchemaGraphNodeKind.Enum, values: schema.values };
    case 'union':
      return {
        kind: SchemaGraphNodeKind.Union,
        combiner: schema.combiner as SchemaGraphNodeCombiner,
      };
  }
}

/**
 * A `schema` node per schema of the model, i.e. the schemas `ModelFact` parses from the files matched by `model.globs`
 * and the files they reference, including nested and inline schemas. The parent is the schema enclosing it in its file,
 * at the longest prefix of its JSON pointer. The root schema of a file is in the domain of the file.
 *
 * Edges, oriented from the schema declaring the relation:
 *
 * - `defines`: to the `entity`, `state`, or `topic` the architecture reads from the schema.
 * - `embeds`: to the schema typing a property (including array items and map values), additional properties, or a
 *   union member. A property's `causa.enumHint` also embeds the enum, with `hint` set.
 * - `references`: to the schema named by a property's `causa.identifierOf`.
 * - `constrains`: to the schema named by `causa.constraintFor`.
 * - `projects`: from the schema named by `causa.projectionOf`, to the projection.
 *
 * A relation to something that is not a parsed schema is reported as a warning, rather than emitted as a dangling edge.
 */
export const schemaFromModel: GraphRule = {
  name: 'schemaFromModel',
  kind: GraphOriginKind.Declared,
  description:
    'One `schema` node per schema of the model, including nested and inline schemas, parented to the schema enclosing it in its file. One `defines` edge to the `entity`, `state`, or `topic` read from it. One `embeds` edge per property, additional properties, or union member typed by another schema, or hinted by an enum (`causa.enumHint`). One `references` edge per `causa.identifierOf`, one `constrains` edge per `causa.constraintFor`, and one `projects` edge per `causa.projectionOf`.',
  async run(graph) {
    const { locator, context } = graph;
    const model = await graph.get(ModelFact);
    const nodes: GraphRuleNode[] = [];
    const edges: GraphRuleEdge[] = [];
    const warnings: GraphWarning[] = [];

    for (const schema of model.schemas.values()) {
      const { definition, file, segments } = schema;
      const source = await locator.source(file, segments);
      const parent = enclosingSchema(model.schemas, schema);
      nodes.push({
        layer: 'model',
        type: 'schema',
        locator: schema.locator,
        parent: parent?.id,
        domain: parent ? undefined : schema.domain?.directory,
        name: definition.name,
        description: definition.description,
        sources: [source],
        data: schemaData(definition),
      });

      const topic = model.topicsBySchema.get(schema.path);
      const defined = [
        model.entities.get(schema.path)?.id,
        model.states.get(schema.path)?.id,
        topic && topicId(topic.id),
      ];
      for (const to of defined) {
        if (to) {
          edges.push({
            type: 'defines',
            from: schema.id,
            to,
            sources: [source],
          });
        }
      }

      // The schema a relation declared by the schema points to, with a warning when it is not a parsed schema.
      const target = async (
        ref: string,
        relation: string,
        relationSegments: DocumentPath,
      ): Promise<{ schema?: SchemaFacts; source: GraphOriginSource }> => {
        const relationSource = await locator.source(file, relationSegments);
        const targetSchema = model.schemas.get(ref);
        if (!targetSchema) {
          warnings.push({
            message: `Schema '${definition.name}' ${relation} '${relative(context.rootPath, ref)}', which is not a schema of the model.`,
            sources: [relationSource],
          });
        }

        return { schema: targetSchema, source: relationSource };
      };

      const embedded = [
        ...embeddedSchemas(definition, segments).map((r) => ({
          ...r,
          hint: false,
        })),
        ...enumHints(definition, segments).map((r) => ({ ...r, hint: true })),
      ];
      for (const {
        ref,
        property,
        collection,
        hint,
        segments: at,
      } of embedded) {
        const { schema: to, source: edgeSource } = await target(
          ref,
          'embeds',
          at,
        );
        if (!to) {
          continue;
        }

        const data: EmbedsGraphEdgeData = {
          ...(property !== undefined ? { property } : {}),
          ...(collection ? { collection } : {}),
          ...(hint ? { hint } : {}),
        };
        edges.push({
          type: 'embeds',
          from: schema.id,
          to: to.id,
          label: property,
          sources: [edgeSource],
          data: Object.keys(data).length > 0 ? data : undefined,
        });
      }

      const identifiers = propertyIdentifiers(definition, segments);
      for (const {
        property,
        collection,
        segments: at,
        identifierOf,
      } of identifiers) {
        if (!isIdentifierOf(identifierOf)) {
          warnings.push({
            message: `Property '${property}' of schema '${definition.name}' declares an 'identifierOf' that is not an object with a 'schema'.`,
            sources: [await locator.source(file, at)],
          });
          continue;
        }

        const { schema: to, source: edgeSource } = await target(
          identifierOf.schema,
          'references',
          at,
        );
        if (!to) {
          continue;
        }

        if (to.definition.kind !== 'object') {
          warnings.push({
            message: `Property '${property}' of schema '${definition.name}' is the identifier of '${to.locator}', which is not an object schema.`,
            sources: [edgeSource],
          });
          continue;
        }

        const targetProperty = identifierOf.property ?? 'id';
        const scope = identifierOf.scope ?? {};
        const missing = [
          ...[targetProperty, ...Object.keys(scope)]
            .filter((p) => !hasPropertyPath(model.schemas, to, p))
            .map((p) => `'${p}' of '${to.definition.name}'`),
          ...Object.values(scope)
            .filter((p) => !hasPropertyPath(model.schemas, schema, p))
            .map((p) => `'${p}' of '${definition.name}'`),
        ];
        if (missing.length > 0) {
          warnings.push({
            message: `The 'identifierOf' of property '${property}' of schema '${definition.name}' names properties that do not exist: ${missing.join(', ')}.`,
            sources: [edgeSource],
          });
        }

        const data: ReferencesGraphEdgeData = {
          property,
          ...(collection ? { collection } : {}),
          targetProperty,
          ...(Object.keys(scope).length > 0 ? { scope } : {}),
        };
        edges.push({
          type: 'references',
          from: schema.id,
          to: to.id,
          label: property,
          sources: [edgeSource],
          data,
        });
      }

      const { constraintFor, projectionOf } = definition.extensions;
      if (typeof constraintFor === 'string') {
        const { schema: to, source: edgeSource } = await target(
          constraintFor,
          'constrains',
          [...segments, 'causa', 'constraintFor'],
        );
        if (to) {
          edges.push({
            type: 'constrains',
            from: schema.id,
            to: to.id,
            sources: [edgeSource],
          });
        }
      }

      if (typeof projectionOf === 'string') {
        const { schema: from, source: edgeSource } = await target(
          projectionOf,
          'is a projection of',
          [...segments, 'causa', 'projectionOf'],
        );
        if (from) {
          edges.push({
            type: 'projects',
            from: from.id,
            to: schema.id,
            sources: [edgeSource],
          });
        }
      }
    }

    return { nodes, edges, warnings };
  },
};
