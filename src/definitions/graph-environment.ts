import type { WorkspaceContext } from '@causa/workspace';
import type { GraphWarning } from '../graph/context.js';

/**
 * A resource whose identifier is only known by a prefix, to be resolved in the environment.
 */
export type GraphResourcePrefix = {
  /**
   * The ID of the node holding the resource.
   */
  readonly node: string;

  /**
   * The type of the resource.
   */
  readonly type: string;

  /**
   * The prefix of the identifier, rendered with the configuration of the environment.
   */
  readonly prefix: string;
};

/**
 * Resolves the full identifiers of the resources of a type that are only known by a prefix, e.g. by listing the
 * resources of the environment.
 */
export type GraphResourcePrefixResolver = {
  /**
   * The type of the resources, e.g. `cloudtasks.googleapis.com/Queue`.
   */
  readonly resourceType: string;

  /**
   * Resolves the identifiers of resources.
   * Resources missing from the result are removed from their node, and the resolver should raise a warning explaining
   * why.
   *
   * @param context The context of the workspace root, in the environment.
   * @param prefixes The resources to resolve, all of the resolver's type.
   * @returns The full identifiers, keyed by node ID, and the warnings raised.
   */
  resolve(
    context: WorkspaceContext,
    prefixes: readonly GraphResourcePrefix[],
  ): Promise<{
    readonly ids: ReadonlyMap<string, string>;
    readonly warnings?: GraphWarning[];
  }>;
};

/**
 * Describes the resolution of the resources of the graph's nodes in the environment, at the start of an enrichment.
 */
export type GraphResourcesReport = {
  /**
   * The number of nodes whose resource was resolved.
   */
  readonly resolved: number;

  /**
   * The number of nodes whose resource could not be resolved, and was removed.
   */
  readonly removed: number;

  /**
   * The warnings raised while resolving resources, e.g. explaining why some could not be resolved.
   */
  readonly warnings: GraphWarning[];
};
