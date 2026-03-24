import {
  CliCommand,
  CliOption,
  type ParentCliCommandDefinition,
} from '@causa/cli';
import { WorkspaceFunction } from '@causa/workspace';
import { AllowMissing } from '@causa/workspace/validation';
import { IsBoolean } from 'class-validator';

/**
 * Lists absolute paths to configuration JSON Schema files provided by a module.
 * Each module should implement this function to return the paths to its own configuration schemas.
 * All implementations are called during workspace initialization to produce a combined schema.
 */
export abstract class CausaListConfigurationSchemas extends WorkspaceFunction<
  Promise<string[]>
> {}

/**
 * The `configuration` parent command, grouping all commands related to managing and validating workspace configuration.
 */
export const configurationCommandDefinition: ParentCliCommandDefinition = {
  name: 'configuration',
  description: 'Manages and validates workspace configuration.',
  aliases: ['conf'],
};

/**
 * A single validation error found when checking the workspace configuration against the JSON Schema.
 */
export type ConfigurationValidationError = {
  /**
   * The path in the configuration where the error was found, as a JSON Pointer (e.g. `/project/type`).
   */
  readonly path: string;

  /**
   * A human-readable description of the validation error.
   */
  readonly message: string;
};

/**
 * An error thrown when configuration validation fails.
 */
export class ConfigurationCheckError extends Error {
  constructor(
    /**
     * The list of validation errors found in the configuration.
     */
    readonly errors: ConfigurationValidationError[],
  ) {
    super(
      `Configuration validation failed with ${errors.length} error(s):\n${errors.map((e) => `  - ${e.path}: ${e.message}`).join('\n')}`,
    );
  }
}

/**
 * Validates the workspace configuration against the JSON Schema produced by combining all module schemas.
 * Throws a {@link ConfigurationCheckError} if validation fails.
 */
@CliCommand({
  parent: configurationCommandDefinition,
  name: 'check',
  description: 'Validates the workspace configuration.',
  summary: 'Validates the workspace configuration.',
})
export abstract class ConfigurationCheck extends WorkspaceFunction<
  Promise<void>
> {
  /**
   * When set, renders templates in the configuration before validating.
   * Secrets are not rendered.
   */
  @CliOption({
    flags: '-r, --render',
    description:
      'Renders templates in the configuration before validating. Secrets are not rendered.',
  })
  @IsBoolean()
  @AllowMissing()
  readonly render?: boolean;

  /**
   * When set, validates the configuration for each project in the workspace.
   */
  @CliOption({
    flags: '-p, --projects',
    description:
      'Validates the configuration for each project in the workspace.',
  })
  @IsBoolean()
  @AllowMissing()
  readonly projects?: boolean;
}
