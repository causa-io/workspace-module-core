import { WorkspaceContext } from '@causa/workspace';
import { FunctionRegistry } from '@causa/workspace/function-registry';
import {
  type WorkspaceFunctionCallMock,
  createContext,
  registerMockFunction,
} from '@causa/workspace/testing';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import 'jest-extended';
import { resolve } from 'path';
import {
  EventTopicBrokerDeleteTopic,
  EventTopicBrokerDeleteTriggerResource,
  EventTopicCleanBackfill,
} from '../../definitions/index.js';
import { EventTopicCleanBackfillForAll } from './clean-backfill.js';

describe('EventTopicCleanBackfillForAll', () => {
  let tmpDir: string;
  let context: WorkspaceContext;
  let functionRegistry: FunctionRegistry<WorkspaceContext>;
  let deleteTriggerResourceMock: WorkspaceFunctionCallMock<EventTopicBrokerDeleteTriggerResource>;
  let deleteTopicMock: WorkspaceFunctionCallMock<EventTopicBrokerDeleteTopic>;

  beforeEach(async () => {
    tmpDir = resolve(await mkdtemp('causa-test-'));
    ({ context, functionRegistry } = createContext({
      rootPath: tmpDir,
      functions: [EventTopicCleanBackfillForAll],
    }));
    deleteTriggerResourceMock = registerMockFunction(
      functionRegistry,
      EventTopicBrokerDeleteTriggerResource,
      () => Promise.resolve(),
    );
    deleteTopicMock = registerMockFunction(
      functionRegistry,
      EventTopicBrokerDeleteTopic,
      () => Promise.resolve(),
    );
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should throw an error if one of the deletions fail', async () => {
    const file = resolve(tmpDir, 'backfill.json');
    await writeFile(
      file,
      JSON.stringify({
        temporaryTopicId: 'topic1',
        temporaryTriggerResourceIds: ['1', '2', '3'],
      }),
    );
    deleteTriggerResourceMock.mockImplementation(async (_, { id }) => {
      if (id === '2') {
        throw new Error('💥');
      }
    });

    const actualPromise = context.call(EventTopicCleanBackfill, { file });

    await expect(actualPromise).rejects.toThrow(
      'Failed to clean some of the resources for the backfill.',
    );
    expect(deleteTriggerResourceMock).toHaveBeenCalledTimes(3);
    expect(deleteTopicMock).toHaveBeenCalledExactlyOnceWith(context, {
      id: 'topic1',
    });
  });

  it('should not delete the topic if there is none', async () => {
    const file = resolve(tmpDir, 'backfill.json');
    await writeFile(
      file,
      JSON.stringify({
        temporaryTriggerResourceIds: ['1', '2', '3'],
      }),
    );

    await context.call(EventTopicCleanBackfill, { file });

    expect(deleteTriggerResourceMock).toHaveBeenCalledTimes(3);
    expect(deleteTopicMock).not.toHaveBeenCalled();
  });
});
