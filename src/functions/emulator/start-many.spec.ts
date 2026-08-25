import { WorkspaceContext } from '@causa/workspace';
import { CAUSA_FOLDER } from '@causa/workspace/initialization';
import { createContext } from '@causa/workspace/testing';
import { jest } from '@jest/globals';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import 'jest-extended';
import { tmpdir } from 'os';
import { join } from 'path';
import type { LogFn } from 'pino';
import {
  EmulatorStart,
  EmulatorStartMany,
  type EmulatorStartResult,
} from '../../definitions/index.js';
import {
  EmulatorStartManyForAll,
  InvalidEmulatorConfigurationEntryError,
} from './start-many.js';

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

class InvalidConfigurationEmulator extends EmulatorStart {
  async _call(): Promise<EmulatorStartResult> {
    return {
      name: 'invalidEmulator',
      configuration: { config3: 'has a " quote' },
    };
  }

  _supports(): boolean {
    return !this.name || this.name === 'invalidEmulator';
  }
}

describe('EmulatorStartManyForAll', () => {
  let rootPath: string;
  let context: WorkspaceContext;
  let infoLogSpy: jest.SpiedFunction<LogFn>;

  beforeEach(async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'causa-tests-'));
    ({ context } = createContext({
      rootPath,
      functions: [Emulator1, Emulator2, EmulatorStartManyForAll],
    }));
    infoLogSpy = jest.spyOn(context.logger, 'info');
  });

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true });
  });

  async function readEnvironmentFile(
    relativePath = join(CAUSA_FOLDER, 'emulators.env'),
  ): Promise<string | null> {
    try {
      return await readFile(join(rootPath, relativePath), 'utf8');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }

      throw error;
    }
  }

  async function seedEnvironmentFile(content: string): Promise<void> {
    await mkdir(join(rootPath, CAUSA_FOLDER), { recursive: true });
    await writeFile(join(rootPath, CAUSA_FOLDER, 'emulators.env'), content);
  }

  it('should return an empty result when there is no emulator to run', async () => {
    ({ context } = createContext({
      rootPath,
      functions: [EmulatorStartManyForAll],
    }));

    const actualResult = await context.call(EmulatorStartMany, {
      emulators: [],
    });

    expect(actualResult).toEqual({ emulatorNames: [], configuration: {} });
    expect(infoLogSpy.mock.calls.map((c) => c[0]).join(' ')).not.toContain(
      'Configuration',
    );
    expect(await readEnvironmentFile()).toBeNull();
  });

  it('should call all EmulatorStart, return names and configuration, and rewrite the environment file', async () => {
    await seedEnvironmentFile('staleConfig="👻"\n');

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
    expect(await readEnvironmentFile()).toEqual('config1="🔧"\nconfig2="🗃️"\n');
  });

  it('should only call the specified emulator and only overwrite its keys', async () => {
    await seedEnvironmentFile('config2="🗃️"\nstaleConfig="👻"\n');

    const actualResult = await context.call(EmulatorStartMany, {
      emulators: ['emulator1'],
    });

    expect(actualResult.emulatorNames).toEqual(['emulator1']);
    expect(actualResult.configuration).toEqual({ config1: '🔧' });
    expect(infoLogSpy.mock.calls.map((c) => c[0]).join(' ')).toContain(
      'config1=🔧',
    );
    expect(await readEnvironmentFile()).toEqual(
      'config1="🔧"\nconfig2="🗃️"\nstaleConfig="👻"\n',
    );
  });

  it('should throw when the emulator cannot be found', async () => {
    const actualPromise = context.call(EmulatorStartMany, {
      emulators: ['🙅'],
    });

    await expect(actualPromise).rejects.toThrow(
      `No implementation found for emulator '🙅'.`,
    );
    expect(await readEnvironmentFile()).toBeNull();
  });

  it('should write the environment file at the configured location', async () => {
    ({ context } = createContext({
      rootPath,
      configuration: {
        causa: { emulators: { environmentFile: 'nested/dir/my.env' } },
      },
      functions: [Emulator1, Emulator2, EmulatorStartManyForAll],
    }));

    await context.call(EmulatorStartMany, { emulators: [] });

    expect(await readEnvironmentFile('nested/dir/my.env')).toEqual(
      'config1="🔧"\nconfig2="🗃️"\n',
    );
    expect(await readEnvironmentFile()).toBeNull();
  });

  it('should not write the environment file when it is disabled', async () => {
    ({ context } = createContext({
      rootPath,
      configuration: { causa: { emulators: { environmentFile: null } } },
      functions: [Emulator1, Emulator2, EmulatorStartManyForAll],
    }));

    const actualResult = await context.call(EmulatorStartMany, {
      emulators: [],
    });

    expect(actualResult.configuration).toEqual({
      config1: '🔧',
      config2: '🗃️',
    });
    expect(await readEnvironmentFile()).toBeNull();
  });

  it('should throw when a configuration entry cannot be written to the environment file', async () => {
    ({ context } = createContext({
      rootPath,
      functions: [InvalidConfigurationEmulator, EmulatorStartManyForAll],
    }));

    const actualPromise = context.call(EmulatorStartMany, { emulators: [] });

    await expect(actualPromise).rejects.toThrow(
      InvalidEmulatorConfigurationEntryError,
    );
    expect(await readEnvironmentFile()).toBeNull();
  });
});
