import {
  CliCommand,
  CliOption,
  type ParentCliCommandDefinition,
} from '@causa/cli';
import { WorkspaceFunction } from '@causa/workspace';
import { AllowMissing } from '@causa/workspace/validation';
import { IsBoolean, IsString } from 'class-validator';

/**
 * The `openapi` parent command, grouping all commands related to OpenAPI specifications.
 */
export const openApiCommandDefinition: ParentCliCommandDefinition = {
  name: 'openapi',
  description: 'Tools for OpenAPI specifications.',
};

/**
 * Generates the OpenAPI specification for the service or workspace.
 * When run at the workspace level, the specifications for all services are generated and merged.
 * Returns the path to the generated specification, or the specification itself if the `returnSpecification` option is
 * set.
 */
@CliCommand({
  parent: openApiCommandDefinition,
  name: 'generateSpecification',
  aliases: ['genSpec'],
  description: `Generates the OpenAPI specification for the service or workspace.
When run at the workspace level, the specifications for all services are generated and merged.`,
  summary: 'Generates the OpenAPI specification for the service or workspace.',
  outputFn: console.log,
})
export abstract class OpenApiGenerateSpecification extends WorkspaceFunction<
  Promise<string>
> {
  /**
   * The location where the OpenAPI specification should be written.
   */
  @CliOption({
    flags: '-o, --output <output>',
    description: `The location where the OpenAPI specification should be written.`,
  })
  @IsString()
  @AllowMissing()
  readonly output?: string;

  /**
   * Whether the function should return the specification instead of writing it to a file.
   * This is not accessible from the command line, but is used when merging specifications.
   * Project-specific implementations should support this option.
   */
  @IsBoolean()
  @AllowMissing()
  readonly returnSpecification?: boolean;
}
