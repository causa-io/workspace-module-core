import { WorkspaceContext } from '@causa/workspace';
import {
  CAUSA_FOLDER,
  setUpCausaFolder,
} from '@causa/workspace/initialization';
import type { OpenAPIV3_1 } from '@scalar/openapi-types';
import { readFile, writeFile } from 'fs/promises';
import { dump } from 'js-yaml';
import { join } from 'path';
import {
  CausaListConfigurationSchemas,
  ProjectInit,
} from '../../definitions/index.js';

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
      // have been specified by a different process, e.g. the CLI.
      const modules = {
        ...currentDependencies,
        ...(context.get('causa.modules') ?? {}),
      };

      await setUpCausaFolder(context.rootPath, modules, context.logger);
    }

    await this.writeConfigurationSchema(context);

    context.logger.info('✅ Successfully initialized workspace dependencies.');
  }

  _supports(context: WorkspaceContext): boolean {
    return this.workspace || context.get('project.name') === undefined;
  }

  /**
   * Collects configuration schemas from all modules and writes a combined schema file in the Causa folder.
   *
   * @param context The {@link WorkspaceContext}.
   */
  private async writeConfigurationSchema(
    context: WorkspaceContext,
  ): Promise<void> {
    const schemaPaths = await Promise.all(
      context
        .getFunctionImplementations(CausaListConfigurationSchemas, {})
        .map((impl) => impl._call(context)),
    );

    const schema: OpenAPIV3_1.SchemaObject = {
      allOf: schemaPaths.flat().map(($ref) => ({ $ref })),
    };

    const schemaFile = join(
      context.rootPath,
      CAUSA_FOLDER,
      'configuration-schema.yaml',
    );
    const content = dump(schema);
    await writeFile(schemaFile, content);

    context.logger.info(`📝 Wrote configuration schema to '${schemaFile}'.`);
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
