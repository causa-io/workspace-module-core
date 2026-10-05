import type { WorkspaceContext } from '@causa/workspace';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { stringify } from 'yaml';
import {
  GraphEnrichWithEnvironment,
  GraphExtract,
  GraphListRules,
  type Graph,
  type GraphExtractResult,
  type GraphFetcherReport,
  type GraphResourcesReport,
  type GraphRule,
} from '../../definitions/index.js';
import {
  buildGraph,
  GraphContext,
  listGraphNodes,
  runGraphRules,
  type GraphFailure,
  type GraphFactReport,
} from '../../graph/index.js';

/**
 * Implements {@link GraphExtract} by running the rules returned by all the {@link GraphListRules} implementations
 * against a single {@link GraphContext}, and building the graph from their results using {@link buildGraph}.
 */
export class GraphExtractForAll extends GraphExtract {
  async _call(): Promise<GraphExtractResult> {
    const context = await this.cloneContextForRootIfNeeded();

    context.logger.info('🕸️ Extracting the architecture graph.');
    const { rules: allRules, failures: listFailures } = listRules(context);
    const graphContext = new GraphContext(context);
    const results = await runGraphRules(allRules, graphContext);
    const { graph: extractedGraph, rules } = buildGraph(results, {
      name: context.get('workspace.name'),
      description:
        'Extracted from the workspace configuration, model schemas, and infrastructure code by `cs graph extract`.',
    });
    const factFailures = [...graphContext.failures].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const extractionFailures = [...listFailures, ...factFailures];
    const { facts: extractionFacts } = graphContext;
    const dangling = rules.reduce((count, r) => count + r.dangling.length, 0);
    const extractionWarnings = countWarnings([...rules, ...extractionFacts]);
    const elements = countElements(extractedGraph);
    context.logger.info(
      `🕸️ Extracted ${elements.nodes} node(s) and ${elements.edges} edge(s), with ${extractionWarnings} warning(s), ${extractionFailures.length} failure(s), and ${dangling} dangling reference(s).`,
    );

    let graph = extractedGraph;
    let resources: GraphResourcesReport | undefined;
    let fetchers: GraphFetcherReport[] | undefined;
    let enrichmentFacts: GraphFactReport[] = [];
    let enrichmentFailures: GraphFailure[] = [];
    if (this.environmentData) {
      const envCtx = await context.clone({ environment: this.environmentData });
      ({
        graph,
        resources,
        fetchers,
        facts: enrichmentFacts,
        failures: enrichmentFailures,
      } = await envCtx.call(GraphEnrichWithEnvironment, {
        graph,
        at: this.environmentAt,
        window: this.environmentWindow,
      }));
    }

    const facts = [...extractionFacts, ...enrichmentFacts];
    const failures = [...extractionFailures, ...enrichmentFailures];
    const reports = [
      ...rules,
      ...facts,
      ...(resources
        ? [{ name: 'resources', warnings: resources.warnings }]
        : []),
      ...(fetchers ?? []),
    ];
    const summary = {
      ...elements,
      warnings: countWarnings(reports),
      failures: failures.length,
      dangling,
    };

    if (this.output) {
      await writeYaml(this.output, graph);
      context.logger.info(`🕸️ Wrote the graph to '${this.output}'.`);
    }

    if (this.report) {
      await writeYaml(this.report, {
        summary,
        rules,
        facts,
        ...(resources ? { resources } : {}),
        ...(fetchers ? { fetchers } : {}),
        failures,
      });
      context.logger.info(`🕸️ Wrote the report to '${this.report}'.`);
    } else {
      reports
        .flatMap(({ name, warnings }) =>
          warnings.map((warning) => ({ raisedBy: name, ...warning })),
        )
        .forEach(({ raisedBy, message, sources }) => {
          const [source] = sources ?? [];
          const where = source
            ? ` (${[source.path, source.pointer].filter((p) => p).join(' ')})`
            : '';
          context.logger.warn(`⚠️ [${raisedBy}] ${message}${where}`);
        });
      rules.forEach(({ name, dangling }) =>
        dangling.forEach((reference) => {
          const where =
            reference.field === 'parent'
              ? `the parent of ${reference.node}`
              : `the '${reference.field}' of ${reference.edge.type} ${reference.edge.from ?? 'null'} -> ${reference.edge.to ?? 'null'}`;
          context.logger.warn(
            `⚠️ [${name}] Dangling reference to '${reference.id}' in ${where}.`,
          );
        }),
      );
    }

    return {
      graph,
      rules,
      facts,
      ...(resources ? { resources } : {}),
      ...(fetchers ? { fetchers } : {}),
      failures,
    };
  }

  /**
   * Returns a context for the workspace root, without processors or environment, such that the extraction does not
   * depend on the directory the command is run from, nor on the selected environment.
   * The current context is returned if it is already set up this way.
   *
   * @returns The context to use for the extraction.
   */
  private async cloneContextForRootIfNeeded(): Promise<WorkspaceContext> {
    const { rootPath, workingDirectory, processors, environment } =
      this._context;
    if (
      workingDirectory === rootPath &&
      processors.length === 0 &&
      environment === null
    ) {
      return this._context;
    }

    return await this._context.clone({
      workingDirectory: rootPath,
      processors: null,
      environment: null,
    });
  }

  _supports(): boolean {
    return true;
  }
}

/**
 * Lists the rules of all the {@link GraphListRules} implementations, in the order of the names of the
 * implementations. An implementation that throws is recorded as a failure.
 *
 * @param context The context for the workspace root.
 * @returns The rules, and the implementations that failed to list theirs.
 */
function listRules(context: WorkspaceContext): {
  rules: GraphRule[];
  failures: GraphFailure[];
} {
  const implementations = context
    .getFunctionImplementations(GraphListRules, {})
    .sort((a, b) => a.constructor.name.localeCompare(b.constructor.name));

  const rules: GraphRule[] = [];
  const failures: GraphFailure[] = [];
  for (const implementation of implementations) {
    try {
      rules.push(...implementation._call());
    } catch (error: any) {
      const name = implementation.constructor.name;
      context.logger.error(
        `❌ Graph rules of '${name}' could not be listed: ${error.stack ?? error}`,
      );
      failures.push({ name, message: error.message ?? `${error}` });
    }
  }

  return { rules, failures };
}

/**
 * Counts the warnings raised by rules, facts, or fetchers.
 *
 * @param reports The reports of the rules, facts, or fetchers.
 * @returns The total number of warnings.
 */
function countWarnings(
  reports: readonly { readonly warnings: readonly unknown[] }[],
): number {
  return reports.reduce((count, r) => count + r.warnings.length, 0);
}

/**
 * Counts the nodes and edges of a graph.
 *
 * @param graph The graph.
 * @returns The number of nodes and edges.
 */
function countElements(graph: Graph): { nodes: number; edges: number } {
  const nodes = listGraphNodes(graph).length;
  const edges = Object.values(graph.edges ?? {}).reduce(
    (count, list) => count + ((list as unknown[] | undefined)?.length ?? 0),
    0,
  );
  return { nodes, edges };
}

/**
 * Writes a value as YAML to a file, creating its directory if needed.
 *
 * @param path The path to the file, relative to the working directory.
 * @param value The value to serialize.
 */
async function writeYaml(path: string, value: unknown): Promise<void> {
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(
    absolutePath,
    stringify(value, { lineWidth: 0, aliasDuplicateObjects: false }),
  );
}
