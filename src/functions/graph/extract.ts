import type { WorkspaceContext } from '@causa/workspace';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { stringify } from 'yaml';
import {
  GraphExtract,
  GraphListRules,
  type Graph,
  type GraphExtractResult,
  type GraphNode,
  type GraphRule,
} from '../../definitions/index.js';
import {
  buildGraph,
  GraphContext,
  runGraphRules,
  type GraphExtractionFailure,
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
    const { graph, rules } = buildGraph(results, {
      name: context.get('workspace.name'),
      description:
        'Extracted from the workspace configuration, model schemas, and infrastructure code by `cs graph extract`.',
    });
    const factFailures = [...graphContext.failures].sort((a, b) =>
      a.extraction.localeCompare(b.extraction),
    );
    const failures = [...listFailures, ...factFailures];
    const { facts } = graphContext;
    const warnings = [...rules, ...facts].flatMap(({ name, warnings }) =>
      warnings.map((warning) => ({ raisedBy: name, ...warning })),
    );

    const summary = {
      ...countElements(graph),
      warnings: warnings.length,
      failures: failures.length,
      dangling: rules.reduce((count, r) => count + r.dangling.length, 0),
    };
    context.logger.info(
      `🕸️ Extracted ${summary.nodes} node(s) and ${summary.edges} edge(s), with ${summary.warnings} warning(s), ${summary.failures} failure(s), and ${summary.dangling} dangling reference(s).`,
    );

    if (this.output) {
      await writeYaml(this.output, graph);
      context.logger.info(`🕸️ Wrote the graph to '${this.output}'.`);
    }

    if (this.report) {
      await writeYaml(this.report, { summary, rules, facts, failures });
      context.logger.info(`🕸️ Wrote the report to '${this.report}'.`);
    } else {
      warnings.forEach(({ raisedBy, message, sources }) => {
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

    return { graph, rules, facts, failures };
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
  failures: GraphExtractionFailure[];
} {
  const implementations = context
    .getFunctionImplementations(GraphListRules, {})
    .sort((a, b) => a.constructor.name.localeCompare(b.constructor.name));

  const rules: GraphRule[] = [];
  const failures: GraphExtractionFailure[] = [];
  for (const implementation of implementations) {
    try {
      rules.push(...implementation._call());
    } catch (error: any) {
      const extraction = implementation.constructor.name;
      context.logger.error(
        `❌ Graph rules of '${extraction}' could not be listed: ${error.stack ?? error}`,
      );
      failures.push({ extraction, message: error.message ?? `${error}` });
    }
  }

  return { rules, failures };
}

/**
 * Counts the nodes and edges of a graph.
 *
 * @param graph The graph.
 * @returns The number of nodes and edges.
 */
function countElements(graph: Graph): { nodes: number; edges: number } {
  const layers = Object.values(graph.nodes ?? {}) as Record<
    string,
    Record<string, GraphNode>
  >[];
  const nodes = layers
    .flatMap((byType) => Object.values(byType))
    .reduce((count, byLocator) => count + Object.keys(byLocator).length, 0);
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
