import type { WorkspaceContext } from '@causa/workspace';
import { join, relative } from 'path';
import type { InfrastructureConfiguration } from '../configurations/index.js';
import {
  GraphFact,
  type GraphContext,
  type GraphFactOutput,
} from './context.js';
import { DomainsFact, type WorkspaceDomain } from './domains.js';

/**
 * A project of the workspace.
 */
export type WorkspaceProject = {
  /**
   * The project directory, relative to the workspace root. This is the project's locator.
   */
  readonly directory: string;

  /**
   * The name of the project.
   */
  readonly name: string;

  /**
   * The type of the project, from `project.type`, e.g. `serviceContainer`.
   */
  readonly type: string | undefined;

  /**
   * The language of the project, from `project.language`, e.g. `typescript`.
   */
  readonly language: string | undefined;

  /**
   * Whether the project is the environment project (`infrastructure.environmentProject`), deployed for each
   * environment. Other infrastructure projects are not expected to depend on the environment.
   */
  readonly environment: boolean;

  /**
   * The domain the project belongs to.
   */
  readonly domain: WorkspaceDomain | undefined;

  /**
   * The context for the project, whose working directory is the project directory.
   */
  readonly context: WorkspaceContext;
};

/**
 * Returns the project containing the given directory.
 *
 * @param projects The projects of the workspace.
 * @param directory The directory, relative to the workspace root.
 * @returns The project containing the directory, or `undefined`.
 */
export function projectAt<T extends { readonly directory: string }>(
  projects: readonly T[],
  directory: string,
): T | undefined {
  return projects.find(
    (project) =>
      project.directory === '' ||
      directory === project.directory ||
      directory.startsWith(`${project.directory}/`),
  );
}

/**
 * The projects of the workspace, sorted by directory.
 */
export class ProjectsFact extends GraphFact<WorkspaceProject[]> {
  async compute(
    graph: GraphContext,
  ): Promise<GraphFactOutput<WorkspaceProject[]>> {
    const { context } = graph;
    const [paths, domains] = await Promise.all([
      context.listProjectPaths(),
      graph.get(DomainsFact),
    ]);
    const environmentProject = context
      .asConfiguration<InfrastructureConfiguration>()
      .get('infrastructure.environmentProject');
    const environmentDirectory =
      environmentProject !== undefined
        ? relative(context.rootPath, join(context.rootPath, environmentProject))
        : undefined;
    const projects = await Promise.all(
      paths.sort().map(async (path) => {
        const projectContext = await context.clone({
          workingDirectory: path,
          processors: null,
        });
        const directory = relative(context.rootPath, path);
        const { domainPath } = projectContext;
        const domainDirectory =
          domainPath !== null
            ? relative(context.rootPath, domainPath)
            : undefined;
        return {
          directory,
          name: projectContext.get('project.name') ?? directory,
          type: projectContext.get('project.type'),
          language: projectContext.get('project.language'),
          environment: directory === environmentDirectory,
          domain: domains.find((d) => d.directory === domainDirectory),
          context: projectContext,
        };
      }),
    );
    return { value: projects };
  }
}
