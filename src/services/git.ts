import { WorkspaceContext } from '@causa/workspace';
import {
  ProcessService,
  SpawnOptions,
  SpawnedProcessResult,
} from './process.js';

/**
 * Options for {@link GitService.diff}.
 */
type GitDiffOptions = {
  /**
   * The commit to compare to. This can also accept several commits.
   * See https://git-scm.com/docs/git-diff for more information.
   */
  commit?: string;

  /**
   * Lists the staged changes.
   */
  cached?: boolean;

  /**
   * Shows only the names of changed files.
   */
  nameOnly?: boolean;

  /**
   * Limits the diff to the given paths.
   */
  paths?: string[];
};

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
   * Runs `git diff` with the given options.
   *
   * @param options Options for the diff.
   * @returns The output of `git diff`.
   */
  async diff(options: GitDiffOptions = {}): Promise<string> {
    const args: string[] = [];

    if (options.cached) {
      args.push('--cached');
    }

    if (options.nameOnly) {
      args.push('--name-only');
    }

    // This should be placed after all other options...
    if (options.commit) {
      args.push(options.commit);
    }

    // Except paths, placed after a separator.
    if (options.paths && options.paths.length > 0) {
      args.push('--', ...options.paths);
    }

    const result = await this.git('diff', args, {
      capture: { stdout: true },
      logging: null,
    });

    return result.stdout ?? '';
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
