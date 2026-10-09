import type { WorkspaceContext } from '@causa/workspace';
import { globby } from 'globby';
import { relative } from 'path';
import type { ModelConfiguration } from '../configurations/index.js';
import {
  EventTopicList,
  ModelSchemaParse,
  type EventTopicDefinition,
  type ObjectSchema,
  type Schema,
} from '../definitions/index.js';
import { fromPointer, splitSchemaPath } from '../jsonschema/index.js';
import {
  GraphExtractionFact,
  type GraphContext,
  type GraphFactOutput,
  type GraphWarning,
} from './context.js';
import { entityId } from './ids.js';
import type { DocumentPath } from './locate.js';

/**
 * A parsed schema, located in the workspace.
 */
export type SchemaFacts = {
  /**
   * The parsed schema.
   */
  readonly definition: Schema;

  /**
   * The absolute path of the schema, with its fragment, as the parser keys it.
   */
  readonly path: string;

  /**
   * The file declaring the schema, relative to the workspace root.
   */
  readonly file: string;

  /**
   * The path to the schema within its file, empty for a top-level schema.
   */
  readonly segments: DocumentPath;

  /**
   * The locator of the schema: its file, with `#<JSON pointer>` appended for a nested definition.
   */
  readonly locator: string;
};

/**
 * An entity of the architecture: an object schema carried by a topic, or persisted in a database.
 */
export type EntityFacts = {
  /**
   * The ID of the `entity` node.
   */
  readonly id: string;

  /**
   * The schema defining the entity.
   */
  readonly schema: SchemaFacts & { readonly definition: ObjectSchema };

  /**
   * The topics whose event schema's `data` property references the entity's schema.
   */
  readonly carriedBy: readonly EventTopicDefinition[];
};

/**
 * The model of the workspace: its event topics, its schemas, and the entities they define.
 */
export type ModelFacts = {
  /**
   * The event topics, keyed by ID.
   */
  readonly topics: ReadonlyMap<string, EventTopicDefinition>;

  /**
   * The parsed schemas, keyed by absolute path.
   */
  readonly schemas: ReadonlyMap<string, SchemaFacts>;

  /**
   * The entities, keyed by the absolute path of their schema.
   */
  readonly entities: ReadonlyMap<string, EntityFacts>;
};

/**
 * The model of the workspace: its event topics, its schemas, and the entities they define.
 *
 * Schemas are those matched by the `model.globs` configuration, and those they reference.
 * An object schema is an entity when a topic carries it or when it is persisted (`ModelSchemaExtractDatabase` produced
 * a binding). A topic carries the schema its `data` property references.
 */
export class ModelFact extends GraphExtractionFact<ModelFacts> {
  async compute(graph: GraphContext): Promise<GraphFactOutput<ModelFacts>> {
    const { context } = graph;
    const [topics, { schemas: parsed, warnings }] = await Promise.all([
      context.call(EventTopicList, {}),
      this.parseSchemas(context),
    ]);

    const schemas = new Map(
      Object.entries(parsed).map(([path, schema]) => [
        path,
        this.locateSchema(context, path, schema),
      ]),
    );

    return {
      value: {
        topics: new Map(topics.map((t) => [t.id, t])),
        schemas,
        entities: this.classifyEntities(schemas, topics),
      },
      warnings,
    };
  }

  /**
   * Parses all the schemas matched by the `model.globs` configuration.
   *
   * @param context The workspace context.
   * @returns The parsed schemas, keyed by absolute path, and a warning for each file that could not be parsed.
   */
  private async parseSchemas(context: WorkspaceContext): Promise<{
    schemas: Record<string, Schema>;
    warnings: GraphWarning[];
  }> {
    const globs = context
      .asConfiguration<ModelConfiguration>()
      .get('model.globs');
    if (!globs?.length) {
      return { schemas: {}, warnings: [] };
    }

    const paths = await globby(globs, {
      cwd: context.rootPath,
      absolute: true,
      followSymbolicLinks: false,
    });
    paths.sort();
    const { schemas, errors } = await context.call(ModelSchemaParse, { paths });
    const warnings = Object.entries(errors).map(([path, error]) => {
      const file = relative(context.rootPath, path);
      return {
        message: `Schema file '${file}' could not be parsed: ${error}`,
        sources: [{ path: file }],
      };
    });

    return { schemas, warnings };
  }

  /**
   * Locates a parsed schema in the workspace.
   *
   * @param context The workspace context.
   * @param path The absolute path of the schema, as the parser keys it.
   * @param definition The parsed schema.
   * @returns The {@link SchemaFacts}.
   */
  private locateSchema(
    context: WorkspaceContext,
    path: string,
    definition: Schema,
  ): SchemaFacts {
    const { file: absoluteFile, pointer } = splitSchemaPath(path);
    const file = relative(context.rootPath, absoluteFile);
    return {
      definition,
      path,
      file,
      segments: fromPointer(pointer),
      locator: pointer && pointer !== '/' ? `${file}#${pointer}` : file,
    };
  }

  /**
   * Returns the object schemas carried by a topic or persisted in a database.
   *
   * @param schemas The schemas of the workspace, keyed by path.
   * @param topics The event topics of the workspace.
   * @returns The {@link EntityFacts}, keyed by the path of their schema.
   */
  private classifyEntities(
    schemas: ReadonlyMap<string, SchemaFacts>,
    topics: readonly EventTopicDefinition[],
  ): Map<string, EntityFacts> {
    const carriers = new Map<string, EventTopicDefinition[]>();
    for (const topic of topics) {
      const event = schemas.get(topic.schemaFilePath)?.definition;
      if (event?.kind !== 'object') {
        continue;
      }

      const data = event.properties.find((p) => p.name === 'data');
      if (data?.type.kind !== 'ref') {
        continue;
      }

      const carried = carriers.get(data.type.ref) ?? [];
      carriers.set(data.type.ref, [...carried, topic]);
    }

    const entities = new Map<string, EntityFacts>();
    for (const schema of schemas.values()) {
      const { definition } = schema;
      const carriedBy = carriers.get(schema.path) ?? [];
      if (
        definition.kind !== 'object' ||
        (carriedBy.length === 0 && definition.databases.length === 0)
      ) {
        continue;
      }

      entities.set(schema.path, {
        id: entityId(schema.locator),
        schema: { ...schema, definition },
        carriedBy,
      });
    }

    return entities;
  }
}
