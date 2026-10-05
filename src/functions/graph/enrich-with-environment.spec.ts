import { WorkspaceContext } from '@causa/workspace';
import { createContext } from '@causa/workspace/testing';
import 'jest-extended';
import { resolve } from 'path';
import { pino } from 'pino';
import {
  GraphEnrichWithEnvironment,
  GraphAlertSeverity,
  GraphGetEnvironmentProvider,
  GraphMetricKind,
  GraphOriginKind,
  type Graph,
  type GraphEnvironmentFetcher,
  type GraphEnvironmentFetcherOutput,
  type GraphEnvironmentProvider,
  type GraphResourcePrefixResolver,
} from '../../definitions/index.js';
import {
  CORE_GRAPH_METRIC_DEFINITIONS,
  GraphEnvironmentFact,
} from '../../graph/index.js';
import { GraphEnrichWithEnvironmentForAll } from './enrich-with-environment.js';

const origin = {
  kind: GraphOriginKind.Declared,
  rule: 'test',
  sources: [{ path: 'causa.yaml' }],
};

const graph: Graph = {
  name: 'shop',
  nodes: {
    infrastructure: {
      service: {
        'domains/ordering/api#ordering-api': {
          name: 'ordering-api',
          origin,
          data: {
            resource: {
              type: 'run.googleapis.com/Service',
              id: "projects/${ configuration('google.project') }/services/ordering-api",
            },
          },
        },
      },
      'google.spanner.instance': {
        main: { name: 'main', origin },
      },
      brokerTopic: {
        'ordering.order.v1': {
          name: 'ordering.order.v1',
          origin,
          data: {
            resource: {
              type: 'pubsub.googleapis.com/Topic',
              id: "projects/${ configuration('google.missing') }/topics/ordering.order.v1",
            },
          },
        },
      },
    },
  },
};

const alert = {
  title: 'Unattached',
  severity: GraphAlertSeverity.Error,
  openedAt: new Date('2026-10-01T11:00:00Z'),
};

const metrics = {
  'google.spanner.instance': {
    nodes: { name: 'Nodes', kind: GraphMetricKind.Gauge, unit: '{node}' },
  },
};

const monitoringFetcher: GraphEnvironmentFetcher = {
  name: 'monitoring',
  description: 'Metrics.',
  fetch: async (environment) => ({
    nodes: {
      'service:domains/ordering/api#ordering-api': {
        data: {
          resolvedId: environment.resource(
            'service:domains/ordering/api#ordering-api',
          )?.id,
          window: [environment.start.toISOString(), environment.window],
        },
        metrics: {
          requests: { value: 2 },
          latency: {
            value: { layout: 'run', count: 1, mean: 4, buckets: { 2: 1 } },
          },
        },
      },
      'google.spanner.instance:main': { metrics: { nodes: { value: 0.1 } } },
      'service:unknown': { data: { unknown: true } },
    },
    bucketLayouts: { run: [1, 2, 4] },
    alerts: [alert],
    warnings: [{ message: '⚠️' }],
  }),
};

const failingFetcher: GraphEnvironmentFetcher = {
  name: 'failing',
  description: 'Fails.',
  fetch: async () => {
    throw new Error('💥');
  },
};

class BrokenFact extends GraphEnvironmentFact<never> {
  compute(): never {
    throw new Error('🔨');
  }
}

const brokenFactFetcher: GraphEnvironmentFetcher = {
  name: 'brokenFact',
  description: 'Depends on a broken fact.',
  fetch: async (environment) => {
    await environment.get(BrokenFact);
    return {};
  },
};

let fetchers: GraphEnvironmentFetcher[];
let prefixResolvers: GraphResourcePrefixResolver[];

function fetcherOf(
  name: string,
  output: GraphEnvironmentFetcherOutput,
): GraphEnvironmentFetcher {
  return { name, description: `${name}.`, fetch: async () => output };
}

class Provider extends GraphGetEnvironmentProvider {
  _call(): GraphEnvironmentProvider {
    return { metrics, prefixResolvers, fetchers };
  }

  _supports(): boolean {
    return true;
  }
}

class FailingProvider extends GraphGetEnvironmentProvider {
  _call(): GraphEnvironmentProvider {
    throw new Error('🙅');
  }

  _supports(): boolean {
    return true;
  }
}

describe('GraphEnrichWithEnvironmentForAll', () => {
  const rootPath = resolve('/workspace');
  let context: WorkspaceContext;

  beforeEach(() => {
    fetchers = [monitoringFetcher, failingFetcher, brokenFactFetcher];
    prefixResolvers = [];
    ({ context } = createContext({
      workingDirectory: rootPath,
      rootPath,
      environment: 'prod',
      configuration: {
        workspace: { name: 'shop' },
        google: { project: 'prod-project' },
      },
      logger: pino({ level: 'silent' }),
      functions: [GraphEnrichWithEnvironmentForAll, Provider, FailingProvider],
    }));
  });

  it('should run the fetchers and merge their outputs', async () => {
    const actualResult = await context.call(GraphEnrichWithEnvironment, {
      graph,
      at: new Date('2026-10-01T12:00:00Z'),
      window: 60,
    });

    expect(actualResult.graph).toEqual({
      name: 'shop',
      nodes: {
        infrastructure: {
          service: {
            'domains/ordering/api#ordering-api': {
              name: 'ordering-api',
              origin,
              data: {
                resource: {
                  type: 'run.googleapis.com/Service',
                  id: 'projects/prod-project/services/ordering-api',
                },
                resolvedId: 'projects/prod-project/services/ordering-api',
                window: ['2026-10-01T11:59:00.000Z', 60],
              },
              metrics: {
                requests: { value: 2 },
                latency: {
                  value: {
                    layout: 'run',
                    count: 1,
                    mean: 4,
                    buckets: { 2: 1 },
                  },
                },
              },
            },
          },
          'google.spanner.instance': {
            main: { name: 'main', origin, metrics: { nodes: { value: 0.1 } } },
          },
          brokerTopic: {
            'ordering.order.v1': {
              name: 'ordering.order.v1',
              origin,
              data: {},
            },
          },
        },
      },
      environment: {
        name: 'prod',
        at: new Date('2026-10-01T12:00:00Z'),
        window: 60,
        alerts: [alert],
      },
      metrics: {
        service: {
          requests: CORE_GRAPH_METRIC_DEFINITIONS.service.requests,
          latency: CORE_GRAPH_METRIC_DEFINITIONS.service.latency,
        },
        'google.spanner.instance': {
          nodes: { name: 'Nodes', kind: 'gauge', unit: '{node}' },
        },
      },
      bucketLayouts: { run: [1, 2, 4] },
    });
    expect(actualResult.fetchers).toEqual([
      {
        name: 'monitoring',
        description: 'Metrics.',
        nodes: 3,
        warnings: [
          { message: '⚠️' },
          {
            message: "The node 'service:unknown' does not exist in the graph.",
          },
        ],
      },
      { name: 'failing', description: 'Fails.', nodes: 0, warnings: [] },
      {
        name: 'brokenFact',
        description: 'Depends on a broken fact.',
        nodes: 0,
        warnings: [],
      },
    ]);
    expect(actualResult.resources).toEqual({
      resolved: 1,
      removed: 1,
      warnings: [
        {
          message: expect.toStartWith(
            "The resource of node 'brokerTopic:ordering.order.v1' could not be resolved, and is removed: ",
          ),
        },
      ],
    });
    expect(actualResult.facts).toEqual([]);
    expect(actualResult.failures).toEqual([
      { name: 'FailingProvider', message: '🙅' },
      { name: 'BrokenFact', message: '🔨' },
      { name: 'failing', message: '💥' },
    ]);
    expect(
      graph.nodes?.infrastructure?.service?.[
        'domains/ordering/api#ordering-api'
      ].metrics,
    ).toBeUndefined();
  });

  it('should replace the keys of the nodes data, and only keep the referenced bucket layouts', async () => {
    const service = 'service:domains/ordering/api#ordering-api';
    const resource = { type: 'run.googleapis.com/Service', id: '🔁' };
    fetchers = [
      fetcherOf('links', {
        nodes: { [service]: { data: { links: [{ label: '🔗', url: '🌐' }] } } },
      }),
      fetcherOf('deployment', {
        nodes: {
          [service]: {
            data: { resource, deployment: { image: 'ordering:1.0.0' } },
            metrics: {
              latency: {
                value: { layout: 'run', count: 1, mean: 4, buckets: { 2: 1 } },
              },
            },
          },
        },
        bucketLayouts: { run: [1, 2, 4], unused: [1] },
      }),
    ];

    const actualResult = await context.call(GraphEnrichWithEnvironment, {
      graph,
    });

    expect(
      actualResult.graph.nodes?.infrastructure?.service?.[
        'domains/ordering/api#ordering-api'
      ].data,
    ).toEqual({
      resource,
      links: [{ label: '🔗', url: '🌐' }],
      deployment: { image: 'ordering:1.0.0' },
    });
    expect(actualResult.graph.bucketLayouts).toEqual({ run: [1, 2, 4] });
  });

  it('should keep the first value of data keys returned by several fetchers', async () => {
    const service = 'service:domains/ordering/api#ordering-api';
    fetchers = [
      fetcherOf('first', {
        nodes: { [service]: { data: { links: [{ label: '1️⃣', url: '🌐' }] } } },
      }),
      fetcherOf('second', {
        nodes: {
          [service]: {
            data: {
              links: [{ label: '2️⃣', url: '🌐' }],
              deployment: { image: 'ordering:1.0.0' },
            },
          },
        },
      }),
    ];

    const actualResult = await context.call(GraphEnrichWithEnvironment, {
      graph,
    });

    expect(
      actualResult.graph.nodes?.infrastructure?.service?.[
        'domains/ordering/api#ordering-api'
      ].data,
    ).toEqual({
      resource: {
        type: 'run.googleapis.com/Service',
        id: 'projects/prod-project/services/ordering-api',
      },
      links: [{ label: '1️⃣', url: '🌐' }],
      deployment: { image: 'ordering:1.0.0' },
    });
    expect(actualResult.fetchers).toEqual([
      { name: 'first', description: 'first.', nodes: 1, warnings: [] },
      {
        name: 'second',
        description: 'second.',
        nodes: 1,
        warnings: [
          {
            message: `The data 'links' of '${service}' was already returned by fetcher 'first', and is ignored.`,
          },
        ],
      },
    ]);
  });

  it('should list the alerts of nodes returned by all fetchers', async () => {
    const service = 'service:domains/ordering/api#ordering-api';
    const opened = (title: string, openedAt: string) => ({
      title,
      openedAt: new Date(openedAt),
    });
    fetchers = [
      fetcherOf('monitoring', {
        nodes: {
          [service]: {
            alerts: [opened('High latency', '2026-10-01T11:00:00Z')],
          },
        },
        alerts: [opened('Unattached', '2026-10-01T10:00:00Z')],
      }),
      fetcherOf('errors', {
        nodes: {
          [service]: {
            data: { alerts: [opened('Ignored', '2026-10-01T09:00:00Z')] },
            alerts: [
              opened('TypeError', '2026-10-01T11:30:00Z'),
              opened('RangeError', '2026-10-01T10:30:00Z'),
            ],
          },
        },
        alerts: [opened('Also unattached', '2026-10-01T09:00:00Z')],
      }),
    ];

    const actualResult = await context.call(GraphEnrichWithEnvironment, {
      graph,
    });

    expect(
      actualResult.graph.nodes?.infrastructure?.service?.[
        'domains/ordering/api#ordering-api'
      ].data,
    ).toEqual({
      resource: {
        type: 'run.googleapis.com/Service',
        id: 'projects/prod-project/services/ordering-api',
      },
      alerts: [
        opened('RangeError', '2026-10-01T10:30:00Z'),
        opened('High latency', '2026-10-01T11:00:00Z'),
        opened('TypeError', '2026-10-01T11:30:00Z'),
      ],
    });
    expect(actualResult.graph.environment?.alerts).toEqual([
      opened('Also unattached', '2026-10-01T09:00:00Z'),
      opened('Unattached', '2026-10-01T10:00:00Z'),
    ]);
    expect(actualResult.fetchers).toEqual([
      {
        name: 'monitoring',
        description: 'monitoring.',
        nodes: 1,
        warnings: [],
      },
      {
        name: 'errors',
        description: 'errors.',
        nodes: 1,
        warnings: [
          {
            message: `The data 'alerts' of '${service}' should be returned as the node's alerts, and is ignored.`,
          },
        ],
      },
    ]);
  });

  it('should resolve resources only known by a prefix using the resolvers of the providers', async () => {
    fetchers = [
      {
        name: 'queues',
        description: 'Queues.',
        fetch: async (environment) => ({
          nodes: {
            'queue:order-expiration': {
              data: {
                resolved: environment.resource('queue:order-expiration'),
              },
            },
          },
        }),
      },
    ];
    prefixResolvers = [
      {
        resourceType: 'cloudtasks.googleapis.com/Queue',
        resolve: async (_, prefixes) => ({
          ids: new Map(prefixes.map((p) => [p.node, `${p.prefix}abc`])),
        }),
      },
    ];
    const queueGraph: Graph = {
      nodes: {
        infrastructure: {
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
    };

    const actualResult = await context.call(GraphEnrichWithEnvironment, {
      graph: queueGraph,
    });

    const resource = {
      type: 'cloudtasks.googleapis.com/Queue',
      id: 'projects/prod-project/queues/order-expiration-abc',
    };
    expect(
      actualResult.graph.nodes?.infrastructure?.queue?.['order-expiration']
        .data,
    ).toEqual({ resource, resolved: resource });
    expect(actualResult.resources).toEqual({
      resolved: 1,
      removed: 0,
      warnings: [],
    });
  });

  it('should skip undefined metrics, unknown or conflicting layouts, and duplicate metrics', async () => {
    const service = 'service:domains/ordering/api#ordering-api';
    fetchers = [
      fetcherOf('first', {
        nodes: {
          [service]: {
            metrics: {
              requests: { value: 1 },
              undefinedMetric: { value: 2 },
              latency: { value: { layout: 'missing', count: 0, buckets: {} } },
            },
          },
        },
        bucketLayouts: { run: [10] },
      }),
      fetcherOf('second', {
        nodes: { [service]: { metrics: { requests: { value: 2 } } } },
        bucketLayouts: { run: [20] },
      }),
    ];

    const actualResult = await context.call(GraphEnrichWithEnvironment, {
      graph,
    });

    expect(
      actualResult.graph.nodes?.infrastructure?.service?.[
        'domains/ordering/api#ordering-api'
      ].metrics,
    ).toEqual({ requests: { value: 1 } });
    expect(actualResult.graph.metrics).toEqual({
      service: { requests: CORE_GRAPH_METRIC_DEFINITIONS.service.requests },
    });
    expect(actualResult.graph.bucketLayouts).toEqual({});
    expect(actualResult.fetchers).toEqual([
      {
        name: 'first',
        description: 'first.',
        nodes: 1,
        warnings: [
          {
            message: `The metric 'undefinedMetric' of '${service}' has no definition for type 'service', and is ignored.`,
          },
          {
            message: `The metric 'latency' of '${service}' references the unknown bucket layout 'missing', and is ignored.`,
          },
        ],
      },
      {
        name: 'second',
        description: 'second.',
        nodes: 1,
        warnings: [
          {
            message:
              "The bucket layout 'run' differs from an existing one with the same name, and is ignored.",
          },
          {
            message: `The metric 'requests' of '${service}' was already returned by another fetcher, and is ignored.`,
          },
        ],
      },
    ]);
  });

  it('should throw for a graph that is already enriched', async () => {
    const actualPromise = context.call(GraphEnrichWithEnvironment, {
      graph: {
        ...graph,
        environment: { name: 'prod', at: new Date(), window: 300 },
      },
    });

    await expect(actualPromise).rejects.toThrow(
      "The graph is already enriched with data from environment 'prod'.",
    );
  });

  it('should default the window', async () => {
    fetchers = [];

    const actualResult = await context.call(GraphEnrichWithEnvironment, {
      graph,
    });

    expect(actualResult.graph.environment).toEqual({
      name: 'prod',
      at: expect.any(Date),
      window: 300,
    });
  });

  it('should throw for an invalid end of the window', async () => {
    const actualPromise = context.call(GraphEnrichWithEnvironment, {
      graph,
      at: '🕰️' as any,
    });

    await expect(actualPromise).rejects.toThrow(
      'The end of the evaluation window is not a valid date.',
    );
  });
});
