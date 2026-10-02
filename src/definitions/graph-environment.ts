import { WorkspaceFunction, type WorkspaceContext } from '@causa/workspace';
import { AllowMissing } from '@causa/workspace/validation';
import { Transform } from 'class-transformer';
import { IsDate, IsInt, IsObject, IsPositive } from 'class-validator';
import type {
  GraphFailure,
  GraphFactReport,
  GraphWarning,
} from '../graph/context.js';
import type { GraphEnvironmentContext } from '../graph/environment.js';
import type {
  Graph,
  GraphAlert,
  GraphMetricDefinition,
  GraphMetricValue,
} from '../graph/generated.js';

/**
 * Metric definitions, keyed by node type and then by metric name.
 */
export type GraphMetricDefinitionsByType = Record<
  string,
  Record<string, GraphMetricDefinition>
>;

/**
 * Bucket layouts, keyed by name. Each layout is a list of ascending bounds.
 */
export type GraphBucketLayoutsByName = Record<string, number[]>;

/**
 * What a {@link GraphEnvironmentFetcher} returns for a single node.
 */
export type GraphEnvironmentNodeOutput = {
  /**
   * Data to merge into the node's `data`. Each key replaces the existing one, except `alerts`, which is set from the
   * alerts returned by all fetchers.
   */
  readonly data?: Record<string, unknown>;

  /**
   * Point-in-time values of the node's metrics, keyed by metric name.
   */
  readonly metrics?: Record<string, GraphMetricValue>;

  /**
   * The alerts open at the end of the evaluation window on the node's resource. The alerts returned by all fetchers
   * are listed in the node's `data.alerts`.
   */
  readonly alerts?: GraphAlert[];
};

/**
 * What a {@link GraphEnvironmentFetcher} returns.
 */
export type GraphEnvironmentFetcherOutput = {
  /**
   * The data and metrics of nodes, keyed by node ID.
   */
  readonly nodes?: Record<string, GraphEnvironmentNodeOutput>;

  /**
   * The alerts open at the end of the evaluation window that could not be attached to a node of the graph. They are
   * merged into the graph's `environment.alerts`.
   */
  readonly alerts?: GraphAlert[];

  /**
   * The bucket layouts referenced by the returned distributions, keyed by name.
   */
  readonly bucketLayouts?: GraphBucketLayoutsByName;

  /**
   * Things the fetcher could not fetch or interpret.
   */
  readonly warnings?: GraphWarning[];
};

/**
 * Fetches point-in-time data and metrics about the nodes of the graph from an environment.
 */
export type GraphEnvironmentFetcher = {
  /**
   * The name of the fetcher, as it appears in the report.
   */
  readonly name: string;

  /**
   * What the fetcher reads and returns.
   */
  readonly description: string;

  /**
   * Fetches the data and metrics, over the evaluation window of the context.
   *
   * @param environment The context of the enrichment.
   * @returns The data and metrics, keyed by node ID.
   */
  fetch(
    environment: GraphEnvironmentContext,
  ): Promise<GraphEnvironmentFetcherOutput>;
};

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
 * What a module contributes to the enrichment of graphs with environment data.
 */
export type GraphEnvironmentProvider = {
  /**
   * The definitions of the metrics of the module's node types, keyed by node type and metric name.
   * Metrics of core node types are defined by the core module, and cannot be redefined.
   */
  readonly metrics?: GraphMetricDefinitionsByType;

  /**
   * The resolvers of resources only known by a prefix. There should be at most one resolver per resource type.
   */
  readonly prefixResolvers?: GraphResourcePrefixResolver[];

  /**
   * The fetchers of environment data and metrics.
   */
  readonly fetchers?: GraphEnvironmentFetcher[];
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

/**
 * Describes a fetcher that ran during an enrichment, and what it returned.
 */
export type GraphFetcherReport = {
  /**
   * The name of the fetcher.
   */
  readonly name: string;

  /**
   * What the fetcher reads and returns.
   */
  readonly description: string;

  /**
   * The number of nodes for which the fetcher returned data or metrics.
   */
  readonly nodes: number;

  /**
   * The warnings the fetcher raised, including those raised while merging its output into the graph.
   */
  readonly warnings: GraphWarning[];
};

/**
 * The result of a {@link GraphEnrichWithEnvironment} call.
 */
export type GraphEnrichWithEnvironmentResult = {
  /**
   * The enriched copy of the graph.
   */
  readonly graph: Graph;

  /**
   * The report of the resolution of the resources of the graph's nodes.
   */
  readonly resources: GraphResourcesReport;

  /**
   * The reports of the fetchers that ran.
   */
  readonly fetchers: GraphFetcherReport[];

  /**
   * The reports of the facts that were computed.
   */
  readonly facts: GraphFactReport[];

  /**
   * The provider implementations, facts, and fetchers that failed, whose data and metrics are missing from the graph.
   */
  readonly failures: GraphFailure[];
};

/**
 * Adds data and metrics from the environment of the context to the graph, by running the fetchers of the providers
 * returned by all the {@link GraphGetEnvironmentProvider} implementations.
 * Resources are first resolved, rendering their identifiers with the configuration of the environment, and resolving
 * those only known by a prefix with the providers' resolvers.
 * Metrics are point-in-time values, computed over the window ending at `at`.
 */
export abstract class GraphEnrichWithEnvironment extends WorkspaceFunction<
  Promise<GraphEnrichWithEnvironmentResult>
> {
  /**
   * The graph to enrich, as returned by `GraphExtract`. It is not modified.
   */
  @IsObject()
  readonly graph!: Graph;

  /**
   * The end of the evaluation window. Defaults to now.
   * Providers exposing metrics with a delay may end the window of metrics earlier.
   */
  @AllowMissing()
  @Transform(({ value }) =>
    typeof value === 'string' ? new Date(value) : value,
  )
  @IsDate()
  readonly at?: Date;

  /**
   * The length of the evaluation window, in seconds. Defaults to 300 seconds.
   */
  @AllowMissing()
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  @IsInt()
  @IsPositive()
  readonly window?: number;
}

/**
 * Returns what a module contributes to the enrichment of graphs with environment data.
 * Each module implements this function once. The providers of all implementations are used by
 * {@link GraphEnrichWithEnvironment}, which passes a single {@link GraphEnvironmentContext} to all the fetchers.
 */
export abstract class GraphGetEnvironmentProvider extends WorkspaceFunction<GraphEnvironmentProvider> {}
