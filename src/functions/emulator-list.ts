import { WorkspaceContext } from '@causa/workspace';
import { EmulatorList, EmulatorStart } from '../definitions/index.js';

/**
 * Implements the {@link EmulatorList} function by calling {@link EmulatorStart} with the `dryRun` option for all
 * emulators.
 * This should be the only implementation of this function.
 */
export class EmulatorListForAll extends EmulatorList {
  async _call(context: WorkspaceContext): Promise<string[]> {
    return await Promise.all(
      context
        .getFunctionImplementations(EmulatorStart, { dryRun: true })
        .map(async (emulatorStart) => {
          const result = await emulatorStart._call(context);
          return result.name;
        }),
    );
  }

  _supports(): boolean {
    return true;
  }
}
