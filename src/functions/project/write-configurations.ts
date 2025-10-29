import {
  type ProcessorResult,
  WorkspaceContext,
  WorkspaceFunction,
} from '@causa/workspace';
import { CAUSA_FOLDER } from '@causa/workspace/initialization';
import { AllowMissing } from '@causa/workspace/validation';
import { IsBoolean } from 'class-validator';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import type { CausaConfiguration } from '../../configurations/index.js';
import type { InfrastructureProcessor } from '../../definitions/index.js';

/**
 * The default directory where project configurations are written, relative to the workspace root.
 */
const DEFAULT_PROJECT_CONFIGURATIONS_DIRECTORY = join(
  CAUSA_FOLDER,
  'project-configurations',
);

/**
 * A function that finds all projects in a Causa workspace and writes each project's configuration to a single file.
 * This function returns a partial configuration, such that it can be used as a processor.
 */
export class ProjectWriteConfigurations
  extends WorkspaceFunction<Promise<ProcessorResult>>
  implements InfrastructureProcessor
{
  @IsBoolean()
  @AllowMissing()
  tearDown?: boolean | undefined;

  /**
   * Returns the path to the directory where project configurations should be written.
   * It is either fetched from the workspace configuration, or the default value is used.
   *
   * @param context The {@link WorkspaceContext}.
   * @returns The path to the directory where project configurations should be written.
   */
  private getConfigurationsDirectory(context: WorkspaceContext): string {
    return (
      context
        .asConfiguration<CausaConfiguration>()
        .get('causa.projectConfigurationsDirectory') ??
      DEFAULT_PROJECT_CONFIGURATIONS_DIRECTORY
    );
  }

  async _call(context: WorkspaceContext): Promise<ProcessorResult> {
    const projectConfigurationsDirectory =
      this.getConfigurationsDirectory(context);
    const absoluteDirectory = resolve(
      context.rootPath,
      projectConfigurationsDirectory,
    );
    await rm(absoluteDirectory, { recursive: true, force: true });

    if (this.tearDown) {
      context.logger.debug(
        `🔧 Tore down project configurations directory '${absoluteDirectory}'.`,
      );
      return { configuration: {} };
    }

    context.logger.info('🔧 Rendering and writing project configurations.');

    const projectPaths = await context.listProjectPaths();

    await mkdir(absoluteDirectory, { recursive: true });

    await Promise.all(
      projectPaths.map(async (projectPath) => {
        context.logger.debug(
          `📂 Rendering configuration for project in directory '${projectPath}'.`,
        );

        const projectContext = await context.clone({
          workingDirectory: projectPath,
          // Processors are specific to a project (usually only loaded during specific operations of infrastructure
          // projects) and should not be copied.
          processors: null,
        });

        const projectConfiguration = await projectContext.getAndRender({
          renderSecrets: false,
        });

        const projectName = projectConfiguration.project?.name;
        const configurationFile = join(
          absoluteDirectory,
          `${projectName}.json`,
        );

        context.logger.debug(
          `📂 Writing configuration for project '${projectName}' to file '${configurationFile}'.`,
        );
        await writeFile(
          configurationFile,
          JSON.stringify(projectConfiguration),
        );
      }),
    );

    context.logger.debug(
      `🔧 Wrote project configurations in '${absoluteDirectory}'.`,
    );

    return { configuration: { causa: { projectConfigurationsDirectory } } };
  }

  _supports(): boolean {
    return true;
  }
}
