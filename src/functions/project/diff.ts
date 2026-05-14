import micromatch from 'micromatch';
import { join } from 'path';
import {
  ProjectDiff,
  type ProjectDiffResult,
} from '../../definitions/index.js';
import { GitService } from '../../services/index.js';

/**
 * Implements {@link ProjectDiff} for all projects and the workspace itself.
 * This function only makes sense at the workspace level, as it lists projects.
 * However there's nothing wrong with running it from within a project.
 */
export class ProjectDiffForAll extends ProjectDiff {
  /**
   * Checks a project within the workspace for changes.
   * Changes are detected if files under the project path have changed, or if any of the files listed in the project's
   * `project.externalFiles` configuration has changed.
   *
   * @param projectPath The path to the project to check for changes.
   * @param filesDiff The files that have changed in the repository, according to Git.
   * @returns The diff result for the project, or `null` if no changes were found.
   */
  private async checkDiffForProjectPath(
    projectPath: string,
    filesDiff: string[],
  ): Promise<ProjectDiffResult[string] | null> {
    const projectContext = await this._context.clone({
      workingDirectory: projectPath,
      processors: null,
    });

    const patterns = projectContext.get('project.externalFiles') ?? [];
    const globs = [
      join(projectPath, '**', '*'),
      ...patterns.map((d) => join(this._context.rootPath, d)),
    ];

    const diff = micromatch(filesDiff, globs);
    if (diff.length === 0) {
      this._context.logger.debug(
        `No change found in project '${projectPath}'.`,
      );
      return null;
    }

    this._context.logger.debug(
      `Changes found in project '${projectPath}', generating project configuration.`,
    );
    const configuration = await projectContext.getAndRender('project');
    return { diff, configuration };
  }

  async _call(): Promise<ProjectDiffResult> {
    const commits = this.commits ?? [];
    if (commits.length > 2) {
      throw new Error(
        `Too many commits provided. At most two commits can be compared.`,
      );
    }

    this._context.logger.info('🔍 Checking for changes in projects.');

    const gitService = this._context.service(GitService);

    const [projectPaths, repoRoot, filesDiff] = await Promise.all([
      this._context.listProjectPaths(),
      gitService.getRepositoryRootPath(),
      gitService.filesDiff({ commits }),
    ]);
    const absoluteFilesDiff = filesDiff.map((f) => join(repoRoot, f));

    this._context.logger.debug(
      `Git diff returned files: ${filesDiff.map((f) => `'${f}'`).join(', ')}.`,
    );
    this._context.logger.debug(
      `Checking ${projectPaths.length} projects for changes.`,
    );

    const changedProjectsEntries = await Promise.all(
      projectPaths.map(async (p) => [
        p,
        await this.checkDiffForProjectPath(p, absoluteFilesDiff),
      ]),
    );

    return Object.fromEntries(
      changedProjectsEntries.filter(([, diff]) => diff != null),
    );
  }

  _supports(): boolean {
    return true;
  }
}
