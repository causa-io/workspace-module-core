import { WorkspaceContext } from '@causa/workspace';
import { FunctionRegistry } from '@causa/workspace/function-registry';
import { EmulatorStart, EmulatorStartResult } from '../definitions/index.js';
import { createContext, createFunction } from '../utils.test.js';
import { EmulatorStartManyForAll } from './emulator-start-many.js';

class Emulator1 extends EmulatorStart {
  async _call(): Promise<EmulatorStartResult> {
    if (this.dryRun) {
      throw new Error('Should not be called with dryRun.');
    }

    return {
      name: 'emulator1',
      configuration: { config1: '🔧' },
    };
  }

  _supports(): boolean {
    return !this.name || this.name === 'emulator1';
  }
}

class Emulator2 extends EmulatorStart {
  async _call(): Promise<EmulatorStartResult> {
    if (this.dryRun) {
      throw new Error('Should not be called with dryRun.');
    }

    return {
      name: 'emulator2',
      configuration: { config2: '🗃️' },
    };
  }

  _supports(): boolean {
    return !this.name || this.name === 'emulator2';
  }
}

describe('EmulatorStartManyForAll', () => {
  let context: WorkspaceContext;
  let functionRegistry: FunctionRegistry<WorkspaceContext>;

  beforeEach(() => {
    ({ context, functionRegistry } = createContext());
    functionRegistry.registerImplementations(Emulator1, Emulator2);
  });

  it('should return an empty result when there is no emulator to run', async () => {
    const { context } = createContext();
    const fn = createFunction(EmulatorStartManyForAll, { emulators: [] });

    const actualResult = await fn._call(context);

    expect(actualResult).toEqual({ emulatorNames: [], configuration: {} });
  });

  it('should call all EmulatorStart and return names and configuration', async () => {
    const fn = createFunction(EmulatorStartManyForAll, { emulators: [] });

    const actualResult = await fn._call(context);

    expect(actualResult.emulatorNames.sort()).toEqual([
      'emulator1',
      'emulator2',
    ]);
    expect(actualResult.configuration).toEqual({
      config1: '🔧',
      config2: '🗃️',
    });
  });

  it('should only call the specified emulator', async () => {
    const fn = createFunction(EmulatorStartManyForAll, {
      emulators: ['emulator1'],
    });

    const actualResult = await fn._call(context);

    expect(actualResult.emulatorNames).toEqual(['emulator1']);
    expect(actualResult.configuration).toEqual({ config1: '🔧' });
  });

  it('should throw when the emulator cannot be found', async () => {
    const fn = createFunction(EmulatorStartManyForAll, {
      emulators: ['🙅'],
    });

    const actualPromise = fn._call(context);

    await expect(actualPromise).rejects.toThrow(
      `No implementation found for emulator '🙅'.`,
    );
  });
});
