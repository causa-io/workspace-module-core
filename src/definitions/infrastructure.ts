import {
  CliArgument,
  CliCommand,
  CliOption,
  type ParentCliCommandDefinition,
} from '@causa/cli';
import { type ProcessorFunction, WorkspaceFunction } from '@causa/workspace';
import { AllowMissing } from '@causa/workspace/validation';
import { IsBoolean, IsString } from 'class-validator';

/**
 * The `infrastructure` parent command, grouping all commands related to managing a project defining Infrastructure as
 * Code.
 */
export const infrastructureCommandDefinition: ParentCliCommandDefinition = {
  name: 'infrastructure',
  description: 'Manages the lifecycle of infrastructure projects.',
};

/**
 * The result of a {@link InfrastructurePrepare} operation.
 */
export type PrepareResult = {
  /**
   * The reference to the prepared deployment (e.g. the path to a Terraform plan).
   */
  output: string;

  /**
   * If `false`, no change was detected with the current infrastructure state, and deploying is not necessary.
   */
  isDeploymentNeeded: boolean;
};

/**
 * Prepares a future deployment of the given infrastructure project.
 * For example, for a Terraform infrastructure project, this would create the plan for a deployment.
 * Returns a reference to the prepared deployment (e.g. the path to a Terraform plan).
 */
export abstract class InfrastructurePrepare extends WorkspaceFunction<
  Promise<PrepareResult>
> {
  /**
   * If `true` and changes have been prepared, they are printed to the standard output.
   * This should probably not be used when calling this function programmatically.
   */
  @IsBoolean()
  @AllowMissing()
  readonly print?: boolean;

  /**
   * If `true`, all infrastructure is destroyed instead of deploying changes.
   */
  @IsBoolean()
  @AllowMissing()
  readonly destroy?: boolean;

  /**
   * The location where the description of the future deployment (e.g. Terraform plan) should be written.
   */
  @IsString()
  @AllowMissing()
  readonly output?: string;
}

/**
 * Deploys the infrastructure defined by a previous call to the {@link InfrastructurePrepare} function.
 */
export abstract class InfrastructureDeploy extends WorkspaceFunction<
  Promise<void>
> {
  /**
   * The deployment changes to deploy (e.g. the path to a Terraform plan).
   */
  @IsString()
  readonly deployment!: string;
}

/**
 * The interface that should be implemented by {@link WorkspaceFunction}s meant to be used as processors before running
 * infrastructure operations.
 * The function should return a `ProcessorResult` that will be merged with the workspace configuration.
 */
export interface InfrastructureProcessor extends ProcessorFunction {
  /**
   * If `true`, the processor is called during the tear down, after the infrastructure operation has been performed.
   * The processor should clean up any temporary resource.
   */
  readonly tearDown?: boolean;
}

/**
 * Wraps the call to the {@link InfrastructurePrepare} workspace function by first calling processors listed in the
 * configuration `infrastructure.processors`.
 * This is the function exposed from the CLI and it should not be implemented by any other than the core module.
 * Returns a reference to the prepared deployment (e.g. the path to a Terraform plan).
 */
@CliCommand({
  parent: infrastructureCommandDefinition,
  name: 'prepare',
  description: `Prepares a future deployment of an infrastructure project.
After a deployment has been prepared, it can be deployed using the 'infrastructure deploy' command.`,
  summary: 'Prepares a future deployment of an infrastructure project.',
  outputFn: ({ output }) => console.log(output),
})
export abstract class InfrastructureProcessAndPrepare
  extends WorkspaceFunction<Promise<PrepareResult>>
  implements InfrastructurePrepare
{
  @IsBoolean()
  @AllowMissing()
  @CliOption({
    flags: '-p, --print',
    description:
      'If set and changes have been prepared, they are printed to the standard output.',
  })
  readonly print?: boolean;

  @IsBoolean()
  @AllowMissing()
  @CliOption({
    flags: '--destroy',
    description:
      'If set, all infrastructure is destroyed instead of deploying changes.',
  })
  readonly destroy?: boolean;

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
 * Wraps the call to the {@link InfrastructureDeploy} workspace function by first calling processors listed in the
 * configuration `infrastructure.processors`.
 * This is the function exposed from the CLI and it should not be implemented by any other than the core module.
 */
@CliCommand({
  parent: infrastructureCommandDefinition,
  name: 'deploy',
  description: `Deploys the infrastructure defined by the output of the 'infrastructure prepare' command.`,
  summary: `Deploys an infrastructure project.`,
})
export abstract class InfrastructureProcessAndDeploy
  extends WorkspaceFunction<Promise<void>>
  implements InfrastructureDeploy
{
  @IsString()
  @CliArgument({
    name: 'deployment',
    position: 0,
    description: `The output of the 'infrastructure prepare' command.`,
  })
  readonly deployment!: string;
}
