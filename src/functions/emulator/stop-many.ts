import { WorkspaceContext } from '@causa/workspace';
import { NoImplementationFoundError } from '@causa/workspace/function-registry';
import { EmulatorStop, EmulatorStopMany } from '../../definitions/index.js';

/**
 * Implements the {@link EmulatorStopMany} function by calling {@link EmulatorStop} on all or selected emulators.
 * This should be the only implementation of this function.
 */
export class EmulatorStopManyForAll extends EmulatorStopMany {
  async _call(context: WorkspaceContext): Promise<string[]> {
    let emulatorStops: EmulatorStop[];

    if (this.emulators.length > 0) {
      emulatorStops = this.emulators.map((name) => {
        try {
          return context.getFunctionImplementation(EmulatorStop, { name });
        } catch (error) {
          if (error instanceof NoImplementationFoundError) {
            throw new Error(`No implementation found for emulator '${name}'.`);
          }

          throw error;
        }
      });
    } else {
      emulatorStops = context.getFunctionImplementations(EmulatorStop, {});

      if (emulatorStops.length === 0) {
        context.logger.info('💤 No emulator to stop.');
        return [];
      }
    }

    const emulatorNames = await Promise.all(
      emulatorStops.map((emulatorStop) => emulatorStop._call(context)),
    );

    return emulatorNames;
  }

  _supports(): boolean {
    return true;
  }
}
