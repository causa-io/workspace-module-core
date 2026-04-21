import { WorkspaceContext } from '@causa/workspace';
import { FunctionRegistry } from '@causa/workspace/function-registry';
import {
  type WorkspaceFunctionCallMock,
  createContext,
  registerMockFunction,
} from '@causa/workspace/testing';
import { jest } from '@jest/globals';
import { mkdtemp, readFile, rm } from 'fs/promises';
import 'jest-extended';
import { join, resolve } from 'path';
import {
  type BackfillEvent,
  EventTopicBackfill,
  EventTopicBrokerCreateTopic,
  EventTopicBrokerCreateTrigger,
  EventTopicBrokerGetTopicId,
  EventTopicBrokerPublishEvents,
  EventTopicCreateBackfillSource,
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
  let createBackfillSourceMock: WorkspaceFunctionCallMock<EventTopicCreateBackfillSource>;
  let backfillSource: AsyncIterable<BackfillEvent>;

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
      async (_, args) => {
        const triggerId =
          typeof args.trigger === 'string'
            ? args.trigger
            : `${args.trigger.name}:${JSON.stringify(args.trigger.options)}`;
        return [
          `backfill/${args.backfillId}/${args.topicId}/trigger/${triggerId}`,
        ];
      },
    );
    publishEventsMock = registerMockFunction(
      functionRegistry,
      EventTopicBrokerPublishEvents,
      () => Promise.resolve(),
    );
    backfillSource = (async function* () {})();
    createBackfillSourceMock = registerMockFunction(
      functionRegistry,
      EventTopicCreateBackfillSource,
      async () => backfillSource,
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

  it('should default the output file to the workspace root', async () => {
    const actualFile = await context.call(EventTopicBackfill, {
      eventTopic: 'test-topic',
    });

    expect(actualFile).toMatch(
      new RegExp(`^${tmpDir}/backfill-[0-9a-f]+\\.json$`),
    );
    const actualFileContent = await readFile(actualFile);
    expect(JSON.parse(actualFileContent.toString())).toEqual({
      temporaryTopicId: null,
      temporaryTriggerResourceIds: [],
    });
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
    expect(createBackfillSourceMock).toHaveBeenCalledExactlyOnceWith(context, {
      eventTopic: 'test-topic',
      source: '🚰',
      filter: '👀',
    });
    expect(publishEventsMock).toHaveBeenCalledExactlyOnceWith(context, {
      topicId: 'broker/test-topic',
      eventTopic: 'test-topic',
      source: expect.any(Function),
    });
    expect(publishEventsMock.mock.calls[0][1].source()).toBe(backfillSource);
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
    expect(createBackfillSourceMock).toHaveBeenCalledExactlyOnceWith(context, {
      eventTopic: 'test-topic',
      source: undefined,
      filter: undefined,
    });
    expect(publishEventsMock).toHaveBeenCalledExactlyOnceWith(context, {
      topicId: expectedTopicId,
      eventTopic: 'test-topic',
      source: expect.any(Function),
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

    await expect(actualPromise).rejects.toThrow('💥');
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
      temporaryTriggerResourceIds: expect.toIncludeSameMembers([
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

    await expect(actualPromise).rejects.toThrow('💥');
    expect(createTopicMock).not.toHaveBeenCalled();
    expect(getTopicIdMock).toHaveBeenCalledExactlyOnceWith(context, {
      eventTopic: 'test-topic',
    });
    expect(createTriggerMock).not.toHaveBeenCalled();
    expect(publishEventsMock).toHaveBeenCalledExactlyOnceWith(context, {
      topicId: 'broker/test-topic',
      eventTopic: 'test-topic',
      source: expect.any(Function),
    });
    const actualFileContent = await readFile(expectedFile);
    expect(JSON.parse(actualFileContent.toString())).toEqual({
      temporaryTopicId: null,
      temporaryTriggerResourceIds: [],
    });
  });

  it('should clone the context and forward a structured trigger for project-scoped triggers', async () => {
    const expectedFile = resolve(tmpDir, 'backfill.json');
    const expectedProjectPath = join(tmpDir, 'services/orders');
    jest
      .spyOn(context, 'clone')
      .mockImplementation(async ({ workingDirectory } = {}) => {
        const { context, functionRegistry } = createContext({
          rootPath: tmpDir,
          workingDirectory,
          projectPath: workingDirectory,
        });
        registerMockFunction(
          functionRegistry,
          EventTopicBrokerCreateTrigger,
          createTriggerMock,
        );
        return context;
      });

    const actualFile = await context.call(EventTopicBackfill, {
      eventTopic: 'test-topic',
      triggers: [
        'services/orders#daily?region=eu&dryRun=true',
        'services/orders#noopts',
      ],
      output: expectedFile,
    });

    expect(actualFile).toBe(expectedFile);
    expect(context.clone).toHaveBeenCalledTimes(2);
    expect(context.clone).toHaveBeenCalledWith({
      workingDirectory: expectedProjectPath,
    });
    expect(createTriggerMock).toHaveBeenCalledWith(expect.anything(), {
      backfillId: expect.any(String),
      topicId: 'broker/test-topic',
      trigger: {
        name: 'daily',
        options: { region: 'eu', dryRun: 'true' },
      },
    });
    expect(createTriggerMock).toHaveBeenCalledWith(expect.anything(), {
      backfillId: expect.any(String),
      topicId: 'broker/test-topic',
      trigger: { name: 'noopts', options: {} },
    });
  });

  it('should wrap clone failures in an EventTopicTriggerCreationError', async () => {
    const expectedFile = resolve(tmpDir, 'backfill.json');
    jest.spyOn(context, 'clone').mockRejectedValue(new Error('💥 nope'));

    const actualPromise = context.call(EventTopicBackfill, {
      eventTopic: 'test-topic',
      triggers: ['missing/project#daily'],
      output: expectedFile,
    });

    await expect(actualPromise).rejects.toThrow('💥 nope');
    expect(createTriggerMock).not.toHaveBeenCalled();
    expect(publishEventsMock).not.toHaveBeenCalled();
    const actualFileContent = await readFile(expectedFile);
    expect(JSON.parse(actualFileContent.toString())).toEqual({
      temporaryTopicId: null,
      temporaryTriggerResourceIds: [],
    });
  });

  it('should fail when the cloned context has no project path', async () => {
    const expectedFile = resolve(tmpDir, 'backfill.json');
    jest
      .spyOn(context, 'clone')
      .mockImplementation(async ({ workingDirectory } = {}) => {
        const { context } = createContext({
          rootPath: tmpDir,
          workingDirectory,
          projectPath: null,
        });
        return context;
      });

    const actualPromise = context.call(EventTopicBackfill, {
      eventTopic: 'test-topic',
      triggers: ['not-a-project#daily'],
      output: expectedFile,
    });

    await expect(actualPromise).rejects.toThrow(
      "Trigger 'not-a-project#daily' references 'not-a-project', which is not a project directory.",
    );
    expect(createTriggerMock).not.toHaveBeenCalled();
    expect(publishEventsMock).not.toHaveBeenCalled();
    const actualFileContent = await readFile(expectedFile);
    expect(JSON.parse(actualFileContent.toString())).toEqual({
      temporaryTopicId: null,
      temporaryTriggerResourceIds: [],
    });
  });
});
