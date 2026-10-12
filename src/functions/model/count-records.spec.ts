import type { WorkspaceContext } from '@causa/workspace';
import type { FunctionRegistry } from '@causa/workspace/function-registry';
import {
  createContext,
  registerMockFunction,
  type WorkspaceFunctionCallMock,
} from '@causa/workspace/testing';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import 'jest-extended';
import { dirname, join, resolve } from 'path';
import {
  DatabaseCountRecords,
  EventTopicCountEvents,
  ModelSchemaCountRecords,
  ModelSchemaExtractDatabase,
  ModelSchemaParse,
  type RecordCounts,
  type RecordFilters,
} from '../../definitions/index.js';
import { EventTopicListForAll } from '../event-topic/index.js';
import { ModelSchemaCountRecordsForAll } from './count-records.js';
import { ModelSchemaParseForJsonSchema } from './parse-schemas-json.js';

const ENTITY_FILE = 'domains/shop/entities/order.yaml';
const EVENT_FILE = 'domains/shop/events/order/v1.yaml';

const ENTITY_SCHEMA = `
title: Order
type: object
causa:
  testTable: Orders
properties:
  id:
    type: string
  state:
    $ref: "#/$defs/OrderState"
  priority:
    type: boolean
  deletedAt:
    oneOf:
      - type: string
        format: date-time
      - type: "null"
  customer:
    oneOf:
      - $ref: "#/$defs/Customer"
      - type: "null"
  address:
    $ref: "#/$defs/Address"
required: [id, state, priority, deletedAt, customer, address]
$defs:
  OrderState:
    title: OrderState
    type: string
    enum: [pending, shipped]
  Customer:
    title: Customer
    type: object
    properties:
      name:
        type: string
  Address:
    title: Address
    type: object
    properties:
      country:
        type: string
  AddressInFranceConstraint:
    title: AddressInFranceConstraint
    type: object
    causa:
      constraintFor: "#/$defs/Address"
    properties:
      country:
        const: FR
  OrderShippedToFranceConstraint:
    title: OrderShippedToFranceConstraint
    type: object
    causa:
      constraintFor: "#"
    properties:
      state:
        const: shipped
      priority:
        const: true
      deletedAt:
        type: "null"
      customer:
        oneOf:
          - $ref: "#/$defs/Customer"
      address:
        oneOf:
          - $ref: "#/$defs/AddressInFranceConstraint"
  OrderDeletedConstraint:
    title: OrderDeletedConstraint
    type: object
    causa:
      constraintFor: "#"
    properties:
      deletedAt:
        type: string
        format: date-time
  OrderUnknownConstraint:
    title: OrderUnknownConstraint
    type: object
    causa:
      constraintFor: "#"
    properties:
      unknown:
        const: 1
  OrderPendingOrNullConstraint:
    title: OrderPendingOrNullConstraint
    type: object
    causa:
      constraintFor: "#"
    properties:
      state:
        oneOf:
          - const: pending
          - type: "null"
`;

const EVENT_SCHEMA = `
title: OrderEvent
type: object
properties:
  id:
    type: string
  name:
    type: string
  data:
    oneOf:
      - $ref: ../../entities/order.yaml
required: [id, name, data]
$defs:
  OrderShippedEventConstraint:
    title: OrderShippedEventConstraint
    type: object
    causa:
      constraintFor: "#"
      entityMutationFrom: [null]
    properties:
      name:
        const: orderShipped
      data:
        oneOf:
          - $ref: ../../entities/order.yaml#/$defs/OrderShippedToFranceConstraint
  OrderEventConstraint:
    title: OrderEventConstraint
    type: object
    causa:
      constraintFor: "#"
`;

const SHIPPED_TO_FRANCE = `${ENTITY_FILE}#/$defs/OrderShippedToFranceConstraint`;
const DELETED = `${ENTITY_FILE}#/$defs/OrderDeletedConstraint`;
const SHIPPED_EVENT = `${EVENT_FILE}#/$defs/OrderShippedEventConstraint`;
const ANY_EVENT = `${EVENT_FILE}#/$defs/OrderEventConstraint`;

/**
 * Returns counts for the given filters, numbered in order.
 */
function countsOf(filters: RecordFilters): RecordCounts {
  return {
    total: 100,
    counts: Object.fromEntries(Object.keys(filters).map((f, i) => [f, i + 1])),
  };
}

describe('ModelSchemaCountRecordsForAll', () => {
  let context: WorkspaceContext;
  let functionRegistry: FunctionRegistry<WorkspaceContext>;
  let countRecordsMock: WorkspaceFunctionCallMock<DatabaseCountRecords>;
  let countEventsMock: WorkspaceFunctionCallMock<EventTopicCountEvents>;

  beforeEach(async () => {
    const rootPath = resolve(await mkdtemp('causa-tests-'));
    ({ context, functionRegistry } = createContext({
      rootPath,
      workingDirectory: rootPath,
      functions: [
        ModelSchemaCountRecordsForAll,
        ModelSchemaParseForJsonSchema,
        EventTopicListForAll,
      ],
      configuration: {
        workspace: { name: '🧪' },
        model: { schema: 'jsonschema' },
      },
    }));
    registerMockFunction(
      functionRegistry,
      ModelSchemaExtractDatabase,
      (_, { schema }) => ({
        engine: 'test.engine',
        table: schema.extensions.testTable as string,
      }),
      { supports: (_, { schema }) => !!schema.extensions.testTable },
    );
    countRecordsMock = registerMockFunction(
      functionRegistry,
      DatabaseCountRecords,
      async (_, { filters }) => countsOf(filters),
      { supports: (_, { engine }) => engine === 'test.engine' },
    );
    countEventsMock = registerMockFunction(
      functionRegistry,
      EventTopicCountEvents,
      async (_, { filters }) => countsOf(filters),
    );

    for (const [file, contents] of [
      [ENTITY_FILE, ENTITY_SCHEMA],
      [EVENT_FILE, EVENT_SCHEMA],
    ]) {
      await mkdir(dirname(join(rootPath, file)), { recursive: true });
      await writeFile(join(rootPath, file), contents);
    }
  });

  afterEach(async () => {
    await rm(context.rootPath, { recursive: true, force: true });
  });

  it('should count the records of a persisted schema satisfying each of its constraints', async () => {
    const actualCounts = await context.call(ModelSchemaCountRecords, {
      schema: ENTITY_FILE,
    });

    expect(actualCounts).toEqual({
      sources: [
        {
          source: { type: 'database', engine: 'test.engine', table: 'Orders' },
          total: 100,
          constraints: { [SHIPPED_TO_FRANCE]: 1, [DELETED]: 2 },
        },
      ],
      unsupported: {
        [`${ENTITY_FILE}#/$defs/OrderUnknownConstraint`]:
          "'unknown' is not a property of 'Order'.",
        [`${ENTITY_FILE}#/$defs/OrderPendingOrNullConstraint`]:
          "'state' is not constrained to a constant, to null, to a non-null value, or to another constraint.",
      },
    });
    expect(countRecordsMock).toHaveBeenCalledExactlyOnceWith(context, {
      engine: 'test.engine',
      schema: expect.objectContaining({
        name: 'Order',
        path: join(context.rootPath, ENTITY_FILE),
      }),
      filters: {
        [SHIPPED_TO_FRANCE]: [
          { path: ['state'], operator: 'equals', value: 'shipped' },
          { path: ['priority'], operator: 'equals', value: true },
          { path: ['deletedAt'], operator: 'isNull' },
          { path: ['customer'], operator: 'isNotNull' },
          { path: ['address', 'country'], operator: 'equals', value: 'FR' },
        ],
        [DELETED]: [{ path: ['deletedAt'], operator: 'isNotNull' }],
      },
    });
    expect(countEventsMock).not.toHaveBeenCalled();
  });

  it('should count the events of a topic satisfying each constraint of its event schema', async () => {
    const to = new Date('2026-10-12T00:00:00Z');
    const from = new Date('2026-10-01T00:00:00Z');

    const actualCounts = await context.call(ModelSchemaCountRecords, {
      schema: EVENT_FILE,
      from,
      to,
    });

    expect(actualCounts).toEqual({
      sources: [
        {
          source: { type: 'eventTopic', topic: 'shop.order.v1', from, to },
          total: 100,
          constraints: { [SHIPPED_EVENT]: 1, [ANY_EVENT]: 2 },
        },
      ],
      unsupported: {},
    });
    expect(countEventsMock).toHaveBeenCalledExactlyOnceWith(context, {
      topic: 'shop.order.v1',
      from,
      to,
      filters: {
        [SHIPPED_EVENT]: [
          { path: ['name'], operator: 'equals', value: 'orderShipped' },
          { path: ['data', 'state'], operator: 'equals', value: 'shipped' },
          { path: ['data', 'priority'], operator: 'equals', value: true },
          { path: ['data', 'deletedAt'], operator: 'isNull' },
          { path: ['data', 'customer'], operator: 'isNotNull' },
          {
            path: ['data', 'address', 'country'],
            operator: 'equals',
            value: 'FR',
          },
        ],
        [ANY_EVENT]: [],
      },
    });
    expect(countRecordsMock).not.toHaveBeenCalled();
  });

  it('should count the events of the last day by default', async () => {
    const before = Date.now();

    const actualCounts = await context.call(ModelSchemaCountRecords, {
      schema: EVENT_FILE,
    });

    const after = Date.now();
    const { source } = actualCounts.sources[0] as any;
    expect(source.to.getTime()).toBeWithin(before, after + 1);
    expect(source.to.getTime() - source.from.getTime()).toEqual(
      24 * 3600 * 1000,
    );
  });

  it('should count the constraints of a schema nested in its file', async () => {
    const actualCounts = await context.call(ModelSchemaCountRecords, {
      schema: `${ENTITY_FILE}#/$defs/Address`,
    });

    expect(actualCounts).toEqual({ sources: [], unsupported: {} });
    expect(countRecordsMock).not.toHaveBeenCalled();
    expect(countEventsMock).not.toHaveBeenCalled();
  });

  it('should resolve the schema path from the workspace root', async () => {
    ({ context, functionRegistry } = createContext({
      rootPath: context.rootPath,
      workingDirectory: join(context.rootPath, 'domains/shop/entities'),
      functions: [ModelSchemaCountRecordsForAll],
      configuration: {
        workspace: { name: '🧪' },
        model: { schema: 'jsonschema' },
      },
    }));
    const parseMock = registerMockFunction(
      functionRegistry,
      ModelSchemaParse,
      async () => ({ schemas: {}, errors: {} }),
    );

    const actualPromise = context.call(ModelSchemaCountRecords, {
      schema: `${ENTITY_FILE}#/$defs/Address`,
    });

    await expect(actualPromise).rejects.toThrow(
      `'${ENTITY_FILE}#/$defs/Address' is not an object schema.`,
    );
    expect(parseMock).toHaveBeenCalledExactlyOnceWith(context, {
      paths: [join(context.rootPath, ENTITY_FILE)],
    });
  });

  it('should skip sources for which counting is not supported', async () => {
    ({ context, functionRegistry } = createContext({
      rootPath: context.rootPath,
      workingDirectory: context.rootPath,
      functions: [
        ModelSchemaCountRecordsForAll,
        ModelSchemaParseForJsonSchema,
        EventTopicListForAll,
      ],
      configuration: {
        workspace: { name: '🧪' },
        model: { schema: 'jsonschema' },
      },
    }));
    registerMockFunction(
      functionRegistry,
      ModelSchemaExtractDatabase,
      () => ({ engine: 'other.engine', table: 'Orders' }),
      { supports: (_, { schema }) => !!schema.extensions.testTable },
    );

    const actualCounts = await context.call(ModelSchemaCountRecords, {
      schema: ENTITY_FILE,
    });

    expect(actualCounts.sources).toBeEmpty();
    expect(Object.keys(actualCounts.unsupported)).toHaveLength(2);
  });

  it('should throw when the schema is not an object schema', async () => {
    const actualPromise = context.call(ModelSchemaCountRecords, {
      schema: `${ENTITY_FILE}#/$defs/OrderState`,
    });

    await expect(actualPromise).rejects.toThrow(
      `'${ENTITY_FILE}#/$defs/OrderState' is not an object schema.`,
    );
  });

  it('should throw when the schema file cannot be parsed', async () => {
    const actualPromise = context.call(ModelSchemaCountRecords, {
      schema: 'domains/shop/entities/missing.yaml',
    });

    await expect(actualPromise).rejects.toThrow();
  });
});
