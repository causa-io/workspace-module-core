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
    - domains/*/api/**/*.dto.yaml
    - domains/*/tasks/*.yaml
    - shared/*.yaml
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
  specifications: [openapi.yaml, empty.yaml]
serviceContainer:
  triggers:
    onOrder:
      type: event
      topic: ordering.order.v1
      endpoint: { type: http, path: /events/order }
      google.pubSub: { minimumBackoff: 10s }
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
info: { title: Ordering, description: Places and lists orders., version: 1.0.0 }
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
  'domains/ordering/api/dtos/order-create.dto.yaml': `
title: OrderCreateDto
type: object
properties:
  customerId:
    type: string
    causa:
      identifierOf:
        schema: ../../entities/customer.yaml
        property: number
        scope:
          region: missing
`,
  'domains/ordering/api/dtos/order.dto.yaml': `
title: OrderDto
type: object
properties:
  id:
    type: string
`,
  'domains/ordering/tasks/process-order.yaml': `
title: ProcessOrderTask
type: object
properties:
  customer:
    type: string
  orderIds:
    type: array
    items:
      type: string
    causa:
      identifierOf:
        schema: ../entities/order.yaml
        scope:
          customerId: customer
`,
  'shared/error.yaml': `
title: Error
type: object
properties:
  message:
    type: string
`,
  'domains/ordering/entities/customer.yaml': `
title: Customer
type: object
causa:
  testTable: customers
properties:
  id:
    type: string
  referrerId:
    type: string
    causa:
      identifierOf: ./customer.yaml
`,
  'domains/ordering/entities/payment.yaml': `
title: Payment
oneOf:
  - $ref: '#/$defs/Card'
  - $ref: '#/$defs/Transfer'
$defs:
  Card:
    type: object
    properties:
      number:
        type: string
  Transfer:
    type: object
    properties:
      iban:
        type: string
`,
  'domains/ordering/worker/causa.yaml': `
project:
  name: ordering-worker
  type: serviceContainer
  language: typescript
openApi:
  specifications: [openapi.yaml, ../api/empty.yaml]
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
  'domains/ordering/api/empty.yaml': `
openapi: 3.0.0
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
  customerId:
    type: string
    causa:
      identifierOf:
        schema: ./customer.yaml
  status:
    type: string
    causa:
      enumHint: '#/$defs/OrderStatus'
  lines:
    type: array
    items:
      $ref: '#/$defs/OrderLine'
  notes:
    type: object
    additionalProperties:
      $ref: ./note.yaml
  address:
    type: object
    properties:
      street:
        type: string
  payment:
    $ref: ./payment.yaml
  missing:
    $ref: ./missing.yaml
$defs:
  OrderLine:
    type: object
    properties:
      status:
        type: string
        causa:
          identifierOf:
            schema: '#/$defs/OrderStatus'
  OrderStatus:
    type: string
    enum: [placed, shipped]
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
  previousOrderId:
    type: string
    causa:
      identifierOf:
        schema: ./order.yaml
        scope:
          customerId: customerId
          address.street: address.street
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
      'architecture api:domains/ordering/api/empty.yaml',
      'architecture api:domains/ordering/api/openapi.yaml',
      'architecture api:domains/ordering/worker/openapi.yaml',
      'architecture apiOperation:orderCreate',
      'architecture apiOperation:orderList',
      'architecture apiOperation:workerStatus',
      'architecture entity:domains/ordering/entities/customer.yaml',
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
      'model schema:domains/ordering/api/dtos/order-create.dto.yaml',
      'model schema:domains/ordering/api/dtos/order.dto.yaml',
      'model schema:domains/ordering/entities/customer.yaml',
      'model schema:domains/ordering/entities/note.yaml',
      'model schema:domains/ordering/entities/order-summary.yaml',
      'model schema:domains/ordering/entities/order.yaml',
      'model schema:domains/ordering/entities/order.yaml#/$defs/OrderLine',
      'model schema:domains/ordering/entities/order.yaml#/$defs/OrderStatus',
      'model schema:domains/ordering/entities/order.yaml#/properties/address',
      'model schema:domains/ordering/entities/payment.yaml',
      'model schema:domains/ordering/entities/payment.yaml#/$defs/Card',
      'model schema:domains/ordering/entities/payment.yaml#/$defs/Transfer',
      'model schema:domains/ordering/entities/placed-order.yaml',
      'model schema:domains/ordering/entities/report.yaml',
      'model schema:domains/ordering/entities/shipped-order.yaml',
      'model schema:domains/ordering/events/constraints/order-cancelled.yaml',
      'model schema:domains/ordering/events/constraints/order-placed.yaml',
      'model schema:domains/ordering/events/constraints/order-shipped.yaml',
      'model schema:domains/ordering/events/constraints/order-updated.yaml',
      'model schema:domains/ordering/events/order/v1.yaml',
      'model schema:domains/ordering/events/ping/v1.yaml',
      'model schema:domains/ordering/tasks/process-order.yaml',
      'model schema:shared/error.yaml',
    ]);
    expect(edges).toEqual([
      'carries topic:ordering.order.v1 -> entity:domains/ordering/entities/order.yaml',
      'constrains schema:domains/ordering/entities/placed-order.yaml -> schema:domains/ordering/entities/order.yaml',
      'constrains schema:domains/ordering/entities/shipped-order.yaml -> schema:domains/ordering/entities/order.yaml',
      'constrains schema:domains/ordering/events/constraints/order-cancelled.yaml -> schema:domains/ordering/events/order/v1.yaml',
      'constrains schema:domains/ordering/events/constraints/order-placed.yaml -> schema:domains/ordering/events/order/v1.yaml',
      'constrains schema:domains/ordering/events/constraints/order-shipped.yaml -> schema:domains/ordering/events/order/v1.yaml',
      'constrains schema:domains/ordering/events/constraints/order-updated.yaml -> schema:domains/ordering/events/order/v1.yaml',
      'defines schema:domains/ordering/entities/customer.yaml -> entity:domains/ordering/entities/customer.yaml',
      'defines schema:domains/ordering/entities/order-summary.yaml -> entity:domains/ordering/entities/order-summary.yaml',
      'defines schema:domains/ordering/entities/order.yaml -> entity:domains/ordering/entities/order.yaml',
      'defines schema:domains/ordering/entities/placed-order.yaml -> state:domains/ordering/entities/placed-order.yaml',
      'defines schema:domains/ordering/entities/report.yaml -> entity:domains/ordering/entities/report.yaml',
      'defines schema:domains/ordering/entities/shipped-order.yaml -> state:domains/ordering/entities/shipped-order.yaml',
      'defines schema:domains/ordering/events/order/v1.yaml -> topic:ordering.order.v1',
      'defines schema:domains/ordering/events/ping/v1.yaml -> topic:ordering.ping.v1',
      'delivers topic:ordering.order.v1 -> trigger:domains/ordering/api#onOrder',
      'embeds schema:domains/ordering/entities/order.yaml -> schema:domains/ordering/entities/note.yaml',
      'embeds schema:domains/ordering/entities/order.yaml -> schema:domains/ordering/entities/order.yaml#/$defs/OrderLine',
      'embeds schema:domains/ordering/entities/order.yaml -> schema:domains/ordering/entities/order.yaml#/$defs/OrderStatus',
      'embeds schema:domains/ordering/entities/order.yaml -> schema:domains/ordering/entities/order.yaml#/properties/address',
      'embeds schema:domains/ordering/entities/order.yaml -> schema:domains/ordering/entities/payment.yaml',
      'embeds schema:domains/ordering/entities/payment.yaml -> schema:domains/ordering/entities/payment.yaml#/$defs/Card',
      'embeds schema:domains/ordering/entities/payment.yaml -> schema:domains/ordering/entities/payment.yaml#/$defs/Transfer',
      'embeds schema:domains/ordering/events/constraints/order-cancelled.yaml -> schema:domains/ordering/entities/note.yaml',
      'embeds schema:domains/ordering/events/constraints/order-placed.yaml -> schema:domains/ordering/entities/placed-order.yaml',
      'embeds schema:domains/ordering/events/constraints/order-shipped.yaml -> schema:domains/ordering/entities/shipped-order.yaml',
      'embeds schema:domains/ordering/events/constraints/order-updated.yaml -> schema:domains/ordering/entities/order.yaml',
      'embeds schema:domains/ordering/events/order/v1.yaml -> schema:domains/ordering/entities/order.yaml',
      'enqueues project:domains/ordering/api -> trigger:domains/ordering/api#processOrder',
      'projects entity:domains/ordering/entities/order.yaml -> entity:domains/ordering/entities/order-summary.yaml',
      'projects schema:domains/ordering/entities/note.yaml -> schema:domains/ordering/entities/report.yaml',
      'projects schema:domains/ordering/entities/order.yaml -> schema:domains/ordering/entities/order-summary.yaml',
      'publishes project:domains/ordering/api -> topic:ordering.order.v1',
      'references schema:domains/ordering/api/dtos/order-create.dto.yaml -> schema:domains/ordering/entities/customer.yaml',
      'references schema:domains/ordering/entities/order.yaml -> schema:domains/ordering/entities/customer.yaml',
      'references schema:domains/ordering/entities/placed-order.yaml -> schema:domains/ordering/entities/order.yaml',
      'references schema:domains/ordering/tasks/process-order.yaml -> schema:domains/ordering/entities/order.yaml',
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
      'schemaFromModel',
    ]);
    expect(rules).toContainEqual({
      name: 'serviceContainerFromConfiguration',
      kind: 'declared',
      description: expect.any(String),
      domains: 0,
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
        "Document 'domains/ordering/api/empty.yaml' is matched by both 'project:domains/ordering/api' and 'project:domains/ordering/worker'. It is kept under the first one.",
        "Operation 'orderCreate' is declared by both 'api:domains/ordering/api/openapi.yaml' and 'api:domains/ordering/worker/openapi.yaml'. It is kept under the first one.",
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
      schemaFromModel: [
        "The 'identifierOf' of property 'customerId' of schema 'OrderCreateDto' names properties that do not exist: 'number' of 'Customer', 'region' of 'Customer', 'missing' of 'OrderCreateDto'.",
        "Property 'referrerId' of schema 'Customer' declares an 'identifierOf' that is not an object with a 'schema'.",
        "Schema 'Order' embeds 'domains/ordering/entities/missing.yaml', which is not a schema of the model.",
        "Property 'status' of schema 'OrderLine' is the identifier of 'domains/ordering/entities/order.yaml#/$defs/OrderStatus', which is not an object schema.",
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
    expect(graph.domains).toEqual({
      'domains/ordering': {
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
      },
    });
    expect(architecture.project['domains/ordering/api']).toMatchObject({
      domain: 'domains/ordering',
      name: 'ordering-api',
      data: { type: 'serviceContainer', language: 'typescript' },
    });
    expect(architecture.trigger['domains/ordering/api#onOrder']).toEqual({
      parent: 'project:domains/ordering/api',
      domain: 'domains/ordering',
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
      data: {
        type: 'event',
        path: '/events/order',
        extra: { 'google.pubSub': { minimumBackoff: '10s' } },
      },
    });
    expect(
      architecture.trigger['domains/ordering/api#processOrder'].data,
    ).toEqual({
      type: 'task',
      path: '/tasks/order',
      queue: 'process-order',
    });

    expect(architecture.api).toEqual({
      'domains/ordering/api/empty.yaml': {
        parent: 'project:domains/ordering/api',
        domain: 'domains/ordering',
        name: 'empty.yaml',
        origin: {
          kind: 'declared',
          rule: 'apiOperationFromOpenApi',
          sources: [{ path: 'domains/ordering/api/empty.yaml' }],
        },
        data: { format: 'openApi' },
      },
      'domains/ordering/api/openapi.yaml': {
        parent: 'project:domains/ordering/api',
        domain: 'domains/ordering',
        name: 'Ordering',
        description: 'Places and lists orders.',
        origin: {
          kind: 'declared',
          rule: 'apiOperationFromOpenApi',
          sources: [{ path: 'domains/ordering/api/openapi.yaml' }],
        },
        data: { format: 'openApi', version: '1.0.0' },
      },
      'domains/ordering/worker/openapi.yaml': expect.objectContaining({
        parent: 'project:domains/ordering/worker',
        name: 'Worker',
      }),
    });
    expect(architecture.apiOperation).toEqual({
      orderCreate: {
        parent: 'api:domains/ordering/api/openapi.yaml',
        domain: 'domains/ordering',
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
        parent: 'api:domains/ordering/worker/openapi.yaml',
        data: { method: 'get', path: '/status', public: false },
      }),
    });

    expect(architecture.entity['domains/ordering/entities/order.yaml']).toEqual(
      {
        domain: 'domains/ordering',
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

    const schemas = (graph.nodes?.model as any).schema;
    expect(schemas['domains/ordering/entities/order.yaml']).toEqual({
      domain: 'domains/ordering',
      name: 'Order',
      description: 'An order.',
      origin: {
        kind: 'declared',
        rule: 'schemaFromModel',
        sources: [{ path: 'domains/ordering/entities/order.yaml' }],
      },
      data: { kind: 'object' },
    });
    expect(schemas).toMatchObject({
      'domains/ordering/entities/customer.yaml': {
        data: {
          kind: 'object',
          databases: [{ engine: 'test', table: 'customers' }],
        },
      },
      'domains/ordering/entities/order.yaml#/$defs/OrderStatus': {
        parent: 'schema:domains/ordering/entities/order.yaml',
        domain: 'domains/ordering',
        name: 'OrderStatus',
        data: { kind: 'enum', values: ['placed', 'shipped'] },
      },
      'domains/ordering/entities/order.yaml#/properties/address': {
        parent: 'schema:domains/ordering/entities/order.yaml',
        name: 'address',
      },
      'domains/ordering/entities/payment.yaml': {
        data: { kind: 'union', combiner: 'oneOf' },
      },
    });
    expect(schemas['shared/error.yaml'].domain).toBeUndefined();
    expect(
      graph.edges?.embeds?.filter(
        (e) => e.from === 'schema:domains/ordering/entities/order.yaml',
      ),
    ).toEqual([
      expect.objectContaining({
        to: 'schema:domains/ordering/entities/note.yaml',
        label: 'notes',
        data: { property: 'notes', collection: 'map' },
      }),
      expect.objectContaining({
        to: 'schema:domains/ordering/entities/order.yaml#/$defs/OrderLine',
        label: 'lines',
        data: { property: 'lines', collection: 'array' },
      }),
      expect.objectContaining({
        to: 'schema:domains/ordering/entities/order.yaml#/$defs/OrderStatus',
        label: 'status',
        data: { property: 'status', hint: true },
        origin: {
          kind: 'declared',
          rule: 'schemaFromModel',
          sources: [
            expect.objectContaining({
              path: 'domains/ordering/entities/order.yaml',
              pointer: '/properties/status/causa/enumHint',
            }),
          ],
        },
      }),
      expect.objectContaining({
        to: 'schema:domains/ordering/entities/order.yaml#/properties/address',
        label: 'address',
        data: { property: 'address' },
      }),
      expect.objectContaining({
        to: 'schema:domains/ordering/entities/payment.yaml',
        label: 'payment',
        data: { property: 'payment' },
      }),
    ]);
    expect(
      graph.edges?.embeds?.find(
        (e) =>
          e.to === 'schema:domains/ordering/entities/payment.yaml#/$defs/Card',
      ),
    ).toEqual({
      from: 'schema:domains/ordering/entities/payment.yaml',
      to: 'schema:domains/ordering/entities/payment.yaml#/$defs/Card',
      origin: {
        kind: 'declared',
        rule: 'schemaFromModel',
        sources: [
          expect.objectContaining({
            path: 'domains/ordering/entities/payment.yaml',
            pointer: '/oneOf',
          }),
        ],
      },
    });
    expect(graph.edges?.references).toContainEqual({
      from: 'schema:domains/ordering/tasks/process-order.yaml',
      to: 'schema:domains/ordering/entities/order.yaml',
      label: 'orderIds',
      origin: {
        kind: 'declared',
        rule: 'schemaFromModel',
        sources: [
          expect.objectContaining({
            path: 'domains/ordering/tasks/process-order.yaml',
            pointer: '/properties/orderIds/causa/identifierOf',
          }),
        ],
      },
      data: {
        property: 'orderIds',
        collection: 'array',
        targetProperty: 'id',
        scope: { customerId: 'customer' },
      },
    });
    expect(graph.edges?.references).toContainEqual(
      expect.objectContaining({
        from: 'schema:domains/ordering/entities/placed-order.yaml',
        label: 'previousOrderId',
        data: {
          property: 'previousOrderId',
          targetProperty: 'id',
          scope: {
            customerId: 'customerId',
            'address.street': 'address.street',
          },
        },
      }),
    );
  });
});
