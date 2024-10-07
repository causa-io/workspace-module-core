import { WorkspaceContext } from '@causa/workspace';
import {
  ProcessService,
  type SpawnOptions,
  type SpawnedProcessResult,
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
   * Gets the root path of the Git repository.
   * Defaults to searching from the current working directory.
   *
   * @param options Options for the operation.
   * @returns The root path of the Git repository.
   */
  async getRepositoryRootPath(
    options: {
      /**
       * The directory to search from, assumed to be part of a repository.
       */
      directory?: string;
    } = {},
  ): Promise<string> {
    const result = await this.git('rev-parse', ['--show-toplevel'], {
      workingDirectory: options.directory,
      capture: { stdout: true },
      logging: null,
    });

    return result.stdout?.trim() ?? '';
  }

  /**
   * Runs `git diff` with the given options.
   *
   * @param options Options for the diff.
   * @returns The result of the `git diff` process.
   */
  async diff(
    options: GitDiffOptions & SpawnOptions = {},
  ): Promise<SpawnedProcessResult> {
    const { cached, commit, nameOnly, paths, ...spawnOptions } = options;

    const args: string[] = [];
    if (cached) {
      args.push('--cached');
    }
    if (nameOnly) {
      args.push('--name-only');
    }
    // This should be placed after all other options...
    if (commit) {
      args.push(commit);
    }
    // Except paths, placed after a separator.
    if (paths && paths.length > 0) {
      args.push('--', ...paths);
    }

    return await this.git('diff', args, spawnOptions);
  }

  /**
   * Runs `git diff --name-only` with the given options and returns the list of files in the diff.
   *
   * @param options Options for the diff.
   * @returns The list of files in the diff.
   */
  async filesDiff(
    options: Omit<GitDiffOptions, 'nameOnly'> = {},
  ): Promise<string[]> {
    const result = await this.diff({
      ...options,
      nameOnly: true,
      capture: { stdout: true },
      logging: null,
    });
    return (result.stdout ?? '').split('\n').filter((path) => path.length > 0);
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
