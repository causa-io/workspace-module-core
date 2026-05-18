import {
  CAUSA_FOLDER,
  setUpCausaFolder,
} from '@causa/workspace/initialization';
import { readFile, writeFile } from 'fs/promises';
import { stringify } from 'yaml';
import { join } from 'path';
import { composeConfigurationSchema } from '../../configuration-schema.js';
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
  async _call(): Promise<void> {
    if (this.force) {
      this._context.logger.info('🔥 Forcing reinstallation of Causa modules.');

      const currentDependencies = await this.readCurrentDependencies();
      // Merging the current dependencies allows keeping the ones that are not defined in the configuration, but might
      // have been specified by a different process, e.g. the CLI.
      const modules = {
        ...currentDependencies,
        ...(this._context.get('causa.modules') ?? {}),
      };

      await setUpCausaFolder(
        this._context.rootPath,
        modules,
        this._context.logger,
      );

      this._context.logger.info(
        '✅ Successfully initialized workspace dependencies.',
      );
      this._context.logger.warn(
        `⚠️ Rerun initialization without force to complete the initialization using the new modules.`,
      );

      return;
    }

    await this.writeConfigurationSchema();
  }

  _supports(): boolean {
    return this.workspace || this._context.get('project.name') === undefined;
  }

  /**
   * Collects configuration schemas from all modules and writes a combined schema file in the Causa folder.
   */
  private async writeConfigurationSchema(): Promise<void> {
    const schemaPaths = await Promise.all(
      this._context.callAll(CausaListConfigurationSchemas, {}),
    );
    const schemaFile = join(
      this._context.rootPath,
      CAUSA_FOLDER,
      'configuration-schema.yaml',
    );
    const schema = {
      $id: schemaFile,
      ...composeConfigurationSchema(
        schemaPaths.flat().map(($ref) => ({ $ref })),
      ),
    };

    const content = stringify(schema);
    await writeFile(schemaFile, content);

    this._context.logger.info(
      `📝 Wrote configuration schema to '${schemaFile}'.`,
    );
  }

  /**
   * Parses the currently installed dependencies in the Causa folder from the `package.json` file.
   *
   * @returns The currently installed dependencies in the Causa folder, or an empty object if the package file cannot be
   *   read.
   */
  private async readCurrentDependencies(): Promise<Record<string, string>> {
    try {
      const causaDir = join(this._context.rootPath, CAUSA_FOLDER);
      const packageFile = join(causaDir, 'package.json');
      const packageJson = await readFile(packageFile);
      return JSON.parse(packageJson.toString()).dependencies;
    } catch (error) {
      this._context.logger.warn(
        `⚠️ Could not read the currently installed dependencies from the Causa folder: '${error}'.`,
      );

      return {};
    }
  }
}
