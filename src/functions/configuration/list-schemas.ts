import { BASE_CONFIGURATION_SCHEMA_PATH } from '@causa/workspace';
import { globby } from 'globby';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { CausaListConfigurationSchemas } from '../../definitions/index.js';

/**
 * The directory containing the configuration schemas provided by this module.
 */
const SCHEMAS_DIRECTORY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../configurations/schemas',
);

/**
 * Implements {@link CausaListConfigurationSchemas} for the core module.
 * Returns the paths to the configuration schemas bundled with this package.
 */
export class CausaListConfigurationSchemasForCore extends CausaListConfigurationSchemas {
  async _call(): Promise<string[]> {
    const moduleSchemas = await globby('*.yaml', {
      cwd: SCHEMAS_DIRECTORY,
      absolute: true,
    });

    return [BASE_CONFIGURATION_SCHEMA_PATH, ...moduleSchemas];
  }

  _supports(): boolean {
    return true;
  }
}
