import { NoImplementationFoundError } from '@causa/workspace/function-registry';
import { relative, resolve } from 'path';
import { isDeepStrictEqual } from 'util';
import {
  DatabaseCountRecords,
  EventTopicCountEvents,
  EventTopicList,
  ModelSchemaCountRecords,
  ModelSchemaParse,
  type SourceRecordCounts,
  type ObjectSchema,
  type RecordCondition,
  type RecordCounts,
  type RecordFilters,
  type Schema,
  type SchemaRecordCounts,
} from '../../definitions/index.js';
import { joinSchemaPath, splitSchemaPath } from '../../jsonschema/index.js';

/**
 * The default length of the time range over which events are counted, in milliseconds.
 */
const DEFAULT_EVENTS_TIME_RANGE = 24 * 3600 * 1000;

/**
 * An error thrown when a constraint cannot be expressed as {@link RecordCondition}s.
 */
class UnsupportedConstraintError extends Error {}

/**
 * Returns the conditions a record must satisfy to satisfy a constraint.
 * Each property of the constraint should be constrained to a constant, to `null`, to a non-null value of the type of
 * the constrained property, or to another constraint on the type of the constrained property. Properties of the
 * constraint are considered required, whether or not they are listed as such.
 *
 * @param schemas The parsed schemas, keyed by path.
 * @param constraint The constraint.
 * @param prefix The path to the object constrained by the constraint, from the root of the record.
 * @param visited The paths of the constraints being expanded, used to detect cycles.
 * @returns The conditions.
 */
function constraintConditions(
  schemas: Record<string, Schema>,
  constraint: ObjectSchema,
  prefix: string[] = [],
  visited: ReadonlySet<string> = new Set(),
): RecordCondition[] {
  if (visited.has(constraint.path)) {
    throw new UnsupportedConstraintError(
      `Constraint '${constraint.name}' references itself.`,
    );
  }

  const target = schemas[constraint.extensions.constraintFor as string];
  if (target?.kind !== 'object') {
    throw new UnsupportedConstraintError(
      `The schema constrained by '${constraint.name}' is not an object schema.`,
    );
  }

  return constraint.properties.flatMap((property): RecordCondition[] => {
    const path = [...prefix, property.name];
    const constrained = target.properties.find((p) => p.name === property.name);
    if (!constrained) {
      throw new UnsupportedConstraintError(
        `'${path.join('.')}' is not a property of '${target.name}'.`,
      );
    }

    const { type, nullable } = property;
    if (isDeepStrictEqual(type, constrained.type)) {
      return !nullable && constrained.nullable
        ? [{ path, operator: 'isNotNull' }]
        : [];
    }

    if (type.kind === 'null') {
      return [{ path, operator: 'isNull' }];
    }

    if (!nullable && type.kind === 'const') {
      return [{ path, operator: 'equals', value: type.value }];
    }

    const nested = type.kind === 'ref' ? schemas[type.ref] : undefined;
    if (
      !nullable &&
      nested?.kind === 'object' &&
      constrained.type.kind === 'ref' &&
      nested.extensions.constraintFor === constrained.type.ref
    ) {
      return constraintConditions(
        schemas,
        nested,
        path,
        new Set([...visited, constraint.path]),
      );
    }

    throw new UnsupportedConstraintError(
      `'${path.join('.')}' is not constrained to a constant, to null, to a non-null value, or to another constraint.`,
    );
  });
}

/**
 * Implements {@link ModelSchemaCountRecords}, by translating the constraints of the schema to {@link RecordFilters}
 * and counting the matching records using {@link DatabaseCountRecords} for each database binding of the schema, and
 * {@link EventTopicCountEvents} for the topic whose event schema is the schema.
 * Constraints are only looked up in the file of the schema, and in the files it references, as parsed by
 * {@link ModelSchemaParse}.
 */
export class ModelSchemaCountRecordsForAll extends ModelSchemaCountRecords {
  async _call(): Promise<SchemaRecordCounts> {
    const { file: relativeFile, pointer } = splitSchemaPath(this.schema);
    const file = resolve(this._context.rootPath, relativeFile);
    const path = joinSchemaPath(file, pointer);

    const { schemas, errors } = await this._context.call(ModelSchemaParse, {
      paths: [file],
    });
    if (errors[file]) {
      throw errors[file];
    }

    const schema = schemas[path];
    if (schema?.kind !== 'object') {
      throw new Error(`'${this.schema}' is not an object schema.`);
    }

    const filters: RecordFilters = {};
    const unsupported: Record<string, string> = {};
    for (const constraint of Object.values(schemas)) {
      if (
        constraint.kind !== 'object' ||
        constraint.extensions.constraintFor !== path
      ) {
        continue;
      }

      const constraintPath = splitSchemaPath(constraint.path);
      const locator = joinSchemaPath(
        relative(this._context.rootPath, constraintPath.file),
        constraintPath.pointer,
      );
      try {
        filters[locator] = constraintConditions(schemas, constraint);
      } catch (error) {
        if (!(error instanceof UnsupportedConstraintError)) {
          throw error;
        }

        unsupported[locator] = error.message;
      }
    }

    const to = this.to ?? new Date();
    const from =
      this.from ?? new Date(to.getTime() - DEFAULT_EVENTS_TIME_RANGE);
    const topics = path === file ? await this.listTopics(file) : [];
    const sources = await Promise.all([
      ...schema.databases.map((binding) =>
        this.count(
          { type: 'database', engine: binding.engine, table: binding.table },
          () =>
            this._context.call(DatabaseCountRecords, {
              engine: binding.engine,
              schema,
              filters,
            }),
        ),
      ),
      ...topics.map((topic) =>
        this.count({ type: 'eventTopic', topic, from, to }, () =>
          this._context.call(EventTopicCountEvents, {
            topic,
            from,
            to,
            filters,
          }),
        ),
      ),
    ]);

    return { sources: sources.filter((s) => !!s), unsupported };
  }

  _supports(): boolean {
    return true;
  }

  /**
   * Lists the IDs of the event topics whose event schema is defined by the given file.
   *
   * @param file The absolute path to the schema file.
   * @returns The IDs of the topics.
   */
  private async listTopics(file: string): Promise<string[]> {
    const topics = await this._context.call(EventTopicList, {});
    return topics.filter((t) => t.schemaFilePath === file).map((t) => t.id);
  }

  /**
   * Counts the records in a source.
   *
   * @param source The source.
   * @param count The function counting the records.
   * @returns The counts, or `undefined` if counting is not supported for the source.
   */
  private async count(
    source: SourceRecordCounts['source'],
    count: () => Promise<RecordCounts>,
  ): Promise<SourceRecordCounts | undefined> {
    let counts: RecordCounts;
    try {
      counts = await count();
    } catch (error) {
      if (!(error instanceof NoImplementationFoundError)) {
        throw error;
      }

      this._context.logger.warn(
        `⚠️ Counting records is not supported for ${source.type === 'database' ? `the '${source.engine}' database engine` : `the '${source.topic}' event topic`}.`,
      );
      return undefined;
    }

    return { source, total: counts.total, constraints: counts.counts };
  }
}
