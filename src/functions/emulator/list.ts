import { EmulatorList, EmulatorStart } from '../../definitions/index.js';

/**
 * Implements the {@link EmulatorList} function by calling {@link EmulatorStart} with the `dryRun` option for all
 * emulators.
 * This should be the only implementation of this function.
 */
export class EmulatorListForAll extends EmulatorList {
  async _call(): Promise<string[]> {
    const results = await Promise.all(
      this._context.callAll(EmulatorStart, { dryRun: true }),
    );
    return results.map((r) => r.name);
  }

  _supports(): boolean {
    return true;
  }
}
