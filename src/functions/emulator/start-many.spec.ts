import { WorkspaceContext } from '@causa/workspace';
import { createContext } from '@causa/workspace/testing';
import { jest } from '@jest/globals';
import 'jest-extended';
import type { LogFn } from 'pino';
import {
  EmulatorStart,
  EmulatorStartMany,
  type EmulatorStartResult,
} from '../../definitions/index.js';
import { EmulatorStartManyForAll } from './start-many.js';

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
  let infoLogSpy: jest.SpiedFunction<LogFn>;

  beforeEach(() => {
    ({ context } = createContext({
      functions: [Emulator1, Emulator2, EmulatorStartManyForAll],
    }));
    infoLogSpy = jest.spyOn(context.logger, 'info');
  });

  it('should return an empty result when there is no emulator to run', async () => {
    const { context } = createContext({ functions: [EmulatorStartManyForAll] });

    const actualResult = await context.call(EmulatorStartMany, {
      emulators: [],
    });

    expect(actualResult).toEqual({ emulatorNames: [], configuration: {} });
    expect(infoLogSpy.mock.calls.map((c) => c[0]).join(' ')).not.toContain(
      'Configuration',
    );
  });

  it('should call all EmulatorStart and return names and configuration', async () => {
    const actualResult = await context.call(EmulatorStartMany, {
      emulators: [],
    });

    expect(actualResult.emulatorNames.sort()).toEqual([
      'emulator1',
      'emulator2',
    ]);
    expect(actualResult.configuration).toEqual({
      config1: '🔧',
      config2: '🗃️',
    });
    expect(infoLogSpy.mock.calls.map((c) => c[0]).join(' ')).toContain(
      'config1=🔧\nconfig2=🗃️',
    );
  });

  it('should only call the specified emulator', async () => {
    const actualResult = await context.call(EmulatorStartMany, {
      emulators: ['emulator1'],
    });

    expect(actualResult.emulatorNames).toEqual(['emulator1']);
    expect(actualResult.configuration).toEqual({ config1: '🔧' });
    expect(infoLogSpy.mock.calls.map((c) => c[0]).join(' ')).toContain(
      'config1=🔧',
    );
  });

  it('should throw when the emulator cannot be found', async () => {
    const actualPromise = context.call(EmulatorStartMany, {
      emulators: ['🙅'],
    });

    await expect(actualPromise).rejects.toThrow(
      `No implementation found for emulator '🙅'.`,
    );
  });
});
