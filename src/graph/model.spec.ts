import { loadWorkspaceConfiguration, WorkspaceContext } from '@causa/workspace';
import { createContext, registerMockFunction } from '@causa/workspace/testing';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import 'jest-extended';
import { tmpdir } from 'os';
import { dirname, join, relative, resolve } from 'path';
import { pino } from 'pino';
import {
  ModelSchemaExtractDatabase,
  type SchemaDatabase,
} from '../definitions/index.js';
import { EventTopicListForAll } from '../functions/event-topic/index.js';
import { ModelSchemaParseForJsonSchema } from '../functions/model/index.js';
import { GraphContext } from './context.js';
import { ModelFact } from './model.js';

const FIXTURE: Record<string, string> = {
  'causa.yaml': `
workspace:
  name: shop
model:
  schema: jsonschema
  globs:
    - domains/*/entities/*.yaml
    - domains/*/events/**/*.yaml
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
`,
  'domains/ordering/entities/order.yaml': `
title: Order
type: object
properties:
  id:
    type: string
`,
  'domains/ordering/entities/invoice.yaml': `
title: Invoice
type: object
causa:
  testTable: invoices
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
  'domains/ordering/entities/placed-order.yaml': `
title: PlacedOrder
type: object
causa:
  constraintFor: ./order.yaml
properties:
  id:
    type: string
`,
  'domains/ordering/events/order/v1.yaml': `
title: OrderEvent
type: object
properties:
  data:
    $ref: ../../entities/order.yaml
`,
  'domains/ordering/events/command/v1.yaml': `
title: CommandEvent
type: object
properties:
  data:
    $ref: '#/$defs/Command'
$defs:
  Command:
    type: object
    properties:
      id:
        type: string
`,
  'shared/address.yaml': `
title: Address
type: object
causa:
  testTable: addresses
properties:
  street:
    type: string
`,
};

describe('model', () => {
  describe('ModelFact', () => {
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

    it('should list the topics, locate the schemas, and classify carried and persisted object schemas as entities', async () => {
      const actualModel = await new GraphContext(context).get(ModelFact);

      expect([...actualModel.topics.keys()]).toIncludeSameMembers([
        'ordering.order.v1',
        'ordering.command.v1',
      ]);
      expect(actualModel.topics.get('ordering.order.v1')).toMatchObject({
        schemaFilePath: join(rootPath, 'domains/ordering/events/order/v1.yaml'),
      });
      const commandPath = join(
        rootPath,
        'domains/ordering/events/command/v1.yaml#/$defs/Command',
      );
      expect(actualModel.schemas).toEqual(
        new Map([
          [
            join(rootPath, 'domains/ordering/entities/invoice.yaml'),
            expect.anything(),
          ],
          [
            join(rootPath, 'domains/ordering/entities/note.yaml'),
            expect.anything(),
          ],
          [
            join(rootPath, 'domains/ordering/entities/order.yaml'),
            expect.anything(),
          ],
          [
            join(rootPath, 'domains/ordering/entities/placed-order.yaml'),
            expect.anything(),
          ],
          [
            join(rootPath, 'domains/ordering/events/command/v1.yaml'),
            expect.anything(),
          ],
          [
            commandPath,
            expect.objectContaining({
              definition: expect.objectContaining({ name: 'Command' }),
              path: commandPath,
              file: 'domains/ordering/events/command/v1.yaml',
              segments: ['$defs', 'Command'],
              locator: 'domains/ordering/events/command/v1.yaml#/$defs/Command',
            }),
          ],
          [
            join(rootPath, 'domains/ordering/events/order/v1.yaml'),
            expect.anything(),
          ],
          [
            join(rootPath, 'shared/address.yaml'),
            expect.objectContaining({
              definition: expect.objectContaining({ name: 'Address' }),
              file: 'shared/address.yaml',
              segments: [],
              locator: 'shared/address.yaml',
            }),
          ],
        ]),
      );
      expect(
        [...actualModel.entities.entries()].map(([path, e]) => [
          relative(rootPath, path),
          e.id,
          e.carriedBy.map((t) => t.id),
          e.schema.definition.databases,
        ]),
      ).toIncludeSameMembers([
        [
          'domains/ordering/entities/order.yaml',
          'entity:domains/ordering/entities/order.yaml',
          ['ordering.order.v1'],
          [],
        ],
        [
          'domains/ordering/entities/invoice.yaml',
          'entity:domains/ordering/entities/invoice.yaml',
          [],
          [{ engine: 'test', table: 'invoices' }],
        ],
        [
          'shared/address.yaml',
          'entity:shared/address.yaml',
          [],
          [{ engine: 'test', table: 'addresses' }],
        ],
        [
          'domains/ordering/events/command/v1.yaml#/$defs/Command',
          'entity:domains/ordering/events/command/v1.yaml#/$defs/Command',
          ['ordering.command.v1'],
          [],
        ],
      ]);
      const orderPath = join(rootPath, 'domains/ordering/entities/order.yaml');
      expect(actualModel.entities.get(orderPath)?.schema).toEqual(
        actualModel.schemas.get(orderPath),
      );
    });

    it('should report the schema files that cannot be parsed', async () => {
      await writeFile(
        join(rootPath, 'domains/ordering/entities/broken.yaml'),
        'type: object\nproperties: [',
      );
      const graph = new GraphContext(context);

      const actualModel = await graph.get(ModelFact);

      expect(
        actualModel.schemas.has(
          join(rootPath, 'domains/ordering/entities/order.yaml'),
        ),
      ).toBeTrue();
      expect(graph.facts).toContainEqual({
        name: 'ModelFact',
        warnings: [
          {
            message: expect.stringMatching(
              /^Schema file 'domains\/ordering\/entities\/broken\.yaml' could not be parsed: /,
            ),
            sources: [{ path: 'domains/ordering/entities/broken.yaml' }],
          },
        ],
      });
    });

    it('should list the topics with the defaults of EventTopicList and parse no schema when nothing is configured', async () => {
      ({ context } = createContext({
        workingDirectory: rootPath,
        rootPath,
        projectPath: null,
        configuration: { workspace: { name: 'shop' } },
        logger: pino({ level: 'silent' }),
        functions: [EventTopicListForAll],
      }));

      const actualModel = await new GraphContext(context).get(ModelFact);

      expect([...actualModel.topics.keys()]).toIncludeSameMembers([
        'ordering.order.v1',
        'ordering.command.v1',
      ]);
      expect(actualModel.schemas).toEqual(new Map());
      expect(actualModel.entities).toEqual(new Map());
    });
  });
});
