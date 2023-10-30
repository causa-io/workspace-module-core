import { WorkspaceContext } from '@causa/workspace';
import { createContext } from '@causa/workspace/testing';
import 'jest-extended';
import { EmulatorStop, EmulatorStopMany } from '../../definitions/index.js';
import { EmulatorStopManyForAll } from './stop-many.js';

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

  beforeEach(() => {
    ({ context } = createContext({
      functions: [Emulator1, Emulator2, EmulatorStopManyForAll],
    }));
  });

  it('should return an empty result when there is no emulator to stop', async () => {
    const { context } = createContext({ functions: [EmulatorStopManyForAll] });

    const actualResult = await context.call(EmulatorStopMany, {
      emulators: [],
    });

    expect(actualResult).toBeEmpty();
  });

  it('should call all EmulatorStop and return names', async () => {
    const actualResult = await context.call(EmulatorStopMany, {
      emulators: [],
    });

    expect(actualResult.sort()).toEqual(['emulator1', 'emulator2']);
  });

  it('should only stop the specified emulator', async () => {
    const actualResult = await context.call(EmulatorStopMany, {
      emulators: ['emulator1'],
    });

    expect(actualResult).toEqual(['emulator1']);
  });

  it('should throw when the emulator cannot be found', async () => {
    const actualPromise = context.call(EmulatorStopMany, {
      emulators: ['🙅'],
    });

    await expect(actualPromise).rejects.toThrow(
      `No implementation found for emulator '🙅'.`,
    );
  });
});
