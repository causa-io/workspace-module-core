import {
  CliArgument,
  CliCommand,
  CliOption,
  type ParentCliCommandDefinition,
} from '@causa/cli';
import { WorkspaceFunction } from '@causa/workspace';
import { AllowMissing } from '@causa/workspace/validation';
import { Transform } from 'class-transformer';
import { IsObject, IsString } from 'class-validator';

export {
  RetryPolicy,
  Scenario,
  ScenarioInput,
  ScenarioStep,
  StepCall,
  StepExpectation,
} from '../scenarios/index.js';

/**
 * The status of a step during or after a scenario run.
 *
 * - `pending`: the step has not yet started, either because its dependencies are not ready or because the scheduler has
 *   not picked it up yet.
 * - `running`: the step's call has started and the step is currently executing (including any retries).
 * - `succeeded`: the step's call returned successfully and all expectations passed.
 * - `failed`: the step's call threw an error or an expectation did not match.
 * - `skipped`: the step was not run, because the scenario was aborted before it could be reached.
 */
export type ScenarioStepStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped';

/**
 * The outcome of a single step within a scenario run.
 */
export type ScenarioStepRun = {
  /**
   * The status of the step.
   */
  readonly status: ScenarioStepStatus;

  /**
   * The output returned by the step's call. Only present for `succeeded` steps.
   */
  readonly output?: any;

  /**
   * The error message produced by the step's call. Only present for `failed` steps.
   */
  readonly error?: string;

  /**
   * The time at which the step's call started. Not present for `skipped` steps.
   */
  readonly startedAt?: Date;

  /**
   * The time at which the step's call ended. Not present for `skipped` steps.
   */
  readonly endedAt?: Date;

  /**
   * The number of retries performed for the step.
   */
  readonly numRetries: number;
};

/**
 * The full outcome of a scenario run.
 *
 * `running` is reported by progress callbacks while the run is still in flight; the value returned (or thrown) by
 * `ScenarioRun` always uses `succeeded` or `failed`.
 */
export type ScenarioRunSnapshot = {
  /**
   * The overall status of the scenario.
   */
  readonly status: 'running' | 'succeeded' | 'failed';

  /**
   * The outcome of each step, keyed by step ID.
   */
  readonly steps: Record<string, ScenarioStepRun>;
};

/**
 * An error thrown when a scenario run fails because at least one step failed.
 *
 * Carries the partial {@link ScenarioRunSnapshot} that was collected before the run was aborted.
 */
export class ScenarioFailedError extends Error {
  constructor(readonly result: ScenarioRunSnapshot) {
    super('Scenario run failed.');
  }
}

/**
 * The `scenario` parent command, grouping all commands related to managing scenarios.
 */
export const scenarioCommandDefinition: ParentCliCommandDefinition = {
  name: 'scenario',
  description: 'Manages and runs scenarios.',
};

/**
 * Loads and runs a scenario file.
 *
 * Steps are executed in dependency order, with steps that do not depend on each other run in parallel.
 */
@CliCommand({
  parent: scenarioCommandDefinition,
  name: 'run',
  description: 'Loads and runs a scenario file.',
  summary: 'Runs a scenario file.',
})
export abstract class ScenarioRun extends WorkspaceFunction<
  Promise<ScenarioRunSnapshot>
> {
  /**
   * The path to the scenario YAML file. Relative paths are resolved from the workspace root.
   */
  @CliArgument({
    name: '<path>',
    position: 0,
    description:
      'The path to the scenario YAML file. Relative paths are resolved from the workspace root.',
  })
  @IsString()
  readonly path!: string;

  /**
   * The values for the scenario's declared inputs, keyed by input name.
   *
   * For inputs not provided here, the scenario's declared `default` is used. Inputs without a default and not provided
   * cause the scenario to fail.
   */
  @CliOption({
    flags: '-i, --inputs <inputs>',
    description:
      'A JSON-encoded object providing values for the scenario inputs.',
  })
  @AllowMissing()
  @Transform(({ value }) =>
    typeof value === 'string' ? JSON.parse(value) : value,
  )
  @IsObject()
  readonly inputs?: Record<string, any>;

  /**
   * Optional path (relative to the workspace root, or absolute) to a YAML file where the final
   * {@link ScenarioRunSnapshot} is written when the run completes (whether it succeeds or fails).
   */
  @CliOption({
    flags: '-o, --output <output>',
    description:
      'Path to a YAML file where the scenario result is written when the run completes.',
  })
  @AllowMissing()
  @IsString()
  readonly output?: string;

  /**
   * Optional callback invoked every time the scenario state changes (each step transition, plus a final emit when the
   * run completes). Receives a snapshot of the full {@link ScenarioRunSnapshot}.
   */
  @AllowMissing()
  readonly onStepUpdate?: (result: ScenarioRunSnapshot) => void;
}
