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
  async _call(context: WorkspaceContext): Promise<void> {
    context.logger.info('🦺 Validating workspace configuration.');

    const validate = await this.buildValidator(context);

    if (this.projects) {
      await this.validateProjects(context, validate);
    } else {
      await this.validateContext(context, validate);
    }

    context.logger.info('✅ Configuration is valid.');
  }

  _supports(): boolean {
    return true;
  }

  /**
   * Builds the ajv validator from the composed configuration schema.
   *
   * @param context The {@link WorkspaceContext}.
   * @returns The compiled ajv validation function.
   */
  private async buildValidator(
    context: WorkspaceContext,
  ): Promise<ValidateFunction> {
    const schemaPaths = (
      await Promise.all(context.callAll(CausaListConfigurationSchemas, {}))
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
   * @param context The {@link WorkspaceContext}.
   * @param validate The compiled ajv validation function.
   */
  private async validateProjects(
    context: WorkspaceContext,
    validate: ValidateFunction,
  ): Promise<void> {
    const projectPaths = await context.listProjectPaths();

    for (const projectPath of projectPaths) {
      context.logger.info(
        `📂 Validating configuration for project in '${projectPath}'.`,
      );

      const projectContext = await context.clone({
        workingDirectory: projectPath,
        processors: null,
      });

      await this.validateContext(projectContext, validate);
    }
  }
}
