import { WorkspaceContext } from '@causa/workspace';
import { FunctionRegistry } from '@causa/workspace/function-registry';
import {
  type WorkspaceFunctionCallMock,
  createContext,
  registerMockFunction,
} from '@causa/workspace/testing';
import 'jest-extended';
import {
  type EventTopicDefinition,
  EventTopicGenerateCode,
  EventTopicGenerateCodeReferencedInProject,
  EventTopicList,
  EventTopicListReferencedInProject,
} from '../../definitions/index.js';
import {
  EventTopicGenerateCodeReferencedInProjectForAll,
  MissingEventTopicDefinitionsError,
} from './generate-code-referenced-in-project.js';

describe('EventTopicGenerateCodeReferencedInProjectForAll', () => {
  let context: WorkspaceContext;
  let functionRegistry: FunctionRegistry<WorkspaceContext>;
  let listInProjectMock: WorkspaceFunctionCallMock<EventTopicListReferencedInProject>;
  let generateCodeMock: WorkspaceFunctionCallMock<EventTopicGenerateCode>;
  const definitions: EventTopicDefinition[] = [
    {
      id: 'my.event.v1',
      formatParts: { domain: 'my', name: 'event', version: 'v1' },
      schemaFilePath: 'my/event/v1.yaml',
    },
    {
      id: 'my.event.v2',
      formatParts: { domain: 'my', name: 'event', version: 'v2' },
      schemaFilePath: 'my/event/v2.yaml',
    },
    {
      id: 'my.other-event.v1',
      formatParts: { domain: 'my', name: 'other-event', version: 'v1' },
      schemaFilePath: 'my/other-event/v1.yaml',
    },
  ];

  beforeEach(() => {
    ({ context, functionRegistry } = createContext({
      functions: [EventTopicGenerateCodeReferencedInProjectForAll],
    }));
    registerMockFunction(
      functionRegistry,
      EventTopicList,
      async () => definitions,
    );
    listInProjectMock = registerMockFunction(
      functionRegistry,
      EventTopicListReferencedInProject,
      async () => ({
        consumed: ['my.event.v1'],
        produced: ['my.event.v1', 'my.other-event.v1'],
      }),
    );
    generateCodeMock = registerMockFunction(
      functionRegistry,
      EventTopicGenerateCode,
      async () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
    );
  });

  it('should throw if an event topic cannot be found', async () => {
    listInProjectMock.mockResolvedValueOnce({
      consumed: ['my.event.v1', 'nope.event.v1'],
      produced: ['my.event.v1', 'my.other-event.v1'],
    });

    const actualPromise = context.call(
      EventTopicGenerateCodeReferencedInProject,
      {},
    );

    await expect(actualPromise).rejects.toThrow(
      MissingEventTopicDefinitionsError,
    );
  });

  it('should generate code and return the list of topics', async () => {
    const actualTopicIds = await context.call(
      EventTopicGenerateCodeReferencedInProject,
      {},
    );

    expect(actualTopicIds.sort()).toEqual(['my.event.v1', 'my.other-event.v1']);
    const expectedDefinitions = definitions.filter((d) =>
      actualTopicIds.includes(d.id),
    );
    expect(generateCodeMock).toHaveBeenCalledExactlyOnceWith(context, {
      definitions: expect.toContainAllValues(expectedDefinitions),
    });
  });
});
