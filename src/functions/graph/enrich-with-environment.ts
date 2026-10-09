import type { WorkspaceContext } from '@causa/workspace';
import {
  GraphEnrichWithEnvironment,
  GraphGetEnvironmentProvider,
  type Graph,
  type GraphAlert,
  type GraphBucketLayoutsByName,
  type GraphEnrichWithEnvironmentResult,
  type GraphEnvironmentFetcher,
  type GraphEnvironmentFetcherOutput,
  type GraphEnvironmentProvider,
  type GraphFetcherReport,
  type GraphMetricDefinitionsByType,
  type GraphMetricValue,
  type GraphWarning,
} from '../../definitions/index.js';
import {
  CORE_GRAPH_METRIC_DEFINITIONS,
  GraphEnvironmentContext,
  GraphFactError,
  listGraphNodes,
  type GraphFailure,
} from '../../graph/index.js';

/**
 * The key of a node's data listing its alerts.
 */
const ALERTS_KEY = 'alerts';

/**
 * The output of a fetcher, along with its name.
 */
type NamedFetcherOutput = {
  /**
   * The name of the fetcher.
   */
  readonly fetcher: string;

  /**
   * What the fetcher returned.
   */
  readonly output: GraphEnvironmentFetcherOutput;
};

/**
 * The result of {@link mergeOutputs}.
 */
type MergeResult = {
  /**
   * The copy of the graph, with the data and metrics merged in its nodes.
   */
  readonly graph: Graph;

  /**
   * The definitions of the metrics present in the graph.
   */
  readonly metrics: GraphMetricDefinitionsByType;

  /**
   * The bucket layouts referenced by the distributions present in the graph.
   */
  readonly bucketLayouts: GraphBucketLayoutsByName;

  /**
   * The alerts that could not be attached to a node, from all fetchers.
   */
  readonly alerts: GraphAlert[];

  /**
   * The warnings raised while merging, e.g. about unknown nodes or metrics, keyed by the name of the fetcher whose
   * output raised them.
   */
  readonly warnings: Record<string, GraphWarning[]>;
};

/**
 * Implements {@link GraphEnrichWithEnvironment} by running the fetchers of the providers returned by all the
 * {@link GraphGetEnvironmentProvider} implementations against a single {@link GraphEnvironmentContext}, and merging
 * their outputs into a copy of the graph.
 */
export class GraphEnrichWithEnvironmentForAll extends GraphEnrichWithEnvironment {
  async _call(): Promise<GraphEnrichWithEnvironmentResult> {
    if (this.at && isNaN(this.at.getTime())) {
      throw new Error('The end of the evaluation window is not a valid date.');
    }

    this._context.logger.info(
      `🕸️ Fetching data and metrics from environment '${this._context.getEnvironmentOrThrow()}'.`,
    );
    const { providers, failures: listFailures } = listProviders(this._context);
    const environment = await GraphEnvironmentContext.create(
      this._context,
      this.graph,
      {
        at: this.at,
        window: this.window,
        prefixResolvers: providers.flatMap((p) => p.prefixResolvers ?? []),
      },
    );

    const fetchers = providers.flatMap((p) => p.fetchers ?? []);
    const results = await Promise.all(
      fetchers.map((fetcher) => runFetcher(fetcher, environment)),
    );
    const outputs = results.filter((r) => 'output' in r);
    const fetcherFailures = results.filter((r) => 'message' in r);

    const definitions = mergeDefinitions(providers);
    const {
      graph: merged,
      metrics,
      bucketLayouts,
      alerts,
      warnings: mergeWarnings,
    } = mergeOutputs(environment.graph, outputs, definitions);
    const graph = {
      ...merged,
      environment: {
        name: environment.environment,
        at: environment.at,
        window: environment.window,
        ...(alerts.length > 0 ? { alerts } : {}),
      },
      metrics,
      bucketLayouts,
    };

    const reports: GraphFetcherReport[] = fetchers.map((fetcher, index) => {
      const result = results[index];
      const output = 'output' in result ? result.output : {};
      return {
        name: fetcher.name,
        description: fetcher.description,
        nodes: Object.keys(output.nodes ?? {}).length,
        warnings: [
          ...(output.warnings ?? []),
          ...(mergeWarnings[fetcher.name] ?? []),
        ],
      };
    });
    const { facts, resolution: resources } = environment;
    const factFailures = [...environment.failures].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const failures = [...listFailures, ...factFailures, ...fetcherFailures];

    const warningCount = [resources, ...reports, ...facts].reduce(
      (c, r) => c + r.warnings.length,
      0,
    );
    this._context.logger.info(
      `🕸️ Resolved ${resources.resolved} resource(s) and removed ${resources.removed}, then ran ${fetchers.length} fetcher(s), with ${warningCount} warning(s) and ${failures.length} failure(s).`,
    );

    return { graph, resources, fetchers: reports, facts, failures };
  }

  _supports(): boolean {
    return true;
  }
}

/**
 * Returns the providers of all the {@link GraphGetEnvironmentProvider} implementations, in the order of the names of
 * the implementations. An implementation that throws is recorded as a failure.
 *
 * @param context The context in the environment.
 * @returns The providers, and the implementations that failed to return theirs.
 */
function listProviders(context: WorkspaceContext): {
  providers: GraphEnvironmentProvider[];
  failures: GraphFailure[];
} {
  const implementations = context
    .getFunctionImplementations(GraphGetEnvironmentProvider, {})
    .sort((a, b) => a.constructor.name.localeCompare(b.constructor.name));

  const providers: GraphEnvironmentProvider[] = [];
  const failures: GraphFailure[] = [];
  for (const implementation of implementations) {
    try {
      providers.push(implementation._call());
    } catch (error: any) {
      const name = implementation.constructor.name;
      context.logger.error(
        `❌ Graph environment provider of '${name}' could not be obtained: ${error.stack ?? error}`,
      );
      failures.push({ name, message: error.message ?? `${error}` });
    }
  }

  return { providers, failures };
}

/**
 * Runs a fetcher, turning an error into a failure.
 *
 * @param fetcher The fetcher to run.
 * @param environment The context of the enrichment.
 * @returns The output of the fetcher, or its failure.
 */
async function runFetcher(
  fetcher: GraphEnvironmentFetcher,
  environment: GraphEnvironmentContext,
): Promise<NamedFetcherOutput | GraphFailure> {
  try {
    return { fetcher: fetcher.name, output: await fetcher.fetch(environment) };
  } catch (error: any) {
    if (error instanceof GraphFactError) {
      return { fetcher: fetcher.name, output: {} };
    }

    environment.context.logger.error(
      `❌ Graph environment fetcher '${fetcher.name}' failed: ${error.stack ?? error}`,
    );
    return { name: fetcher.name, message: error.message ?? `${error}` };
  }
}

/**
 * Merges the core metric definitions with the ones of the providers.
 * Core definitions take precedence over the ones of providers.
 *
 * @param providers The providers.
 * @returns The definitions of all known metrics.
 */
function mergeDefinitions(
  providers: GraphEnvironmentProvider[],
): GraphMetricDefinitionsByType {
  const definitions: GraphMetricDefinitionsByType = {};
  for (const source of [
    ...providers.map((p) => p.metrics ?? {}),
    CORE_GRAPH_METRIC_DEFINITIONS,
  ]) {
    for (const [type, byName] of Object.entries(source)) {
      definitions[type] = { ...definitions[type], ...byName };
    }
  }

  return definitions;
}

/**
 * Sorts alerts by opening time, and then by title.
 */
function compareAlerts(a: GraphAlert, b: GraphAlert): number {
  return (
    a.openedAt.getTime() - b.openedAt.getTime() ||
    a.title.localeCompare(b.title)
  );
}

/**
 * Merges the outputs of fetchers into a copy of the graph.
 * The keys of the returned data replace the ones of the nodes' `data`, metrics are set in their `metrics`, and the
 * alerts of all fetchers are listed in their `data.alerts`. Alerts that could not be attached to a node are listed
 * together. Alerts are sorted by opening time, and then by title.
 * Metrics without a definition, or referencing unknown bucket layouts, are skipped. When several fetchers return the
 * same data key or metric of a node, the first value is kept. The `alerts` data key is ignored, as alerts are returned
 * separately.
 *
 * @param graph The graph. It is not modified.
 * @param outputs The outputs of the fetchers, in the order in which they should be merged.
 * @param definitions The definitions of all known metrics.
 * @returns The merged graph, the definitions and layouts it references, the alerts of the environment, and the
 *   warnings.
 */
function mergeOutputs(
  graph: Graph,
  outputs: NamedFetcherOutput[],
  definitions: GraphMetricDefinitionsByType,
): MergeResult {
  const merged = structuredClone(graph);
  const warnings: Record<string, GraphWarning[]> = {};
  const warn = (fetcher: string, message: string) =>
    (warnings[fetcher] ??= []).push({ message });

  const nodes = new Map(listGraphNodes(merged).map((n) => [n.id, n]));

  const availableLayouts: GraphBucketLayoutsByName = {};
  for (const { fetcher, output } of outputs) {
    for (const [name, bounds] of Object.entries(output.bucketLayouts ?? {})) {
      const existing = availableLayouts[name];
      if (!existing) {
        availableLayouts[name] = bounds;
      } else if (JSON.stringify(existing) !== JSON.stringify(bounds)) {
        warn(
          fetcher,
          `The bucket layout '${name}' differs from an existing one with the same name, and is ignored.`,
        );
      }
    }
  }

  const metrics: GraphMetricDefinitionsByType = {};
  const bucketLayouts: GraphBucketLayoutsByName = {};
  // The fetcher that set each data key, keyed by node ID and then by key.
  const dataFetchers = new Map<string, Map<string, string>>();
  const nodeAlerts = new Map<string, GraphAlert[]>();
  for (const { fetcher, output } of outputs) {
    for (const [id, { data, metrics: values, alerts }] of Object.entries(
      output.nodes ?? {},
    )) {
      const entry = nodes.get(id);
      if (!entry) {
        warn(fetcher, `The node '${id}' does not exist in the graph.`);
        continue;
      }

      const { type, node } = entry;
      const writable = node as { data?: Record<string, unknown> } & {
        metrics?: Record<string, GraphMetricValue>;
      };

      if (data) {
        let setBy = dataFetchers.get(id);
        if (!setBy) {
          setBy = new Map();
          dataFetchers.set(id, setBy);
        }

        const accepted: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(data)) {
          if (key === ALERTS_KEY) {
            warn(
              fetcher,
              `The data '${ALERTS_KEY}' of '${id}' should be returned as the node's alerts, and is ignored.`,
            );
            continue;
          }

          const other = setBy.get(key);
          if (other !== undefined) {
            warn(
              fetcher,
              `The data '${key}' of '${id}' was already returned by fetcher '${other}', and is ignored.`,
            );
            continue;
          }

          setBy.set(key, fetcher);
          accepted[key] = value;
        }

        writable.data = { ...writable.data, ...accepted };
      }

      for (const [name, value] of Object.entries(values ?? {})) {
        const definition = definitions[type]?.[name];
        if (!definition) {
          warn(
            fetcher,
            `The metric '${name}' of '${id}' has no definition for type '${type}', and is ignored.`,
          );
          continue;
        }

        if (writable.metrics?.[name]) {
          warn(
            fetcher,
            `The metric '${name}' of '${id}' was already returned by another fetcher, and is ignored.`,
          );
          continue;
        }

        const layouts = [
          value.value,
          ...(value.groups ?? []).map((g) => g.value),
        ].flatMap((m) => (typeof m === 'number' ? [] : [m.layout]));
        const unknownLayout = layouts.find((l) => !availableLayouts[l]);
        if (unknownLayout) {
          warn(
            fetcher,
            `The metric '${name}' of '${id}' references the unknown bucket layout '${unknownLayout}', and is ignored.`,
          );
          continue;
        }

        writable.metrics ??= {};
        writable.metrics[name] = structuredClone(value);
        metrics[type] ??= {};
        metrics[type][name] = definition;
        layouts.forEach((l) => (bucketLayouts[l] = availableLayouts[l]));
      }

      if (alerts && alerts.length > 0) {
        nodeAlerts.set(id, [
          ...(nodeAlerts.get(id) ?? []),
          ...structuredClone(alerts),
        ]);
      }
    }
  }

  for (const [id, alerts] of nodeAlerts) {
    const node = nodes.get(id)?.node as { data?: Record<string, unknown> };
    node.data = { ...node.data, [ALERTS_KEY]: alerts.sort(compareAlerts) };
  }

  const alerts = outputs
    .flatMap(({ output }) => structuredClone(output.alerts ?? []))
    .sort(compareAlerts);

  return { graph: merged, metrics, bucketLayouts, alerts, warnings };
}
