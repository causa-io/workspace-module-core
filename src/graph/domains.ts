import type { WorkspaceContext } from '@causa/workspace';
import { dirname, relative } from 'path';
import {
  GraphFact,
  type GraphContext,
  type GraphFactOutput,
} from './context.js';

/**
 * A domain of the workspace.
 */
export type WorkspaceDomain = {
  /**
   * The domain directory, relative to the workspace root. This is the domain's locator.
   */
  readonly directory: string;

  /**
   * The name of the domain.
   */
  readonly name: string;

  /**
   * The description of the domain.
   */
  readonly description: string | undefined;

  /**
   * The context for the domain, whose working directory is the domain directory.
   */
  readonly context: WorkspaceContext;
};

/**
 * Returns the domain a directory belongs to.
 *
 * @param domains The domains of the workspace.
 * @param directory The directory, relative to the workspace root.
 * @returns The domain, or `undefined` if the directory is not part of a domain.
 */
export function domainAt(
  domains: readonly WorkspaceDomain[],
  directory: string,
): WorkspaceDomain | undefined {
  return domains.find(
    (domain) =>
      domain.directory === '' ||
      directory === domain.directory ||
      directory.startsWith(`${domain.directory}/`),
  );
}

/**
 * Returns the domain a file belongs to.
 *
 * @param domains The domains of the workspace.
 * @param file The file, relative to the workspace root.
 * @returns The domain, or `undefined` if the file is not part of a domain.
 */
export function domainOfFile(
  domains: readonly WorkspaceDomain[],
  file: string,
): WorkspaceDomain | undefined {
  return domainAt(domains, dirname(file));
}

/**
 * The domains of the workspace, sorted by directory.
 */
export class DomainsFact extends GraphFact<WorkspaceDomain[]> {
  async compute({
    context,
  }: GraphContext): Promise<GraphFactOutput<WorkspaceDomain[]>> {
    const paths = (await context.listDomainPaths()).sort();
    const domains = await Promise.all(
      paths.map(async (path) => {
        const domainContext = await context.clone({
          workingDirectory: path,
          processors: null,
        });
        const directory = relative(context.rootPath, path);
        const domain = domainContext.get('domain');
        return {
          directory,
          name: domain?.name ?? directory,
          description: domain?.description,
          context: domainContext,
        };
      }),
    );
    return { value: domains };
  }
}
