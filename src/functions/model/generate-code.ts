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
  async _call(): Promise<GeneratorsOutput> {
    const generators =
      this._context
        .asConfiguration<ModelConfiguration>()
        .get('model.codeGenerators') ?? [];
    if (generators.length === 0) {
      return {};
    }

    const missingGenerators: string[] = [];
    const output: GeneratorsOutput = {};

    for (const generatorAndConfiguration of generators) {
      const { generator, ...configuration } = generatorAndConfiguration;

      try {
        this._context.logger.info(
          `🔨 Running code generator '${generator}'...`,
        );

        output[generator] = await this._context.call(ModelRunCodeGenerator, {
          generator,
          configuration,
          previousGeneratorsOutput: output,
        });
      } catch (error) {
        if (error instanceof NoImplementationFoundError) {
          missingGenerators.push(generator);
          continue;
        }

        throw error;
      }
    }

    if (missingGenerators.length === generators.length) {
      throw new Error(
        `All referenced generators could not be found or do not match the current project configuration: ${missingGenerators.map((g) => `'${g}'`).join(', ')}.`,
      );
    }

    if (missingGenerators.length > 0) {
      this._context.logger.warn(
        `The following generators were not found or do not match the current project configuration: ${missingGenerators.map((g) => `'${g}'`).join(', ')}.`,
      );
    }

    this._context.logger.info('✅ Code generation completed successfully.');

    return output;
  }

  _supports(): boolean {
    return true;
  }
}
