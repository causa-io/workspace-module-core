import { WorkspaceContext } from '@causa/workspace';
import { FunctionRegistry } from '@causa/workspace/function-registry';
import 'jest-extended';
import { EmulatorStop } from '../definitions/index.js';
import { createContext, createFunction } from '../utils.test.js';
import { EmulatorStopManyForAll } from './emulator-stop-many.js';

class Emulator1 extends EmulatorStop {
  async _call(): Promise<string> {
    return 'emulator1';
  }

  _supports(): boolean {
    return !this.name || this.name === 'emulator1';
  }
}

class Emulator2 extends EmulatorStop {
  async _call(): Promise<string> {
    return 'emulator2';
  }

  _supports(): boolean {
    return !this.name || this.name === 'emulator2';
  }
}

describe('EmulatorStopManyForAll', () => {
  let context: WorkspaceContext;
  let functionRegistry: FunctionRegistry<WorkspaceContext>;

  beforeEach(() => {
    ({ context, functionRegistry } = createContext());
    functionRegistry.registerImplementations(Emulator1, Emulator2);
  });

  it('should return an empty result when there is no emulator to stop', async () => {
    const { context } = createContext();
    const fn = createFunction(EmulatorStopManyForAll, { emulators: [] });

    const actualResult = await fn._call(context);

    expect(actualResult).toBeEmpty();
  });

  it('should call all EmulatorStop and return names', async () => {
    const fn = createFunction(EmulatorStopManyForAll, { emulators: [] });

    const actualResult = await fn._call(context);

    expect(actualResult.sort()).toEqual(['emulator1', 'emulator2']);
  });

  it('should only stop the specified emulator', async () => {
    const fn = createFunction(EmulatorStopManyForAll, {
      emulators: ['emulator1'],
    });

    const actualResult = await fn._call(context);

    expect(actualResult).toEqual(['emulator1']);
  });

  it('should throw when the emulator cannot be found', async () => {
    const fn = createFunction(EmulatorStopManyForAll, {
      emulators: ['🙅'],
    });

    const actualPromise = fn._call(context);

    await expect(actualPromise).rejects.toThrow(
      `No implementation found for emulator '🙅'.`,
    );
  });
});
