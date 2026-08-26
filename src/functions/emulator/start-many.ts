import { NoImplementationFoundError } from '@causa/workspace/function-registry';
import { CAUSA_FOLDER } from '@causa/workspace/initialization';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import type { CausaConfiguration } from '../../configurations/index.js';
import {
  EmulatorStart,
  EmulatorStartMany,
  type EmulatorStartManyResult,
} from '../../definitions/index.js';

/**
 * The default file where the emulators' configuration is written, relative to the workspace root.
 */
const DEFAULT_ENVIRONMENT_FILE = join(CAUSA_FOLDER, 'emulators.env');

/**
 * The regular expression matching a line of the environment file, as written by
 * {@link EmulatorStartManyForAll.writeEnvironmentFile}. The captured groups are the key and the value.
 */
const ENVIRONMENT_FILE_LINE_REGEXP = /^([A-Za-z_][A-Za-z0-9_]*)="(.*)"$/;

/**
 * The regular expression matching a valid environment variable name.
 */
const ENVIRONMENT_VARIABLE_NAME_REGEXP = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * The regular expression matching a value that cannot be written to the environment file.
 * Values are written between double quotes, which `dotenv` (and similar parsers) does not unescape.
 * It does however expand `\n` and `\r` sequences, which would corrupt the value when it is read back.
 */
const UNSUPPORTED_VALUE_REGEXP = /["\r\n]|\\[nr]/;

/**
 * Implements the {@link EmulatorStartMany} function by calling {@link EmulatorStart} on all or selected emulators.
 * This should be the only implementation of this function.
 */
export class EmulatorStartManyForAll extends EmulatorStartMany {
  async _call(): Promise<EmulatorStartManyResult> {
    let emulatorStarts: EmulatorStart[];
    const result: EmulatorStartManyResult = {
      emulatorNames: [],
      configuration: {},
    };

    if (this.emulators.length > 0) {
      emulatorStarts = this.emulators.map((name) => {
        try {
          return this._context.getFunctionImplementation(EmulatorStart, {
            name,
          });
        } catch (error) {
          if (error instanceof NoImplementationFoundError) {
            throw new Error(`No implementation found for emulator '${name}'.`);
          }

          throw error;
        }
      });
    } else {
      emulatorStarts = this._context.getFunctionImplementations(
        EmulatorStart,
        {},
      );

      if (emulatorStarts.length === 0) {
        this._context.logger.info('💤 No emulator to start.');
        return result;
      }
    }

    const emulatorResults = await Promise.all(
      emulatorStarts.map((emulatorStart) => emulatorStart._call()),
    );
    result.emulatorNames = emulatorResults.map((r) => r.name);
    result.configuration = Object.assign(
      {},
      ...emulatorResults.map((r) => r.configuration),
    );

    if (Object.keys(result.configuration).length > 0) {
      const confStr = Object.entries(result.configuration)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');
      this._context.logger.info(`🔧 Configuration for emulators:\n${confStr}`);
    }

    await this.writeEnvironmentFile(result.configuration);

    return result;
  }

  _supports(): boolean {
    return true;
  }

  /**
   * Returns the absolute path to the file where the emulators' configuration should be written.
   *
   * @returns The absolute path to the environment file, or `null` if writing it is disabled.
   */
  private getEnvironmentFile(): string | null {
    const file = this._context
      .asConfiguration<CausaConfiguration>()
      .get('causa.emulators.environmentFile');

    // An explicit `null` disables the file entirely.
    if (file === null) {
      return null;
    }

    return resolve(this._context.rootPath, file ?? DEFAULT_ENVIRONMENT_FILE);
  }

  /**
   * Reads the environment file previously written by {@link EmulatorStartManyForAll.writeEnvironmentFile}.
   * Lines that were not written by Causa (e.g. blank lines and comments) are ignored.
   *
   * @param file The absolute path to the environment file.
   * @returns The configuration found in the file, or an empty object if it does not exist.
   */
  private async readEnvironmentFile(
    file: string,
  ): Promise<Record<string, string>> {
    try {
      const content = await readFile(file, 'utf8');
      return Object.fromEntries(
        content
          .split('\n')
          .map((line) => line.match(ENVIRONMENT_FILE_LINE_REGEXP))
          .filter((match) => match !== null)
          .map((match) => [match[1], match[2]]),
      );
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return {};
      }

      throw error;
    }
  }

  /**
   * Writes the configuration returned by the emulators to the environment file.
   * When only a subset of the emulators is started, the entries already present in the file are kept and only the given
   * keys are overwritten, as the returned configuration does not cover the emulators that were left running.
   *
   * Does nothing if writing the file is disabled.
   *
   * @param configuration The configuration returned by the emulators.
   */
  private async writeEnvironmentFile(
    configuration: Record<string, string>,
  ): Promise<void> {
    const file = this.getEnvironmentFile();
    if (file === null) {
      return;
    }

    Object.entries(configuration).forEach(([key, value]) => {
      if (
        !ENVIRONMENT_VARIABLE_NAME_REGEXP.test(key) ||
        UNSUPPORTED_VALUE_REGEXP.test(value)
      ) {
        throw new InvalidEmulatorConfigurationEntryError(key);
      }
    });

    const entries =
      this.emulators.length > 0
        ? { ...(await this.readEnvironmentFile(file)), ...configuration }
        : configuration;

    const content = Object.keys(entries)
      .sort()
      .map((key) => `${key}="${entries[key]}"\n`)
      .join('');

    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);

    this._context.logger.info(
      `🔧 Wrote the emulators' configuration to '${file}'.`,
    );
  }
}

/**
 * An error thrown when an entry of an emulator's configuration cannot be written to the environment file.
 */
export class InvalidEmulatorConfigurationEntryError extends Error {
  constructor(readonly key: string) {
    super(
      `The emulator configuration entry '${key}' cannot be written to the environment file. Keys must be valid environment variable names, and values cannot contain double quotes, line breaks, or '\\n' and '\\r' sequences.`,
    );
  }
}
