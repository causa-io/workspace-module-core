import { WorkspaceContext } from '@causa/workspace';
import { Ajv, type ValidateFunction } from 'ajv';
import { readFile } from 'fs/promises';
import { load } from 'js-yaml';
import { composeConfigurationSchema } from '../../configuration-schema.js';
import {
  CausaListConfigurationSchemas,
  ConfigurationCheck,
  ConfigurationCheckError,
  type ConfigurationValidationError,
} from '../../definitions/index.js';

/**
 * Implements {@link ConfigurationCheck} by validating the configuration against the composed JSON Schema from all
 * modules, using ajv.
 */
export class ConfigurationCheckForAll extends ConfigurationCheck {
  async _call(): Promise<void> {
    this._context.logger.info('🦺 Validating workspace configuration.');

    const validate = await this.buildValidator();

    if (this.projects) {
      await this.validateProjects(validate);
    } else {
      await this.validateContext(this._context, validate);
    }

    this._context.logger.info('✅ Configuration is valid.');
  }

  _supports(): boolean {
    return true;
  }

  /**
   * Builds the ajv validator from the composed configuration schema.
   *
   * @returns The compiled ajv validation function.
   */
  private async buildValidator(): Promise<ValidateFunction> {
    const schemaPaths = (
      await Promise.all(
        this._context.callAll(CausaListConfigurationSchemas, {}),
      )
    ).flat();
    const moduleSchemas = await Promise.all(
      schemaPaths.map(async (path) => {
        const content = await readFile(path, 'utf-8');
        return load(content) as Record<string, unknown>;
      }),
    );

    const ajv = new Ajv({ allErrors: true, strict: false });
    const schemaRefs = moduleSchemas.map((schema, index) => {
      const $id = `module-schema-${index}`;
      ajv.addSchema({ ...schema, $id });
      return { $ref: $id };
    });
    const schema = composeConfigurationSchema(schemaRefs);
    return ajv.compile(schema);
  }

  /**
   * Retrieves the configuration for the given context and validates it.
   *
   * @param context The {@link WorkspaceContext}.
   * @param validate The compiled ajv validation function.
   */
  private async validateContext(
    context: WorkspaceContext,
    validate: ValidateFunction,
  ): Promise<void> {
    const configuration = this.render
      ? await context.getAndRender({ renderSecrets: false })
      : context.get({ unsafe: true });

    const valid = validate(configuration);
    if (!valid && validate.errors) {
      const errors: ConfigurationValidationError[] = validate.errors.map(
        (error) => ({
          path: error.instancePath,
          message: error.message ?? 'Unknown validation error.',
        }),
      );

      throw new ConfigurationCheckError(errors);
    }
  }

  /**
   * Validates the configuration for each project in the workspace.
   *
   * @param validate The compiled ajv validation function.
   */
  private async validateProjects(validate: ValidateFunction): Promise<void> {
    const projectPaths = await this._context.listProjectPaths();

    for (const projectPath of projectPaths) {
      this._context.logger.info(
        `📂 Validating configuration for project in '${projectPath}'.`,
      );

      const projectContext = await this._context.clone({
        workingDirectory: projectPath,
        processors: null,
      });

      await this.validateContext(projectContext, validate);
    }
  }
}
