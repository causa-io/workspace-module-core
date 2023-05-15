import { WorkspaceContext } from '@causa/workspace';
import { createContext } from '@causa/workspace/testing';
import {
  EmulatorList,
  EmulatorStart,
  EmulatorStartResult,
} from '../definitions/index.js';
import { EmulatorListForAll } from './emulator-list.js';

class Emulator1 extends EmulatorStart {
  async _call(): Promise<EmulatorStartResult> {
    if (!this.dryRun) {
      throw new Error('Should be called with dryRun.');
    }

    return {
      name: 'emulator1',
      configuration: {},
    };
  }

  _supports(): boolean {
    return true;
  }
}

class Emulator2 extends EmulatorStart {
  async _call(): Promise<EmulatorStartResult> {
    if (!this.dryRun) {
      throw new Error('Should be called with dryRun.');
    }

    return {
      name: 'emulator2',
      configuration: {},
    };
  }

  _supports(): boolean {
    return true;
  }
}

describe('EmulatorListForAll', () => {
  let context: WorkspaceContext;

  beforeEach(() => {
    ({ context } = createContext({
      functions: [Emulator1, Emulator2, EmulatorListForAll],
    }));
  });

  it('should call all EmulatorStart and return names', async () => {
    const actualEmulators = await context.call(EmulatorList, {});

    expect(actualEmulators.sort()).toEqual(['emulator1', 'emulator2']);
  });
});
