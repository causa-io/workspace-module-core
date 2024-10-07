import { WorkspaceContext } from '@causa/workspace';
import { FunctionRegistry } from '@causa/workspace/function-registry';
import {
  type WorkspaceFunctionCallMock,
  createContext,
  registerMockFunction,
} from '@causa/workspace/testing';
import { mkdtemp, readFile, rm } from 'fs/promises';
import 'jest-extended';
import { resolve } from 'path';
import {
  EventTopicBackfill,
  EventTopicBrokerCreateTopic,
  EventTopicBrokerCreateTrigger,
  EventTopicBrokerGetTopicId,
  EventTopicBrokerPublishEvents,
  EventTopicTriggerCreationError,
} from '../../definitions/index.js';
import { EventTopicBackfillForAll } from './backfill.js';

describe('EventTopicBackfillForAll', () => {
  let tmpDir: string;
  let context: WorkspaceContext;
  let functionRegistry: FunctionRegistry<WorkspaceContext>;
  let createTopicMock: WorkspaceFunctionCallMock<EventTopicBrokerCreateTopic>;
  let getTopicIdMock: WorkspaceFunctionCallMock<EventTopicBrokerGetTopicId>;
  let createTriggerMock: WorkspaceFunctionCallMock<EventTopicBrokerCreateTrigger>;
  let publishEventsMock: WorkspaceFunctionCallMock<EventTopicBrokerPublishEvents>;

  beforeEach(async () => {
    tmpDir = resolve(await mkdtemp('causa-test-'));
    ({ context, functionRegistry } = createContext({
      rootPath: tmpDir,
      functions: [EventTopicBackfillForAll],
    }));
    createTopicMock = registerMockFunction(
      functionRegistry,
      EventTopicBrokerCreateTopic,
      async (_, { name }) => `created/${name}`,
    );
    getTopicIdMock = registerMockFunction(
      functionRegistry,
      EventTopicBrokerGetTopicId,
      async (_, { eventTopic }) => `broker/${eventTopic}`,
    );
    createTriggerMock = registerMockFunction(
      functionRegistry,
      EventTopicBrokerCreateTrigger,
      async (_, args) => [
        `backfill/${args.backfillId}/${args.topicId}/trigger/${args.trigger}`,
      ],
    );
    publishEventsMock = registerMockFunction(
      functionRegistry,
      EventTopicBrokerPublishEvents,
      () => Promise.resolve(),
    );
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should throw if a temporary topic should be created but no trigger is defined', async () => {
    const actualPromise = context.call(EventTopicBackfill, {
      eventTopic: 'test-topic',
      createTemporaryTopic: true,
    });

    await expect(actualPromise).rejects.toThrow(
      'At least one temporary trigger should be defined when using a temporary topic.',
    );
  });

  it('should use an existing topic, create triggers, and publish events', async () => {
    const expectedFile = resolve(tmpDir, 'backfill.json');

    const actualFile = await context.call(EventTopicBackfill, {
      eventTopic: 'test-topic',
      triggers: ['trigger1', 'trigger2'],
      source: '🚰',
      filter: '👀',
      output: expectedFile,
    });

    expect(actualFile).toBe(expectedFile);
    expect(createTopicMock).not.toHaveBeenCalled();
    expect(getTopicIdMock).toHaveBeenCalledExactlyOnceWith(context, {
      eventTopic: 'test-topic',
    });
    expect(createTriggerMock).toHaveBeenCalledWith(context, {
      backfillId: expect.any(String),
      topicId: 'broker/test-topic',
      trigger: 'trigger1',
    });
    expect(createTriggerMock).toHaveBeenCalledWith(context, {
      backfillId: expect.any(String),
      topicId: 'broker/test-topic',
      trigger: 'trigger2',
    });
    expect(publishEventsMock).toHaveBeenCalledExactlyOnceWith(context, {
      topicId: 'broker/test-topic',
      eventTopic: 'test-topic',
      source: '🚰',
      filter: '👀',
    });
    const actualBackfillId = createTriggerMock.mock.calls[0][1].backfillId;
    const actualFileContent = await readFile(actualFile);
    expect(JSON.parse(actualFileContent.toString())).toEqual({
      temporaryTopicId: null,
      temporaryTriggerResourceIds: [
        `backfill/${actualBackfillId}/broker/test-topic/trigger/trigger1`,
        `backfill/${actualBackfillId}/broker/test-topic/trigger/trigger2`,
      ],
    });
  });

  it('should create a temporary topic, create triggers, and publish events', async () => {
    const expectedFile = resolve(tmpDir, 'backfill.json');

    const actualFile = await context.call(EventTopicBackfill, {
      eventTopic: 'test-topic',
      triggers: ['trigger1', 'trigger2'],
      createTemporaryTopic: true,
      output: expectedFile,
    });

    expect(actualFile).toBe(expectedFile);
    expect(createTopicMock).toHaveBeenCalledExactlyOnceWith(context, {
      name: expect.any(String),
    });
    const actualTopicName = createTopicMock.mock.calls[0][1].name;
    const expectedTopicId = `created/${actualTopicName}`;
    expect(getTopicIdMock).not.toHaveBeenCalled();
    expect(createTriggerMock).toHaveBeenCalledWith(context, {
      backfillId: expect.any(String),
      topicId: expectedTopicId,
      trigger: 'trigger1',
    });
    expect(createTriggerMock).toHaveBeenCalledWith(context, {
      backfillId: expect.any(String),
      topicId: expectedTopicId,
      trigger: 'trigger2',
    });
    expect(publishEventsMock).toHaveBeenCalledExactlyOnceWith(context, {
      topicId: expectedTopicId,
      eventTopic: 'test-topic',
      source: undefined,
      filter: undefined,
    });
    const actualBackfillId = createTriggerMock.mock.calls[0][1].backfillId;
    const actualFileContent = await readFile(actualFile);
    expect(JSON.parse(actualFileContent.toString())).toEqual({
      temporaryTopicId: expectedTopicId,
      temporaryTriggerResourceIds: [
        `backfill/${actualBackfillId}/${expectedTopicId}/trigger/trigger1`,
        `backfill/${actualBackfillId}/${expectedTopicId}/trigger/trigger2`,
      ],
    });
  });

  it('should still output the backfill file when creating triggers fails', async () => {
    const expectedFile = resolve(tmpDir, 'backfill.json');
    createTriggerMock.mockImplementation(async (_, { trigger }) => {
      if (trigger === 'trigger2') {
        throw new EventTopicTriggerCreationError(new Error('💥'), [
          'some-resource-a',
          'some-resource-b',
        ]);
      }

      return ['some-resource-c', 'some-resource-d'];
    });

    const actualPromise = context.call(EventTopicBackfill, {
      eventTopic: 'test-topic',
      triggers: ['trigger1', 'trigger2'],
      createTemporaryTopic: true,
      output: expectedFile,
    });

    await expect(actualPromise).rejects.toThrowError('💥');
    expect(createTopicMock).toHaveBeenCalledExactlyOnceWith(context, {
      name: expect.any(String),
    });
    const actualTopicName = createTopicMock.mock.calls[0][1].name;
    const expectedTopicId = `created/${actualTopicName}`;
    expect(getTopicIdMock).not.toHaveBeenCalled();
    expect(createTriggerMock).toHaveBeenCalledWith(context, {
      backfillId: expect.any(String),
      topicId: expectedTopicId,
      trigger: 'trigger1',
    });
    expect(createTriggerMock).toHaveBeenCalledWith(context, {
      backfillId: expect.any(String),
      topicId: expectedTopicId,
      trigger: 'trigger2',
    });
    expect(publishEventsMock).not.toHaveBeenCalled();
    const actualFileContent = await readFile(expectedFile);
    expect(JSON.parse(actualFileContent.toString())).toEqual({
      temporaryTopicId: expectedTopicId,
      temporaryTriggerResourceIds: expect.toContainAllValues([
        'some-resource-a',
        'some-resource-b',
        'some-resource-c',
        'some-resource-d',
      ]),
    });
  });

  it('should still output the backfill file when publishing events fails', async () => {
    const expectedFile = resolve(tmpDir, 'backfill.json');
    publishEventsMock.mockImplementation(async () => {
      throw new Error('💥');
    });

    const actualPromise = context.call(EventTopicBackfill, {
      eventTopic: 'test-topic',
      output: expectedFile,
    });

    await expect(actualPromise).rejects.toThrowError('💥');
    expect(createTopicMock).not.toHaveBeenCalled();
    expect(getTopicIdMock).toHaveBeenCalledExactlyOnceWith(context, {
      eventTopic: 'test-topic',
    });
    expect(createTriggerMock).not.toHaveBeenCalled();
    expect(publishEventsMock).toHaveBeenCalledExactlyOnceWith(context, {
      topicId: 'broker/test-topic',
      eventTopic: 'test-topic',
      source: undefined,
      filter: undefined,
    });
    const actualFileContent = await readFile(expectedFile);
    expect(JSON.parse(actualFileContent.toString())).toEqual({
      temporaryTopicId: null,
      temporaryTriggerResourceIds: [],
    });
  });
});
