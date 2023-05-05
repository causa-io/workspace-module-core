import { WorkspaceContext } from '@causa/workspace';
import {
  ProcessService,
  SpawnOptions,
  SpawnedProcessResult,
} from './process.js';

/**
 * A service exposing the Git CLI.
 */
export class GitService {
  /**
   * The underlying {@link ProcessService} spawning the Git CLI.
   */
  private readonly processService: ProcessService;

  constructor(context: WorkspaceContext) {
    this.processService = context.service(ProcessService);
  }

  /**
   * Gets the short SHA of the current Git commit.
   *
   * @returns The short SHA of the current Git commit.
   */
  async getCurrentShortSha(): Promise<string> {
    const result = await this.git('rev-parse', ['--short', 'HEAD'], {
      capture: { stdout: true },
      logging: null,
    });

    return result.stdout?.trim() ?? '';
  }

  /**
   * Runs an arbitrary Git CLI command.
   *
   * @param command The command to run.
   * @param args Additional arguments that will be appended to the command.
   * @param options Options when spawning the Git CLI process.
   * @returns The result of the spawned process.
   */
  async git(
    command: string,
    args: string[],
    options: SpawnOptions = {},
  ): Promise<SpawnedProcessResult> {
    const process = this.processService.spawn(
      'git',
      [command, ...args],
      options,
    );
    return await process.result;
  }
}
