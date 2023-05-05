import { WorkspaceContext } from '@causa/workspace';
import { FunctionRegistry } from '@causa/workspace/function-registry';
import { EmulatorStart, EmulatorStartResult } from '../definitions/index.js';
import { createContext, createFunction } from '../utils.test.js';
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
  let functionRegistry: FunctionRegistry<WorkspaceContext>;

  beforeEach(() => {
    ({ context, functionRegistry } = createContext());
    functionRegistry.registerImplementations(Emulator1, Emulator2);
  });

  it('should call all EmulatorStart and return names', async () => {
    const fn = createFunction(EmulatorListForAll, {});

    const actualEmulators = await fn._call(context);

    expect(actualEmulators.sort()).toEqual(['emulator1', 'emulator2']);
  });
});
