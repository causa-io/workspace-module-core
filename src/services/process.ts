import { WorkspaceContext } from '@causa/workspace';
import { ChildProcess, spawn } from 'child_process';
import type { Level, Logger } from 'pino';
import { Readable } from 'stream';

/**
 * Options specifying how outputs of a spawned process should be forwarded to the logger.
 */
export type SpawnLoggingOption = {
  /**
   * Determines at which level the standard output of the spawned process should be forwarded to the logger.
   * If `null`, the output is not forwarded.
   */
  readonly stdout: Level | null;

  /**
   * Determines at which level the standard error of the spawned process should be forwarded to the logger.
   * If `null`, the output is not forwarded.
   */
  readonly stderr: Level | null;
};

/**
 * Options specifying whether outputs of a spawned process should be captured.
 * When capturing, the entire output is stored in memory, which can consumes a lot of resources.
 */
export type SpawnCaptureOption = {
  /**
   * Whether the standard output of the process should be captured.
   */
  readonly stdout?: boolean;

  /**
   * Whether the standard error of the process should be captured.
   */
  readonly stderr?: boolean;
};

/**
 * Options when spawning a process.
 */
export type SpawnOptions = {
  /**
   * The working directory in which the process should run.
   * Defaults to the context's working directory.
   */
  workingDirectory?: string;

  /**
   * Environment variables passed to the process.
   * By default, environment variables are inherited from the parent process ({@link process.env}).
   */
  environment?: Record<string, string | undefined>;

  /**
   * Defines how standard outputs of the spawned process are forwarded to the logger.
   * Defaults to `debug`. Set to `null` to disable forwarding.
   */
  logging?: Level | SpawnLoggingOption | null;

  /**
   * Defines whether the standard outputs of the spawned process should be captured.
   * By default, nothing is captured.
   */
  capture?: SpawnCaptureOption;
};

/**
 * The result of a spawned process, obtained once it has exited.
 */
export type SpawnedProcessResult = {
  /**
   * The exit code returned by the process.
   */
  readonly code: number;

  /**
   * The standard output of the process, if {@link SpawnCaptureOption.stdout} was set to `true`.
   */
  readonly stdout?: string;

  /**
   * The standard error of the process, if {@link SpawnCaptureOption.stderr} was set to `true`.
   */
  readonly stderr?: string;
};

/**
 * A spawned process, which may still be running.
 */
export type SpawnedProcess = {
  /**
   * The {@link ChildProcess} returned by {@link spawn}.
   */
  readonly childProcess: ChildProcess;

  /**
   * A promise that resolves when the process exits.
   * It is rejected with a {@link ProcessServiceExitCodeError} if the process returns an exit code different than `0`.
   */
  readonly result: Promise<SpawnedProcessResult>;
};

/**
 * An error thrown when a spawned process exits with a code different than `0`.
 */
export class ProcessServiceExitCodeError extends Error {
  /**
   * Creates a new {@link ProcessServiceExitCodeError}.
   *
   * @param command The command that was spawned.
   * @param args The arguments passed to the command.
   * @param result The result returned by the process.
   */
  constructor(
    readonly command: string,
    readonly args: string[],
    readonly result: SpawnedProcessResult,
  ) {
    super(`Process '${command}' exited with code ${result.code}.`);
  }
}

/**
 * A service that spawns child processes and provides utilities to parse their outputs.
 */
export class ProcessService {
  /**
   * The {@link Logger} to use when forwarding process outputs.
   */
  private readonly logger: Logger;

  /**
   * The default directory in which the command will be run unless overridden.
   */
  private readonly defaultWorkingDirectory: string;

  constructor(context: WorkspaceContext) {
    this.logger = context.logger;
    this.defaultWorkingDirectory = context.workingDirectory;
  }

  /**
   * Spawns a new child process using {@link spawn}.
   *
   * @param command The command to run.
   * @param args The arguments to pass to the command.
   * @param options Options when running the command.
   * @returns A {@link SpawnedProcess}. {@link SpawnedProcess.result} can be awaited until the process exits.
   */
  spawn(
    command: string,
    args: string[],
    options: SpawnOptions = {},
  ): SpawnedProcess {
    const cwd = options.workingDirectory ?? this.defaultWorkingDirectory;
    const logging = options.logging !== undefined ? options.logging : 'debug';
    const stdoutLogLevel =
      typeof logging === 'string' ? logging : logging?.stdout ?? null;
    const stderrLogLevel =
      typeof logging === 'string' ? logging : logging?.stderr ?? null;
    const captureStdout = options.capture?.stdout ?? false;
    const captureStderr = options.capture?.stderr ?? false;
    const shouldPipeStdio =
      stdoutLogLevel !== null ||
      stderrLogLevel !== null ||
      captureStdout ||
      captureStderr;

    const childProcess = spawn(command, args, {
      cwd,
      env: options.environment,
      stdio: shouldPipeStdio ? 'pipe' : 'ignore',
    });

    const stdout: string[] = [];
    if ((stdoutLogLevel !== null || captureStdout) && childProcess.stdout) {
      this.pipeStdStream(
        childProcess.stdout,
        stdoutLogLevel,
        captureStdout ? stdout : null,
      );
    }

    const stderr: string[] = [];
    if ((stderrLogLevel !== null || captureStderr) && childProcess.stderr) {
      this.pipeStdStream(
        childProcess.stderr,
        stderrLogLevel,
        captureStderr ? stderr : null,
      );
    }

    const result = new Promise<SpawnedProcessResult>((resolve, reject) => {
      childProcess.on('close', (code) => {
        const result: SpawnedProcessResult = {
          code: code ?? NaN,
          ...(captureStdout ? { stdout: stdout.join('') } : null),
          ...(captureStderr ? { stderr: stderr.join('') } : null),
        };

        if (code !== 0) {
          reject(new ProcessServiceExitCodeError(command, args, result));
        } else {
          resolve(result);
        }
      });
    });

    return { childProcess, result };
  }

  /**
   * Forwards a stream to the logger, captures it to a string array, or both.
   * When streaming to the logger, incoming data is split line by line before being logged, such that the output is
   * nicely displayed.
   * Data is captured by appending it to an existing array. While it is not the most efficient solution, it is
   * convenient to pass the array by reference.
   *
   * @param stream The stream to pipe.
   * @param logLevel The {@link Level} used to log incoming lines. If `null`, the stream is not logged.
   * @param strArray The array to which incoming stream data will be appended.
   */
  private pipeStdStream(
    stream: Readable,
    logLevel: Level | null,
    strArray: string[] | null,
  ) {
    let loggingBuffer = '';

    stream.on('data', (data) => {
      const dataStr = data.toString();

      if (logLevel) {
        loggingBuffer += dataStr;

        // Logging everything but the last line in the buffer, which might be incomplete for all we know.
        const bufferLines = loggingBuffer.split('\n');
        loggingBuffer = bufferLines.at(-1) ?? '';

        bufferLines.slice(0, -1).forEach((l) => this.logger[logLevel](l));
      }

      strArray?.push(dataStr);
    });

    stream.on('close', () => {
      if (logLevel && loggingBuffer.length > 0) {
        // Flushing the buffer which may still contain the last line (if it did not end with `\n`).
        // Treating the buffer as if it could contain multiple lines, just for completeness.
        const bufferLines = loggingBuffer.split('\n');
        if (bufferLines.at(-1) === '') {
          bufferLines.splice(-1);
        }
        bufferLines.forEach((l) => this.logger[logLevel](l));
        loggingBuffer = '';
      }
    });
  }
}
