import { loadWorkspaceConfiguration, WorkspaceContext } from '@causa/workspace';
import { createContext, registerMockFunction } from '@causa/workspace/testing';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import 'jest-extended';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { pino } from 'pino';
import {
  ModelSchemaExtractDatabase,
  type Graph,
  type SchemaDatabase,
} from '../../definitions/index.js';
import { EventTopicListForAll } from '../../functions/event-topic/index.js';
import { ModelSchemaParseForJsonSchema } from '../../functions/model/index.js';
import { GraphContext } from '../context.js';
import { buildGraph } from '../merge.js';
import { runGraphRules } from '../rule.js';
import { CORE_GRAPH_RULES } from './index.js';

const FIXTURE: Record<string, string> = {
  'causa.yaml': `
workspace:
  name: shop
model:
  schema: jsonschema
  globs:
    - domains/*/entities/*.yaml
    - domains/*/events/**/*.yaml
events:
  topics:
    globs: [domains/*/events/*/v*.yaml]
    regularExpression: ^domains\\/(?<domain>[\\w-]+)\\/events\\/(?<topic>[\\w-]+)\\/(?<version>v\\d+)\\.yaml$
    format: \${ domain }.\${ topic }.\${ version }
`,
  'domains/ordering/causa.yaml': `
domain:
  name: Ordering
  description: Orders placed by customers.
`,
  'domains/ordering/api/causa.yaml': `
project:
  name: ordering-api
  type: serviceContainer
  language: typescript
openApi:
  specifications: [openapi.yaml]
serviceContainer:
  triggers:
    onOrder:
      type: event
      topic: ordering.order.v1
      endpoint: { type: http, path: /events/order }
    onUnknown:
      type: event
      topic: unknown.topic.v1
      endpoint: { type: http, path: /events/unknown }
    processOrder:
      type: task
      queue: process-order
      endpoint: { type: http, path: /tasks/order }
  outputs:
    eventTopics: [ordering.order.v1]
`,
  'domains/ordering/api/openapi.yaml': `
openapi: 3.0.0
info: { title: Ordering, version: 1.0.0 }
security: [{ auth: [] }]
paths:
  /orders:
    post:
      operationId: orderCreate
      summary: Creates an order.
    get:
      operationId: orderList
      summary: Lists orders.
      security: []
`,
  'domains/ordering/worker/causa.yaml': `
project:
  name: ordering-worker
  type: serviceContainer
  language: typescript
openApi:
  specifications: [openapi.yaml]
  global:
    security: [{ auth: [] }]
serviceContainer:
  triggers:
    noTopic:
      type: event
      endpoint: { type: http, path: /events/none }
  outputs:
    eventTopics: [unknown.topic.v1]
`,
  'domains/ordering/functions/causa.yaml': `
project:
  name: ordering-functions
  type: serverlessFunctions
  language: typescript
serviceContainer:
  triggers:
    ignored:
      type: task
      endpoint: { type: http, path: /tasks/ignored }
  outputs:
    eventTopics: [ordering.order.v1]
`,
  'domains/ordering/worker/openapi.yaml': `
openapi: 3.0.0
info: { title: Worker, version: 1.0.0 }
paths:
  /orders:
    post:
      operationId: orderCreate
  /status:
    get:
      operationId: workerStatus
    put:
      summary: Has no operation ID.
`,
  'domains/ordering/entities/order.yaml': `
title: Order
type: object
description: An order.
properties:
  id:
    type: string
`,
  'domains/ordering/entities/placed-order.yaml': `
title: PlacedOrder
type: object
description: An order that has been placed.
causa:
  constraintFor: ./order.yaml
properties:
  id:
    type: string
`,
  'domains/ordering/entities/shipped-order.yaml': `
title: ShippedOrder
type: object
causa:
  constraintFor: ./order.yaml
properties:
  id:
    type: string
`,
  'domains/ordering/entities/order-summary.yaml': `
title: OrderSummary
type: object
causa:
  projectionOf: ./order.yaml
  testTable: orderSummaries
properties:
  id:
    type: string
`,
  'domains/ordering/entities/note.yaml': `
title: Note
type: object
properties:
  text:
    type: string
`,
  'domains/ordering/entities/report.yaml': `
title: Report
type: object
causa:
  projectionOf: ./note.yaml
  testTable: reports
properties:
  id:
    type: string
`,
  'domains/ordering/events/order/v1.yaml': `
title: OrderEvent
type: object
description: An event about an order.
properties:
  name:
    type: string
  data:
    $ref: ../../entities/order.yaml
`,
  'domains/ordering/events/ping/v1.yaml': `
title: PingEvent
type: object
properties:
  name:
    type: string
`,
  'domains/ordering/events/constraints/order-placed.yaml': `
title: OrderPlaced
type: object
description: The order is placed.
causa:
  constraintFor: ../order/v1.yaml
  entityMutationFrom: [null]
  entityPropertyChanges: '*'
properties:
  name:
    const: orderPlaced
  data:
    $ref: ../../entities/placed-order.yaml
`,
  'domains/ordering/events/constraints/order-shipped.yaml': `
title: OrderShipped
type: object
causa:
  constraintFor: ../order/v1.yaml
  entityMutationFrom:
    - ../../entities/placed-order.yaml
    - ../../entities/order.yaml
properties:
  name:
    const: orderShipped
  data:
    $ref: ../../entities/shipped-order.yaml
`,
  'domains/ordering/events/constraints/order-updated.yaml': `
title: OrderUpdated
type: object
causa:
  constraintFor: ../order/v1.yaml
  entityMutationFrom: [null]
properties:
  data:
    $ref: ../../entities/order.yaml
`,
  'domains/ordering/events/constraints/order-cancelled.yaml': `
title: OrderCancelled
type: object
causa:
  constraintFor: ../order/v1.yaml
  entityMutationFrom: [null]
properties:
  data:
    $ref: ../../entities/note.yaml
`,
};

function summarize(graph: Graph) {
  const nodes = Object.entries(graph.nodes ?? {}).flatMap(([layer, byType]) =>
    Object.entries(byType ?? {}).flatMap(([type, byLocator]) =>
      Object.keys(byLocator as object).map((l) => `${layer} ${type}:${l}`),
    ),
  );
  const edges = Object.entries(graph.edges ?? {}).flatMap(([type, list]) =>
    (list as any[]).map((e) => `${type} ${e.from} -> ${e.to}`),
  );
  return { nodes, edges };
}

describe('CORE_GRAPH_RULES', () => {
  let rootPath: string;
  let context: WorkspaceContext;

  beforeEach(async () => {
    rootPath = resolve(await mkdtemp(join(tmpdir(), 'causa-tests-')));
    for (const [file, content] of Object.entries(FIXTURE)) {
      await mkdir(dirname(join(rootPath, file)), { recursive: true });
      await writeFile(join(rootPath, file), content);
    }

    const logger = pino({ level: 'silent' });
    const { configuration } = await loadWorkspaceConfiguration(
      rootPath,
      null,
      logger,
    );
    let functionRegistry;
    ({ context, functionRegistry } = createContext({
      workingDirectory: rootPath,
      rootPath,
      projectPath: null,
      configuration,
      logger,
      functions: [EventTopicListForAll, ModelSchemaParseForJsonSchema],
    }));
    registerMockFunction(
      functionRegistry,
      ModelSchemaExtractDatabase,
      (_, { schema }) => {
        const table = schema.extensions.testTable;
        return (
          typeof table === 'string' ? { engine: 'test', table } : undefined
        ) as SchemaDatabase;
      },
    );
  });

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true });
  });

  it('should extract the core concepts of the workspace', async () => {
    const graphContext = new GraphContext(context);

    const results = await runGraphRules(CORE_GRAPH_RULES, graphContext);
    const { graph, rules } = buildGraph(results);

    expect(graphContext.failures).toEqual([]);
    const { nodes, edges } = summarize(graph);
    expect(nodes).toEqual([
      'architecture apiOperation:orderCreate',
      'architecture apiOperation:orderList',
      'architecture apiOperation:workerStatus',
      'architecture domain:domains/ordering',
      'architecture entity:domains/ordering/entities/order-summary.yaml',
      'architecture entity:domains/ordering/entities/order.yaml',
      'architecture entity:domains/ordering/entities/report.yaml',
      'architecture project:domains/ordering/api',
      'architecture project:domains/ordering/functions',
      'architecture project:domains/ordering/worker',
      'architecture state:domains/ordering/entities/placed-order.yaml',
      'architecture state:domains/ordering/entities/shipped-order.yaml',
      'architecture topic:ordering.order.v1',
      'architecture topic:ordering.ping.v1',
      'architecture trigger:domains/ordering/api#onOrder',
      'architecture trigger:domains/ordering/api#onUnknown',
      'architecture trigger:domains/ordering/api#processOrder',
      'architecture trigger:domains/ordering/worker#noTopic',
    ]);
    expect(edges).toEqual([
      'carries topic:ordering.order.v1 -> entity:domains/ordering/entities/order.yaml',
      'delivers topic:ordering.order.v1 -> trigger:domains/ordering/api#onOrder',
      'enqueues project:domains/ordering/api -> trigger:domains/ordering/api#processOrder',
      'projects entity:domains/ordering/entities/order.yaml -> entity:domains/ordering/entities/order-summary.yaml',
      'publishes project:domains/ordering/api -> topic:ordering.order.v1',
      'transitions null -> state:domains/ordering/entities/placed-order.yaml',
      'transitions state:domains/ordering/entities/placed-order.yaml -> state:domains/ordering/entities/shipped-order.yaml',
    ]);
    expect(rules.flatMap((r) => r.dangling)).toEqual([]);
    expect(rules.map((r) => r.name)).toEqual([
      'domainFromConfiguration',
      'projectFromConfiguration',
      'apiOperationFromOpenApi',
      'serviceContainerFromConfiguration',
      'enqueuesAssumedFromOwningProject',
      'eventTopicFromSchemaPath',
      'entityFromSchema',
      'stateFromConstraintSchema',
    ]);
    expect(rules).toContainEqual({
      name: 'serviceContainerFromConfiguration',
      kind: 'declared',
      description: expect.any(String),
      nodes: 4,
      edges: 2,
      warnings: expect.toBeArrayOfSize(3),
      dangling: [],
    });

    const actualWarnings = Object.fromEntries(
      rules
        .filter((r) => r.warnings.length > 0)
        .map((r) => [r.name, r.warnings.map((w) => w.message)]),
    );
    expect(actualWarnings).toEqual({
      apiOperationFromOpenApi: [
        "Operation 'orderCreate' is declared by both 'project:domains/ordering/api' and 'project:domains/ordering/worker'. It is kept under the first one.",
        "Operation PUT /status has no 'operationId' and cannot be located.",
      ],
      serviceContainerFromConfiguration: [
        "Trigger 'onUnknown' of 'ordering-api' consumes 'unknown.topic.v1', which no event schema defines.",
        "Trigger 'noTopic' of 'ordering-worker' has no topic.",
        "Project 'ordering-worker' publishes to 'unknown.topic.v1', which no event schema defines.",
      ],
      entityFromSchema: [
        "Schema 'Report' declares 'projectionOf' 'domains/ordering/entities/note.yaml', which is not an entity.",
      ],
      stateFromConstraintSchema: [
        "Event constraint 'OrderCancelled' has 'entityMutationFrom' but its 'data' does not reference a state.",
        "Event constraint 'OrderShipped' mutates from 'domains/ordering/entities/order.yaml', which is not a state.",
        "Event constraint 'OrderUpdated' has 'entityMutationFrom' but its 'data' references the entity itself rather than a state.",
      ],
    });
    const serviceContainer = rules.find(
      (r) => r.name === 'serviceContainerFromConfiguration',
    );
    expect(serviceContainer?.warnings[0].sources).toEqual([
      expect.objectContaining({
        path: 'domains/ordering/api/causa.yaml',
        pointer: '/serviceContainer/triggers/onUnknown/topic',
      }),
    ]);

    const architecture = graph.nodes?.architecture as any;
    expect(architecture.domain['domains/ordering']).toEqual({
      name: 'Ordering',
      description: 'Orders placed by customers.',
      origin: {
        kind: 'declared',
        rule: 'domainFromConfiguration',
        sources: [
          {
            path: 'domains/ordering/causa.yaml',
            pointer: '/domain',
            location: {
              start: { line: 2, column: 1 },
              end: { line: 4, column: 43 },
            },
          },
        ],
      },
    });
    expect(architecture.project['domains/ordering/api']).toMatchObject({
      parent: 'domain:domains/ordering',
      name: 'ordering-api',
      data: { type: 'serviceContainer', language: 'typescript' },
    });
    expect(architecture.trigger['domains/ordering/api#onOrder']).toEqual({
      parent: 'project:domains/ordering/api',
      name: 'onOrder',
      origin: {
        kind: 'declared',
        rule: 'serviceContainerFromConfiguration',
        sources: [
          expect.objectContaining({
            path: 'domains/ordering/api/causa.yaml',
            pointer: '/serviceContainer/triggers/onOrder',
          }),
        ],
      },
      data: { type: 'event', path: '/events/order' },
    });

    expect(architecture.apiOperation).toEqual({
      orderCreate: {
        parent: 'project:domains/ordering/api',
        name: 'orderCreate',
        description: 'Creates an order.',
        origin: {
          kind: 'declared',
          rule: 'apiOperationFromOpenApi',
          sources: [
            expect.objectContaining({
              path: 'domains/ordering/api/openapi.yaml',
              pointer: '/paths/~1orders/post',
            }),
            expect.objectContaining({
              path: 'domains/ordering/worker/openapi.yaml',
              pointer: '/paths/~1orders/post',
            }),
          ],
        },
        data: { method: 'post', path: '/orders', public: false },
      },
      orderList: expect.objectContaining({
        data: { method: 'get', path: '/orders', public: true },
      }),
      workerStatus: expect.objectContaining({
        parent: 'project:domains/ordering/worker',
        data: { method: 'get', path: '/status', public: false },
      }),
    });

    expect(architecture.entity['domains/ordering/entities/order.yaml']).toEqual(
      {
        parent: 'domain:domains/ordering',
        name: 'Order',
        description: 'An order.',
        origin: {
          kind: 'declared',
          rule: 'entityFromSchema',
          sources: [
            { path: 'domains/ordering/entities/order.yaml' },
            expect.objectContaining({
              path: 'domains/ordering/events/order/v1.yaml',
              pointer: '/properties/data',
            }),
          ],
        },
      },
    );
    expect(architecture.state).toMatchObject({
      'domains/ordering/entities/placed-order.yaml': {
        parent: 'entity:domains/ordering/entities/order.yaml',
        name: 'PlacedOrder',
      },
      'domains/ordering/entities/shipped-order.yaml': {
        parent: 'entity:domains/ordering/entities/order.yaml',
        name: 'ShippedOrder',
      },
    });
    expect(graph.edges?.transitions).toEqual([
      expect.objectContaining({
        from: null,
        label: 'orderPlaced',
        description: 'The order is placed.',
        data: {
          eventName: 'orderPlaced',
          propertyChanges: '*',
          topic: 'topic:ordering.order.v1',
        },
      }),
      expect.objectContaining({
        from: 'state:domains/ordering/entities/placed-order.yaml',
        label: 'orderShipped',
        origin: {
          kind: 'declared',
          rule: 'stateFromConstraintSchema',
          sources: [
            expect.objectContaining({
              path: 'domains/ordering/events/constraints/order-shipped.yaml',
              pointer: '/causa/entityMutationFrom/0',
            }),
            { path: 'domains/ordering/events/constraints/order-shipped.yaml' },
          ],
        },
      }),
    ]);
  });
});
