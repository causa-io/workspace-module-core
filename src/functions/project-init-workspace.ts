import { WorkspaceContext } from '@causa/workspace';
import {
  CAUSA_FOLDER,
  setUpCausaFolder,
} from '@causa/workspace/initialization';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { ProjectInit } from '../definitions/index.js';

/**
 * Implements {@link ProjectInit} for the Causa workspace, outside of any actual project.
 * This should be a no-op as being able to run this function means that the Causa folder is already initialized.
 * However, if the `force` option is provided, the Causa folder will be reinitialized.
 */
export class ProjectInitForWorkspace extends ProjectInit {
  async _call(context: WorkspaceContext): Promise<void> {
    if (this.force) {
      context.logger.info('🔥 Forcing reinstallation of Causa modules.');

      const currentDependencies = await this.readCurrentDependencies(context);
      // Merging the current dependencies allows keeping the ones that are not defined in the configuration, but might
      // have been specified by a different process, e.g. the CLI
      const modules = {
        ...currentDependencies,
        ...(context.get('causa.modules') ?? {}),
      };

      await setUpCausaFolder(context.rootPath, modules, context.logger);
    }

    context.logger.info('✅ Successfully initialized workspace dependencies.');
  }

  _supports(context: WorkspaceContext): boolean {
    return (
      context.get('project.name') === undefined &&
      context.get('project.type') === undefined &&
      context.get('project.language') === undefined
    );
  }

  /**
   * Parses the currently installed dependencies in the Causa folder from the `package.json` file.
   *
   * @param context The {@link WorkspaceContext}.
   * @returns The currently installed dependencies in the Causa folder, or an empty object if the package file cannot be
   *   read.
   */
  private async readCurrentDependencies(
    context: WorkspaceContext,
  ): Promise<Record<string, string>> {
    try {
      const causaDir = join(context.rootPath, CAUSA_FOLDER);
      const packageFile = join(causaDir, 'package.json');
      const packageJson = await readFile(packageFile);
      return JSON.parse(packageJson.toString()).dependencies;
    } catch (error) {
      context.logger.warn(
        `⚠️ Could not read the currently installed dependencies from the Causa folder: '${error}'.`,
      );

      return {};
    }
  }
}
