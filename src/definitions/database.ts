import { WorkspaceFunction } from '@causa/workspace';
import { PassArgumentsByReference } from '@causa/workspace/function-registry';
import { AllowMissing } from '@causa/workspace/validation';
import { IsObject, IsString } from 'class-validator';
import type { ObjectSchema } from './model.types.js';
import type { RecordCounts, RecordFilters } from './records.js';

/**
 * Queries a database for records and returns the matching rows or documents.
 */
@PassArgumentsByReference()
export abstract class DatabaseQueryRecords extends WorkspaceFunction<
  Promise<any[]>
> {
  /**
   * The database engine to query. Implementations register against a specific engine.
   */
  @IsString()
  readonly engine!: string;

  /**
   * The name of the database to query within the engine.
   */
  @AllowMissing()
  @IsString()
  readonly database?: string;

  /**
   * The query to run against the database.
   */
  @AllowMissing()
  @IsString()
  readonly query?: string;
}

/**
 * Counts the records of an object schema persisted in a database, and those matching each of the given filters.
 * Implementations register against a specific engine, and read from the schema where its records are stored, e.g. the
 * table in its {@link ObjectSchema.databases} binding for the engine, and the column of each property.
 */
@PassArgumentsByReference()
export abstract class DatabaseCountRecords extends WorkspaceFunction<
  Promise<RecordCounts>
> {
  /**
   * The database engine in which the records are stored. Implementations register against a specific engine.
   */
  @IsString()
  readonly engine!: string;

  /**
   * The object schema whose records are counted, with its binding for the engine.
   */
  @IsObject()
  readonly schema!: ObjectSchema;

  /**
   * The filters for which matching records are counted. The paths of conditions are made of the names of properties of
   * the schema, rather than of the columns or fields storing them.
   */
  @IsObject()
  readonly filters!: RecordFilters;
}
