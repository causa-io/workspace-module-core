import type { WorkspaceContext } from '@causa/workspace';
import { resolve } from 'path';
import type {
  GraphResourcePrefix,
  GraphResourcePrefixResolver,
  GraphResourcesReport,
} from '../definitions/index.js';
import {
  GraphFact,
  GraphFactStore,
  type GraphFactType,
  type GraphWarning,
} from './context.js';
import type { Graph } from './generated.js';
import { listGraphNodes, type GraphNodeEntry } from './ids.js';
import type { GraphResolvedResource, GraphResource } from './resource.js';

/**
 * The default length of the evaluation window, in seconds.
 */
export const DEFAULT_GRAPH_ENVIRONMENT_WINDOW = 300;

/**
 * Options when creating a {@link GraphEnvironmentContext}.
 */
export type GraphEnvironmentContextOptions = {
  /**
   * The end of the evaluation window. Defaults to now.
   */
  readonly at?: Date;

  /**
   * The length of the evaluation window, in seconds. Defaults to {@link DEFAULT_GRAPH_ENVIRONMENT_WINDOW}.
   */
  readonly window?: number;

  /**
   * The resolvers of resources only known by a prefix. Resources only known by a prefix of a type without a resolver
   * are removed.
   */
  readonly prefixResolvers?: readonly GraphResourcePrefixResolver[];

  /**
   * Values for some facts, which are then not computed. This is mostly useful for tests.
   */
  readonly facts?: Iterable<[GraphEnvironmentFactType<unknown>, unknown]>;
};

/**
 * A node of the graph holding a resource, along with the resource.
 */
export type GraphEnvironmentResource = {
  /**
   * The node holding the resource.
   */
  readonly node: GraphNodeEntry;

  /**
   * The resource of the node.
   */
  readonly resource: GraphResolvedResource;
};

/**
 * A piece of information about the environment, computed once per enrichment and shared by all the fetchers needing
 * it, using {@link GraphEnvironmentContext.get}.
 */
export abstract class GraphEnvironmentFact<T> extends GraphFact<
  T,
  GraphEnvironmentContext
> {}

/**
 * The class of a {@link GraphEnvironmentFact}, which identifies the fact.
 */
export type GraphEnvironmentFactType<T> = GraphFactType<
  T,
  GraphEnvironmentContext
>;

/**
 * The contexts of projects in the environment, keyed by the ID of the project node.
 */
type ProjectContexts = Map<string, Promise<WorkspaceContext>>;

/**
 * Returns the context of a project, in the environment, creating it on the first call.
 *
 * @param rootContext The context for the workspace root, in the environment.
 * @param projectContexts The contexts of projects created so far.
 * @param projectNodeId The ID of the project node, `project:<directory>`.
 * @returns The context of the project.
 */
function getProjectContext(
  rootContext: WorkspaceContext,
  projectContexts: ProjectContexts,
  projectNodeId: string,
): Promise<WorkspaceContext> {
  let context = projectContexts.get(projectNodeId);
  if (!context) {
    const directory = projectNodeId.replace(/^project:/, '');
    context = rootContext.clone({
      workingDirectory: resolve(rootContext.rootPath, directory),
    });
    projectContexts.set(projectNodeId, context);
  }

  return context;
}

/**
 * Renders the identifiers of the resources of nodes, using the configuration of their `scope` project, or of the
 * workspace root, in the environment.
 *
 * @param nodes The nodes of the graph.
 * @param contextOf Returns the context in which the identifier of a resource is rendered, given its `scope`.
 * @param warnings The warnings to which those about resources that cannot be rendered are added.
 * @returns The rendered resources, keyed by node ID, or `null` for those that cannot be rendered.
 */
async function renderResources(
  nodes: readonly GraphNodeEntry[],
  contextOf: (scope: string | undefined) => Promise<WorkspaceContext>,
  warnings: GraphWarning[],
): Promise<Map<string, GraphResource | null>> {
  const rendered = await Promise.all(
    nodes.map(
      async ({ id, node }): Promise<[string, GraphResource | null][]> => {
        const resource = node.data?.resource as GraphResource | undefined;
        const field = resource?.id !== undefined ? 'id' : 'idPrefix';
        const template = resource?.[field];
        if (!resource || typeof template !== 'string') {
          return [];
        }

        try {
          const context = await contextOf(resource.scope);
          const value = await context.render(
            { $format: template },
            { renderSecrets: false },
          );
          return [[id, { ...resource, [field]: value } as GraphResource]];
        } catch (error: any) {
          warnings.push({
            message: `The resource of node '${id}' could not be resolved, and is removed: ${error.message ?? error}`,
          });
          return [[id, null]];
        }
      },
    ),
  );

  return new Map(rendered.flat());
}

/**
 * Resolves the identifiers of the resources only known by a prefix, using the resolver of their type.
 *
 * @param rootContext The context for the workspace root, in the environment, passed to the resolvers.
 * @param prefixResolvers The resolvers of resources only known by a prefix.
 * @param prefixes The resources to resolve.
 * @param warnings The warnings to which those about resources that cannot be resolved are added.
 * @returns The full identifiers of the resolved resources, keyed by node ID.
 */
async function resolvePrefixes(
  rootContext: WorkspaceContext,
  prefixResolvers: readonly GraphResourcePrefixResolver[],
  prefixes: readonly GraphResourcePrefix[],
  warnings: GraphWarning[],
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  await Promise.all(
    [...Map.groupBy(prefixes, ({ type }) => type)].map(
      async ([type, prefixesOfType]) => {
        const [resolver, ...others] = prefixResolvers.filter(
          (r) => r.resourceType === type,
        );
        if (others.length > 0) {
          warnings.push({
            message: `Several resolvers are defined for the resource type '${type}'. The first one is used.`,
          });
        }

        if (!resolver) {
          warnings.push(
            ...prefixesOfType.map(({ node, prefix }) => ({
              message: `The resource of node '${node}' is only known by its prefix '${prefix}', which cannot be resolved for type '${type}', and is removed.`,
            })),
          );
          return;
        }

        try {
          const result = await resolver.resolve(rootContext, prefixesOfType);
          prefixesOfType.forEach(({ node }) => {
            const id = result.ids.get(node);
            if (id !== undefined) {
              ids.set(node, id);
            }
          });
          warnings.push(...(result.warnings ?? []));
        } catch (error: any) {
          warnings.push({
            message: `The '${type}' resources only known by their prefix could not be resolved, and are removed: ${error.message ?? error}`,
          });
        }
      },
    ),
  );

  return ids;
}

/**
 * Lists the warnings about resources held by several nodes.
 *
 * @param resources The resolved resources, keyed by node ID.
 * @returns The warnings.
 */
function duplicateResourceWarnings(
  resources: ReadonlyMap<string, GraphResolvedResource | null>,
): GraphWarning[] {
  const nodesByResource = Map.groupBy(
    [...resources].flatMap(([node, resource]) =>
      resource ? [{ node, resource }] : [],
    ),
    ({ resource }) => JSON.stringify([resource.type, resource.id]),
  );

  return [...nodesByResource.values()]
    .filter((entries) => entries.length > 1)
    .map((entries) => {
      const [{ resource }] = entries;
      const nodes = entries.map(({ node }) => `'${node}'`).join(', ');
      return {
        message: `The '${resource.type}' resource '${resource.id}' is held by several nodes: ${nodes}. Only the first one is found from the resource.`,
      };
    });
}

/**
 * Resolves the resources of the nodes of a graph, in place.
 * The identifier of each resource is rendered using the configuration of its `scope` project, or of the workspace
 * root, in the environment. Resources only known by a prefix are then resolved by the
 * {@link GraphResourcePrefixResolver} of their type. A resource that cannot be resolved is removed from its node, with a
 * warning, such that the graph only holds identifiers that are valid in the environment.
 *
 * @param graph The graph, whose resources are resolved in place.
 * @param rootContext The context for the workspace root, in the environment.
 * @param projectContexts The contexts of projects, to which those needed to render identifiers are added.
 * @param prefixResolvers The resolvers of resources only known by a prefix.
 * @returns The report of the resolution.
 */
async function resolveGraphResources(
  graph: Graph,
  rootContext: WorkspaceContext,
  projectContexts: ProjectContexts,
  prefixResolvers: readonly GraphResourcePrefixResolver[],
): Promise<GraphResourcesReport> {
  const warnings: GraphWarning[] = [];
  const nodes = listGraphNodes(graph);
  const rendered = await renderResources(
    nodes,
    async (scope) =>
      scope
        ? await getProjectContext(rootContext, projectContexts, scope)
        : rootContext,
    warnings,
  );
  const prefixes = [...rendered].flatMap(
    ([node, resource]): GraphResourcePrefix[] =>
      resource?.idPrefix !== undefined
        ? [{ node, type: resource.type, prefix: resource.idPrefix }]
        : [],
  );
  const ids = await resolvePrefixes(
    rootContext,
    prefixResolvers,
    prefixes,
    warnings,
  );

  const resolved = new Map(
    [...rendered].map(
      ([node, resource]): [string, GraphResolvedResource | null] => {
        const id = resource?.id ?? ids.get(node);
        if (!resource || id === undefined) {
          return [node, null];
        }

        const { type, scope } = resource;
        return [node, { type, id, ...(scope ? { scope } : {}) }];
      },
    ),
  );
  warnings.push(...duplicateResourceWarnings(resolved));

  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  for (const [id, resource] of resolved) {
    const data = nodesById.get(id)?.node.data as Record<string, unknown>;
    if (resource) {
      data.resource = resource;
    } else {
      delete data.resource;
    }
  }

  const removed = [...resolved.values()].filter((r) => !r).length;
  return { resolved: resolved.size - removed, removed, warnings };
}

/**
 * The context passed to the fetchers of environment data and metrics.
 * It exposes the workspace in the environment, the graph with resolved resources, and the evaluation window, and
 * computes the facts fetchers need once, on first use.
 */
export class GraphEnvironmentContext extends GraphFactStore {
  /**
   * The nodes of the graph, keyed by ID.
   */
  private readonly nodesById = new Map<string, GraphNodeEntry>();

  /**
   * The nodes holding a resource, in the order of the graph.
   */
  private readonly resourceEntries: GraphEnvironmentResource[] = [];

  /**
   * The nodes holding a resource, keyed by resource type and then by resource identifier.
   */
  private readonly nodesByResource = new Map<
    string,
    Map<string, GraphNodeEntry>
  >();

  /**
   * Creates a new {@link GraphEnvironmentContext}.
   *
   * @param context The context for the workspace root, in the environment.
   * @param graph The copy of the graph, whose resources are resolved.
   * @param at The end of the evaluation window.
   * @param window The length of the evaluation window, in seconds.
   * @param facts Values for some facts, which are then not computed.
   * @param projectContexts The contexts of projects, in the environment, keyed by the ID of the project node.
   * @param resolution The report of the resolution of the resources of the graph, when it was performed.
   */
  private constructor(
    readonly context: WorkspaceContext,
    readonly graph: Graph,
    readonly at: Date,
    readonly window: number,
    facts: Iterable<[GraphEnvironmentFactType<unknown>, unknown]> = [],
    private readonly projectContexts: ProjectContexts = new Map(),
    readonly resolution?: GraphResourcesReport,
  ) {
    super(facts);
    for (const entry of listGraphNodes(graph)) {
      this.nodesById.set(entry.id, entry);

      const resource = this.resource(entry);
      if (!resource) {
        continue;
      }

      this.resourceEntries.push({ node: entry, resource });
      let nodesById = this.nodesByResource.get(resource.type);
      if (!nodesById) {
        nodesById = new Map();
        this.nodesByResource.set(resource.type, nodesById);
      }
      if (!nodesById.has(resource.id)) {
        nodesById.set(resource.id, entry);
      }
    }
  }

  /**
   * The ID of the environment.
   */
  get environment(): string {
    return this.context.getEnvironmentOrThrow();
  }

  /**
   * The start of the evaluation window.
   */
  get start(): Date {
    return new Date(this.at.getTime() - this.window * 1000);
  }

  /**
   * Returns a node of the graph.
   *
   * @param id The ID of the node.
   * @returns The node, or `undefined` if it does not exist.
   */
  node(id: string): GraphNodeEntry | undefined {
    return this.nodesById.get(id);
  }

  /**
   * Returns the nodes of the given type, or all the nodes of the graph.
   *
   * @param type The type of the nodes. If not set, all nodes are returned.
   * @returns The nodes.
   */
  nodes(type?: string): GraphNodeEntry[] {
    const nodes = [...this.nodesById.values()];
    return type === undefined ? nodes : nodes.filter((n) => n.type === type);
  }

  /**
   * Returns the resource of a node.
   *
   * @param node The node, or its ID.
   * @returns The resource, or `undefined` if the node has none, or if it is not resolved.
   */
  resource(node: string | GraphNodeEntry): GraphResolvedResource | undefined {
    const graphNode = typeof node === 'string' ? this.node(node) : node;
    const resource = graphNode?.node.data?.resource as
      GraphResource | undefined;
    return typeof resource?.id === 'string'
      ? (resource as GraphResolvedResource)
      : undefined;
  }

  /**
   * Returns the nodes holding a resource, along with their resources.
   *
   * @param resourceType The type of the resources. If not set, resources of any type are returned.
   * @param nodeType The type of the nodes. If not set, nodes of any type are returned.
   * @returns The nodes and their resources, in the order of the graph.
   */
  resources(
    resourceType?: string,
    nodeType?: string,
  ): GraphEnvironmentResource[] {
    return this.resourceEntries.filter(
      ({ node, resource }) =>
        (resourceType === undefined || resource.type === resourceType) &&
        (nodeType === undefined || node.type === nodeType),
    );
  }

  /**
   * Returns the node holding a resource.
   * A resource held by several nodes is only found for the first one, and a warning is raised when resources are
   * resolved.
   *
   * @param resourceType The type of the resource.
   * @param id The identifier of the resource.
   * @returns The node, or `undefined` if no node holds the resource.
   */
  resourceNode(resourceType: string, id: string): GraphNodeEntry | undefined {
    return this.nodesByResource.get(resourceType)?.get(id);
  }

  /**
   * Returns the context of a project, in the environment.
   * Contexts are cached for the lifetime of this object.
   *
   * @param projectNodeId The ID of the project node, `project:<directory>`.
   * @returns The context of the project.
   */
  projectContext(projectNodeId: string): Promise<WorkspaceContext> {
    return getProjectContext(this.context, this.projectContexts, projectNodeId);
  }

  /**
   * Creates a {@link GraphEnvironmentContext} for a copy of the graph, in the environment of the given context.
   * The resources of the copy are resolved first, and the report of the resolution is exposed as
   * {@link GraphEnvironmentContext.resolution}. A resource that cannot be resolved is removed from its node, such that
   * the graph only holds identifiers that are valid in the environment.
   *
   * @param context A context in the workspace, with an environment set.
   * @param graph The graph, which should not be enriched with environment data yet. It is not modified.
   * @param options Options for the context.
   * @returns The context.
   */
  static async create(
    context: WorkspaceContext,
    graph: Graph,
    options: GraphEnvironmentContextOptions = {},
  ): Promise<
    GraphEnvironmentContext & { readonly resolution: GraphResourcesReport }
  > {
    if (graph.environment) {
      throw new Error(
        `The graph is already enriched with data from environment '${graph.environment.name}'.`,
      );
    }

    context.getEnvironmentOrThrow();
    const rootContext = await context.clone({
      workingDirectory: context.rootPath,
      processors: null,
      reuseIfUnchanged: true,
    });
    const projectContexts: ProjectContexts = new Map();
    const resolvedGraph = structuredClone(graph);
    const resolution = await resolveGraphResources(
      resolvedGraph,
      rootContext,
      projectContexts,
      options.prefixResolvers ?? [],
    );

    return new GraphEnvironmentContext(
      rootContext,
      resolvedGraph,
      options.at ?? new Date(),
      options.window ?? DEFAULT_GRAPH_ENVIRONMENT_WINDOW,
      options.facts,
      projectContexts,
      resolution,
    ) as GraphEnvironmentContext & {
      readonly resolution: GraphResourcesReport;
    };
  }

  /**
   * Creates a {@link GraphEnvironmentContext} for a copy of a graph that is already enriched with environment data,
   * e.g. to fetch more data about it.
   * The context of the workspace is used as is, and the evaluation window is the one of the graph. The resources of the
   * graph are already resolved, and {@link GraphEnvironmentContext.resolution} is not set.
   *
   * @param context A context in the workspace, which should be in the environment the graph was enriched with.
   * @param graph The enriched graph. It is not modified.
   * @param options Options for the context. The evaluation window is the one of the graph.
   * @returns The context.
   */
  static async forEnrichedGraph(
    context: WorkspaceContext,
    graph: Graph,
    options: Pick<GraphEnvironmentContextOptions, 'facts'> = {},
  ): Promise<GraphEnvironmentContext> {
    if (!graph.environment) {
      throw new Error('The graph is not enriched with environment data.');
    }

    const { at, window } = graph.environment;
    return new GraphEnvironmentContext(
      await context.clone({
        workingDirectory: context.rootPath,
        processors: null,
        reuseIfUnchanged: true,
      }),
      structuredClone(graph),
      at,
      window,
      options.facts,
    );
  }
}
