import { WorkspaceFunction } from '@causa/workspace';
import { AllowMissing } from '@causa/workspace/validation';
import { IsString } from 'class-validator';

/**
 * Queries a database for records and returns the matching rows or documents.
 */
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
