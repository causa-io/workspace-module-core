import type { WorkspaceContext } from '@causa/workspace';
import { NoImplementationFoundError } from '@causa/workspace/function-registry';
import type { ModelConfiguration } from '../../configurations/index.js';
import {
  ModelGenerateCode,
  ModelRunCodeGenerator,
  type GeneratorsOutput,
} from '../../definitions/index.js';

/**
 * Implements the {@link ModelGenerateCode} function.
 * This should be the only implementation, as it only iterates over the configured code generators generically.
 */
export class ModelGenerateCodeForAll extends ModelGenerateCode {
  async _call(context: WorkspaceContext): Promise<GeneratorsOutput> {
    const generators =
      context
        .asConfiguration<ModelConfiguration>()
        .get('model.codeGenerators') ?? [];
    if (generators.length === 0) {
      return {};
    }

    const missingGenerators: string[] = [];
    const output: GeneratorsOutput = {};

    await Promise.all(
      generators.map(async (generatorAndConfiguration) => {
        const { generator, ...configuration } = generatorAndConfiguration;

        try {
          output[generator] = await context.call(ModelRunCodeGenerator, {
            generator,
            configuration,
          });
        } catch (error) {
          if (error instanceof NoImplementationFoundError) {
            missingGenerators.push(generator);
            return;
          }

          throw error;
        }
      }),
    );

    if (missingGenerators.length === generators.length) {
      throw new Error(
        `All referenced generators could not be found or do not match the current project configuration: ${missingGenerators.map((g) => `'${g}'`).join(', ')}.`,
      );
    }

    if (missingGenerators.length > 0) {
      context.logger.warn(
        `The following generators were not found or do not match the current project configuration: ${missingGenerators.map((g) => `'${g}'`).join(', ')}.`,
      );
    }

    return output;
  }

  _supports(): boolean {
    return true;
  }
}
