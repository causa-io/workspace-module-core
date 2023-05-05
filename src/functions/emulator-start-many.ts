import { WorkspaceContext } from '@causa/workspace';
import { NoImplementationFoundError } from '@causa/workspace/function-registry';
import {
  EmulatorStart,
  EmulatorStartMany,
  EmulatorStartManyResult,
} from '../definitions/index.js';

/**
 * Implements the {@link EmulatorStartMany} function by calling {@link EmulatorStart} on all or selected emulators.
 * This should be the only implementation of this function.
 */
export class EmulatorStartManyForAll extends EmulatorStartMany {
  async _call(context: WorkspaceContext): Promise<EmulatorStartManyResult> {
    let emulatorStarts: EmulatorStart[];
    let result: EmulatorStartManyResult = {
      emulatorNames: [],
      configuration: {},
    };

    if (this.emulators.length > 0) {
      emulatorStarts = this.emulators.map((name) => {
        try {
          return context.getFunctionImplementation(EmulatorStart, { name });
        } catch (error) {
          if (error instanceof NoImplementationFoundError) {
            throw new Error(`No implementation found for emulator '${name}'.`);
          }

          throw error;
        }
      });
    } else {
      emulatorStarts = context.getFunctionImplementations(EmulatorStart, {});

      if (emulatorStarts.length === 0) {
        context.logger.info('💤 No emulator to start.');
        return result;
      }
    }

    const emulatorResults = await Promise.all(
      emulatorStarts.map((emulatorStart) => emulatorStart._call(context)),
    );

    return emulatorResults.reduce((results, result) => {
      results.emulatorNames.push(result.name);
      results.configuration = {
        ...results.configuration,
        ...result.configuration,
      };
      return results;
    }, result);
  }

  _supports(): boolean {
    return true;
  }
}
