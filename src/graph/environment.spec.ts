import { WorkspaceContext } from '@causa/workspace';
import { createContext } from '@causa/workspace/testing';
import { jest } from '@jest/globals';
import 'jest-extended';
import { resolve } from 'path';
import { pino } from 'pino';
import {
  GraphOriginKind,
  type Graph,
  type GraphResourcePrefixResolver,
} from '../definitions/index.js';
import {
  DEFAULT_GRAPH_ENVIRONMENT_WINDOW,
  GraphEnvironmentContext,
  GraphEnvironmentFact,
} from './environment.js';

class NodeCountFact extends GraphEnvironmentFact<number> {
  static computed = 0;

  compute(environment: GraphEnvironmentContext) {
    NodeCountFact.computed += 1;
    return {
      value: environment.nodes().length,
      warnings: [{ message: '🔢' }],
    };
  }
}

const origin = {
  kind: GraphOriginKind.Declared,
  rule: 'test',
  sources: [{ path: 'causa.yaml' }],
};

const graph: Graph = {
  name: 'shop',
  nodes: {
    architecture: {
      project: {
        'domains/ordering/api': { name: 'ordering-api', origin },
      },
    },
    infrastructure: {
      service: {
        'domains/ordering/api#ordering-api': {
          name: 'ordering-api',
          origin,
          data: {
            platform: 'google.cloudRun',
            resource: {
              type: 'run.googleapis.com/Service',
              id: "projects/${ configuration('google.project') }/locations/${ configuration('google.region') }/services/ordering-api",
              scope: 'project:domains/ordering/api',
            },
          },
        },
      },
      brokerTopic: {
        'ordering.order.v1': {
          name: 'ordering.order.v1',
          origin,
          data: {
            resource: {
              type: 'pubsub.googleapis.com/Topic',
              id: "projects/${ configuration('google.project') }/topics/ordering.order.v1",
            },
          },
        },
        'ordering.missing.v1': {
          name: 'ordering.missing.v1',
          origin,
          data: {
            resource: {
              type: 'pubsub.googleapis.com/Topic',
              id: "projects/${ configuration('google.missing') }/topics/ordering.missing.v1",
            },
          },
        },
      },
      queue: {
        'order-expiration': {
          name: 'order-expiration',
          origin,
          data: {
            resource: {
              type: 'cloudtasks.googleapis.com/Queue',
              idPrefix:
                "projects/${ configuration('google.project') }/queues/order-expiration-",
            },
          },
        },
      },
    },
  },
  edges: {
    realizes: [
      {
        from: 'service:domains/ordering/api#ordering-api',
        to: 'project:domains/ordering/api',
        origin,
      },
    ],
  },
};

const resolvedGraph: Graph = (() => {
  const resolved = structuredClone(graph);
  const { service, brokerTopic, queue } = resolved.nodes!.infrastructure!;
  service!['domains/ordering/api#ordering-api'].data!.resource.id =
    'projects/prod-project/locations/europe-west1/services/ordering-api';
  brokerTopic!['ordering.order.v1'].data!.resource.id =
    'projects/prod-project/topics/ordering.order.v1';
  delete brokerTopic!['ordering.missing.v1'].data!.resource;
  queue!['order-expiration'].data!.resource = {
    type: 'cloudtasks.googleapis.com/Queue',
    id: 'projects/prod-project/queues/order-expiration-abc',
  };
  return resolved;
})();

const queueResolver: GraphResourcePrefixResolver = {
  resourceType: 'cloudtasks.googleapis.com/Queue',
  resolve: async (_, prefixes) => ({
    ids: new Map(prefixes.map(({ node, prefix }) => [node, `${prefix}abc`])),
  }),
};

describe('GraphEnvironmentContext', () => {
  const rootPath = resolve('/workspace');
  let context: WorkspaceContext;
  let projectContext: WorkspaceContext;

  beforeEach(() => {
    ({ context } = createContext({
      workingDirectory: rootPath,
      rootPath,
      environment: 'prod',
      configuration: {
        workspace: { name: 'shop' },
        google: { project: 'prod-project' },
      },
      logger: pino({ level: 'silent' }),
    }));
    ({ context: projectContext } = createContext({
      workingDirectory: resolve(rootPath, 'domains/ordering/api'),
      rootPath,
      environment: 'prod',
      configuration: {
        workspace: { name: 'shop' },
        google: { project: 'prod-project', region: 'europe-west1' },
      },
      logger: pino({ level: 'silent' }),
    }));
    const clone = context.clone.bind(context);
    jest
      .spyOn(context, 'clone')
      // The context for the workspace root is reused, while project contexts are mocked.
      .mockImplementation(async (options) =>
        options?.workingDirectory === rootPath
          ? await clone(options)
          : projectContext,
      );
  });

  describe('create', () => {
    it('should create a context for a copy of the graph and resolve its resources', async () => {
      const at = new Date('2026-10-01T12:00:00Z');

      const environment = await GraphEnvironmentContext.create(context, graph, {
        at,
        window: 60,
        prefixResolvers: [queueResolver],
      });

      expect(environment).toEqual(
        expect.objectContaining({
          context,
          graph: resolvedGraph,
          at,
          window: 60,
          start: new Date('2026-10-01T11:59:00Z'),
          environment: 'prod',
          resolution: {
            resolved: 3,
            removed: 1,
            warnings: [
              {
                message: expect.toStartWith(
                  "The resource of node 'brokerTopic:ordering.missing.v1' could not be resolved, and is removed: ",
                ),
              },
            ],
          },
          facts: [],
        }),
      );
      expect(context.clone).toHaveBeenCalledWith({
        workingDirectory: resolve(rootPath, 'domains/ordering/api'),
      });
      expect(
        graph.nodes?.infrastructure?.brokerTopic?.['ordering.order.v1'].data
          ?.resource.id,
      ).toEqual(
        "projects/${ configuration('google.project') }/topics/ordering.order.v1",
      );
    });

    it('should remove resources only known by a prefix that cannot be resolved', async () => {
      const prefixGraph = structuredClone(graph);
      prefixGraph.nodes!.infrastructure!.queue!['order-expiration-v2'] = {
        name: 'order-expiration-v2',
        origin,
        data: {
          resource: {
            type: 'cloudtasks.googleapis.com/Queue',
            idPrefix: 'projects/prod-project/queues/order-expiration-v2-',
            scope: 'project:domains/ordering/api',
          },
        },
      };
      prefixGraph.nodes!.infrastructure!.brokerTopic![
        'ordering.order.v1'
      ].data!.resource.idPrefix =
        'projects/prod-project/topics/ordering.order.v1-';
      delete prefixGraph.nodes!.infrastructure!.brokerTopic![
        'ordering.order.v1'
      ].data!.resource.id;
      const partialResolver: GraphResourcePrefixResolver = {
        resourceType: 'cloudtasks.googleapis.com/Queue',
        resolve: async (_, prefixes) => ({
          ids: new Map([[prefixes[1].node, `${prefixes[1].prefix}def`]]),
          warnings: [{ message: '🔍' }],
        }),
      };

      const environment = await GraphEnvironmentContext.create(
        context,
        prefixGraph,
        { prefixResolvers: [partialResolver, queueResolver] },
      );

      expect(environment.resource('queue:order-expiration')).toBeUndefined();
      expect(environment.resource('queue:order-expiration-v2')).toEqual({
        type: 'cloudtasks.googleapis.com/Queue',
        id: 'projects/prod-project/queues/order-expiration-v2-def',
        scope: 'project:domains/ordering/api',
      });
      expect(
        environment.resource('brokerTopic:ordering.order.v1'),
      ).toBeUndefined();
      expect(
        environment.graph.nodes?.infrastructure?.queue?.['order-expiration']
          .data,
      ).toEqual({});
      expect(environment.resolution).toEqual({
        resolved: 2,
        removed: 3,
        warnings: expect.toIncludeSameMembers([
          { message: expect.stringContaining('ordering.missing.v1') },
          {
            message:
              "Several resolvers are defined for the resource type 'cloudtasks.googleapis.com/Queue'. The first one is used.",
          },
          { message: '🔍' },
          {
            message:
              "The resource of node 'brokerTopic:ordering.order.v1' is only known by its prefix 'projects/prod-project/topics/ordering.order.v1-', which cannot be resolved for type 'pubsub.googleapis.com/Topic', and is removed.",
          },
        ]),
      });
    });

    it('should remove resources whose resolver throws', async () => {
      const failingResolver: GraphResourcePrefixResolver = {
        resourceType: 'cloudtasks.googleapis.com/Queue',
        resolve: async () => {
          throw new Error('💥');
        },
      };

      const environment = await GraphEnvironmentContext.create(context, graph, {
        prefixResolvers: [failingResolver],
      });

      expect(environment.resource('queue:order-expiration')).toBeUndefined();
      expect(environment.resolution).toEqual({
        resolved: 2,
        removed: 2,
        warnings: expect.arrayContaining([
          {
            message:
              "The 'cloudtasks.googleapis.com/Queue' resources only known by their prefix could not be resolved, and are removed: 💥",
          },
        ]),
      });
    });

    it('should warn about resources held by several nodes', async () => {
      const duplicateGraph = structuredClone(resolvedGraph);
      duplicateGraph.nodes!.infrastructure!.brokerTopic!['ordering.copy.v1'] = {
        name: 'ordering.copy.v1',
        origin,
        data: {
          resource: {
            type: 'pubsub.googleapis.com/Topic',
            id: 'projects/prod-project/topics/ordering.order.v1',
          },
        },
      };

      const environment = await GraphEnvironmentContext.create(
        context,
        duplicateGraph,
      );

      expect(environment.resolution).toEqual({
        resolved: 4,
        removed: 0,
        warnings: [
          {
            message:
              "The 'pubsub.googleapis.com/Topic' resource 'projects/prod-project/topics/ordering.order.v1' is held by several nodes: 'brokerTopic:ordering.order.v1', 'brokerTopic:ordering.copy.v1'. Only the first one is found from the resource.",
          },
        ],
      });
      expect(
        environment.resourceNode(
          'pubsub.googleapis.com/Topic',
          'projects/prod-project/topics/ordering.order.v1',
        )?.id,
      ).toEqual('brokerTopic:ordering.order.v1');
    });

    it('should render resolved resources unchanged', async () => {
      const environment = await GraphEnvironmentContext.create(
        context,
        resolvedGraph,
      );

      expect(environment).toEqual(
        expect.objectContaining({
          graph: resolvedGraph,
          resolution: { resolved: 3, removed: 0, warnings: [] },
        }),
      );
    });

    it('should throw for a graph that is already enriched', async () => {
      const enrichedGraph: Graph = {
        ...graph,
        environment: { name: 'prod', at: new Date(), window: 300 },
      };

      const actualPromise = GraphEnvironmentContext.create(
        context,
        enrichedGraph,
      );

      await expect(actualPromise).rejects.toThrow(
        "The graph is already enriched with data from environment 'prod'.",
      );
    });

    it('should throw when the context has no environment', async () => {
      const { context: noEnvironmentContext } = createContext({
        workingDirectory: rootPath,
        rootPath,
        environment: null,
        logger: pino({ level: 'silent' }),
      });

      const actualPromise = GraphEnvironmentContext.create(
        noEnvironmentContext,
        graph,
      );

      await expect(actualPromise).rejects.toThrow(
        'The current context does not have an environment set.',
      );
    });

    it('should default the window', async () => {
      const before = Date.now();

      const environment = await GraphEnvironmentContext.create(context, graph);

      const after = Date.now();
      expect(environment).toEqual(
        expect.objectContaining({
          at: expect.toBeBetween(new Date(before), new Date(after)),
          window: DEFAULT_GRAPH_ENVIRONMENT_WINDOW,
        }),
      );
    });

    it('should clone the context for the root', async () => {
      const { context: otherContext } = createContext({
        workingDirectory: resolve(rootPath, 'domains'),
        rootPath,
        environment: 'prod',
        logger: pino({ level: 'silent' }),
      });
      jest.spyOn(otherContext, 'clone').mockResolvedValue(context);

      const environment = await GraphEnvironmentContext.create(
        otherContext,
        graph,
      );

      expect(environment).toEqual(expect.objectContaining({ context }));
      expect(otherContext.clone).toHaveBeenCalledExactlyOnceWith({
        workingDirectory: rootPath,
        processors: null,
        reuseIfUnchanged: true,
      });
    });
  });

  describe('forEnrichedGraph', () => {
    const enrichedGraph: Graph = {
      ...resolvedGraph,
      environment: {
        name: 'prod',
        at: new Date('2026-10-01T12:00:00Z'),
        window: 60,
      },
    };

    it('should create a context for a copy of the graph, with its evaluation window', async () => {
      const environment = await GraphEnvironmentContext.forEnrichedGraph(
        context,
        enrichedGraph,
      );

      expect(
        environment.resourceNode(
          'cloudtasks.googleapis.com/Queue',
          'projects/prod-project/queues/order-expiration-abc',
        )?.id,
      ).toEqual('queue:order-expiration');

      expect(environment).toEqual(
        expect.objectContaining({
          context,
          graph: enrichedGraph,
          at: new Date('2026-10-01T12:00:00Z'),
          window: 60,
          resolution: undefined,
          facts: [],
        }),
      );
      expect(environment.graph).not.toBe(enrichedGraph);
      expect(environment.context).toBe(context);
    });

    it('should throw for a graph that is not enriched', async () => {
      const actualPromise = GraphEnvironmentContext.forEnrichedGraph(
        context,
        resolvedGraph,
      );

      await expect(actualPromise).rejects.toThrow(
        'The graph is not enriched with environment data.',
      );
    });
  });

  describe('facts', () => {
    beforeEach(() => {
      NodeCountFact.computed = 0;
    });

    it('should compute facts once and report them', async () => {
      const environment = await GraphEnvironmentContext.create(context, graph);

      const actualValues = await Promise.all([
        environment.get(NodeCountFact),
        environment.get(NodeCountFact),
      ]);

      expect(actualValues).toEqual([5, 5]);
      expect(NodeCountFact.computed).toEqual(1);
      expect(environment.facts).toEqual([
        { name: 'NodeCountFact', warnings: [{ message: '🔢' }] },
      ]);
    });

    it('should use the values of the given facts', async () => {
      const environment = await GraphEnvironmentContext.create(context, graph, {
        facts: [[NodeCountFact, 42]],
      });

      const actualValue = await environment.get(NodeCountFact);

      expect(actualValue).toEqual(42);
      expect(NodeCountFact.computed).toEqual(0);
      expect(environment.facts).toEqual([]);
    });
  });

  describe('accessors', () => {
    let environment: GraphEnvironmentContext;

    beforeEach(async () => {
      environment = await GraphEnvironmentContext.create(context, graph, {
        prefixResolvers: [queueResolver],
      });
    });

    it('should return nodes by type', () => {
      const actualNodes = environment.nodes('brokerTopic');

      expect(actualNodes).toEqual([
        {
          id: 'brokerTopic:ordering.order.v1',
          layer: 'infrastructure',
          type: 'brokerTopic',
          locator: 'ordering.order.v1',
          node: expect.objectContaining({ name: 'ordering.order.v1' }),
        },
        {
          id: 'brokerTopic:ordering.missing.v1',
          layer: 'infrastructure',
          type: 'brokerTopic',
          locator: 'ordering.missing.v1',
          node: expect.objectContaining({ name: 'ordering.missing.v1' }),
        },
      ]);
    });

    it('should return all nodes', () => {
      const actualIds = environment.nodes().map((n) => n.id);

      expect(actualIds).toEqual([
        'project:domains/ordering/api',
        'service:domains/ordering/api#ordering-api',
        'brokerTopic:ordering.order.v1',
        'brokerTopic:ordering.missing.v1',
        'queue:order-expiration',
      ]);
    });

    it('should not return unresolved or missing resources', () => {
      expect(
        environment.resource('brokerTopic:ordering.missing.v1'),
      ).toBeUndefined();
      expect(
        environment.resource('project:domains/ordering/api'),
      ).toBeUndefined();
      expect(environment.resource('project:unknown')).toBeUndefined();
      expect(environment.resource('queue:order-expiration')).toEqual({
        type: 'cloudtasks.googleapis.com/Queue',
        id: 'projects/prod-project/queues/order-expiration-abc',
      });
    });

    it('should return the nodes holding resources', () => {
      const actualAll = environment.resources().map(({ node }) => node.id);
      const actualTopics = environment.resources('pubsub.googleapis.com/Topic');
      const actualOfNodeType = environment.resources(undefined, 'service');
      const actualNone = environment.resources(
        'pubsub.googleapis.com/Topic',
        'service',
      );

      expect(actualAll).toEqual([
        'service:domains/ordering/api#ordering-api',
        'brokerTopic:ordering.order.v1',
        'queue:order-expiration',
      ]);
      expect(actualTopics).toEqual([
        {
          node: expect.objectContaining({
            id: 'brokerTopic:ordering.order.v1',
          }),
          resource: {
            type: 'pubsub.googleapis.com/Topic',
            id: 'projects/prod-project/topics/ordering.order.v1',
          },
        },
      ]);
      expect(actualOfNodeType.map(({ node }) => node.id)).toEqual([
        'service:domains/ordering/api#ordering-api',
      ]);
      expect(actualNone).toBeEmpty();
    });

    it('should return the node holding a resource', () => {
      expect(
        environment.resourceNode(
          'run.googleapis.com/Service',
          'projects/prod-project/locations/europe-west1/services/ordering-api',
        )?.id,
      ).toEqual('service:domains/ordering/api#ordering-api');
      expect(
        environment.resourceNode(
          'pubsub.googleapis.com/Subscription',
          'projects/prod-project/topics/ordering.order.v1',
        ),
      ).toBeUndefined();
      expect(
        environment.resourceNode('pubsub.googleapis.com/Topic', 'unknown'),
      ).toBeUndefined();
    });

    it('should cache project contexts', async () => {
      const first = await environment.projectContext(
        'project:domains/ordering/api',
      );
      const second = await environment.projectContext(
        'project:domains/ordering/api',
      );

      expect(first).toBe(projectContext);
      expect(second).toBe(projectContext);
      // Once for the workspace root, and once for the project.
      expect(context.clone).toHaveBeenCalledTimes(2);
    });
  });
});
