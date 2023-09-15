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
    const result: EmulatorStartManyResult = {
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
    result.emulatorNames = emulatorResults.map((r) => r.name);
    result.configuration = Object.assign(
      {},
      ...emulatorResults.map((r) => r.configuration),
    );

    if (Object.keys(result.configuration).length > 0) {
      const confStr = Object.entries(result.configuration)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');
      context.logger.info(`🔧 Configuration for emulators:\n${confStr}`);
    }

    return result;
  }

  _supports(): boolean {
    return true;
  }
}
