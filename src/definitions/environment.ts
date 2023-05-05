import {
  CliArgument,
  CliCommand,
  CliOption,
  ParentCliCommandDefinition,
} from '@causa/cli';
import { WorkspaceFunction } from '@causa/workspace';
import { AllowMissing } from '@causa/workspace/validation';
import { IsBoolean, IsString } from 'class-validator';
import { PrepareResult } from './infrastructure.js';

/**
 * The `environment` parent command, grouping all commands related to managing deployment environments.
 */
export const environmentCommandDefinition: ParentCliCommandDefinition = {
  name: 'environment',
  description: 'Manages deployment environments.',
};

/**
 * Prepares a future deployment of the environment infrastructure project, defined in the
 * `infrastructure.environmentProject` configuration.
 * It is simply a passthrough to the `InfrastructureProcessAndPrepare` function.
 */
@CliCommand({
  parent: environmentCommandDefinition,
  name: 'prepare',
  description: `Prepares a future deployment of the environment.
After a deployment has been prepared, it can be deployed using the 'environment deploy' command.`,
  summary: 'Prepares a future deployment of the environment.',
  outputFn: ({ output }) => console.log(output),
})
export abstract class EnvironmentPrepare extends WorkspaceFunction<
  Promise<PrepareResult>
> {
  /**
   * If `true` and changes have been prepared, they are printed to the standard output.
   * This should probably not be used when calling this function programmatically.
   */
  @IsBoolean()
  @AllowMissing()
  @CliOption({
    flags: '-p, --print',
    description:
      'If set and changes have been prepared, they are printed to the standard output.',
  })
  readonly print?: boolean;

  /**
   * The location where the description of the future deployment (e.g. Terraform plan) should be written.
   */
  @IsString()
  @AllowMissing()
  @CliOption({
    flags: '-o, --output <output>',
    description:
      'The location where the description of the future deployment should be written.',
  })
  readonly output?: string;
}

/**
 * Deploys the infrastructure defined by a previous call to the {@link EnvironmentPrepare} function.
 * It is simply a passthrough to the `InfrastructureProcessAndDeploy` function.
 */
@CliCommand({
  parent: environmentCommandDefinition,
  name: 'deploy',
  description: `Deploys the infrastructure defined by the output of the 'environment prepare' command.`,
  summary: `Deploys an environment.`,
})
export abstract class EnvironmentDeploy extends WorkspaceFunction<
  Promise<void>
> {
  /**
   * The deployment changes to deploy (e.g. the path to a Terraform plan).
   */
  @IsString()
  @CliArgument({
    name: 'deployment',
    position: 0,
    description: `The output of the 'environment prepare' command.`,
  })
  readonly deployment!: string;
}
