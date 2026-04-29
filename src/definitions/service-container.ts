import { WorkspaceFunction } from '@causa/workspace';
import { AllowMissing } from '@causa/workspace/validation';
import { Transform } from 'class-transformer';
import { IsDate, IsInt, IsPositive, IsString } from 'class-validator';

/**
 * A single log entry returned by {@link ServiceContainerQueryLogs}.
 */
export type QueriedLogEntry = {
  /**
   * The time at which the log entry was emitted.
   */
  readonly timestamp: Date;

  /**
   * The payload of the log entry.
   */
  readonly message: any;
};

/**
 * Queries the log entries emitted by a deployed service container, restricted to a time range and an
 * implementation-defined `filter`.
 */
export abstract class ServiceContainerQueryLogs extends WorkspaceFunction<
  Promise<QueriedLogEntry[]>
> {
  /**
   * The name of the service container to query logs for.
   */
  @IsString()
  readonly service!: string;

  /**
   * The inclusive lower bound of the time range over which to look for log entries.
   */
  @AllowMissing()
  @Transform(({ value }) =>
    typeof value === 'string' ? new Date(value) : value,
  )
  @IsDate()
  readonly from?: Date;

  /**
   * The exclusive upper bound of the time range over which to look for log entries.
   */
  @AllowMissing()
  @Transform(({ value }) =>
    typeof value === 'string' ? new Date(value) : value,
  )
  @IsDate()
  readonly to?: Date;

  /**
   * An implementation-specific filter expression.
   */
  @AllowMissing()
  @IsString()
  readonly filter?: string;

  /**
   * The maximum number of log entries to return.
   */
  @AllowMissing()
  @IsInt()
  @IsPositive()
  readonly limit?: number;
}
