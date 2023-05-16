import { WorkspaceContext } from '@causa/workspace';
import { createContext } from '@causa/workspace/testing';
import { jest } from '@jest/globals';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import 'jest-extended';
import { join, resolve } from 'path';
import {
  DuplicateEventTopicError,
  EventTopicList,
} from '../definitions/index.js';
import { EventTopicListForAll } from './event-topic-list.js';

describe('EventTopicListForAll', () => {
  let context: WorkspaceContext;

  beforeEach(async () => {
    const rootPath = resolve(await mkdtemp('causa-tests-'));
    ({ context } = createContext({
      rootPath,
      functions: [EventTopicListForAll],
      configuration: {
        workspace: { name: '🧪' },
        events: {
          topics: {
            globs: ['*/*.{yaml,yml}'],
            regularExpression: '^(?<folder>\\w+)\\/(?<name>\\w+)\\.yaml$',
            format: '${ name }',
          },
        },
      },
    }));
  });

  afterEach(async () => {
    await rm(context.rootPath, { recursive: true, force: true });
  });

  it('should return topic definitions', async () => {
    const firstEventFilePath = join(
      context.rootPath,
      'firstFolder/myEvent.yaml',
    );
    const secondEventFilePath = join(
      context.rootPath,
      'secondFolder/myOtherEvent.yaml',
    );
    await mkdir(join(context.rootPath, 'firstFolder'));
    await mkdir(join(context.rootPath, 'secondFolder'));
    await writeFile(firstEventFilePath, '📫');
    await writeFile(secondEventFilePath, '📫');

    const actualDefinitions = await context.call(EventTopicList, {});

    expect(actualDefinitions).toHaveLength(2);
    expect(actualDefinitions).toContainEqual({
      id: 'myEvent',
      formatParts: { folder: 'firstFolder', name: 'myEvent' },
      schemaFilePath: firstEventFilePath,
    });
    expect(actualDefinitions).toContainEqual({
      id: 'myOtherEvent',
      formatParts: { folder: 'secondFolder', name: 'myOtherEvent' },
      schemaFilePath: secondEventFilePath,
    });
  });

  it('should throw an error for duplicate IDs', async () => {
    await mkdir(join(context.rootPath, 'firstFolder'));
    await mkdir(join(context.rootPath, 'secondFolder'));
    await writeFile(join(context.rootPath, 'firstFolder/myEvent.yaml'), '📫');
    await writeFile(join(context.rootPath, 'secondFolder/myEvent.yaml'), '📫');

    const actualPromise = context.call(EventTopicList, {});

    await expect(actualPromise).rejects.toThrow(DuplicateEventTopicError);
  });

  it('should log a warning when a file does not match the regular expression', async () => {
    const firstEventFilePath = join(
      context.rootPath,
      'firstFolder/myEvent.yaml',
    );
    await mkdir(join(context.rootPath, 'firstFolder'));
    await mkdir(join(context.rootPath, 'secondFolder'));
    await writeFile(firstEventFilePath, '📫');
    await writeFile(
      join(context.rootPath, 'secondFolder/myOtherEvent.yml'),
      '📫',
    );
    jest.spyOn(context.logger, 'warn');

    const actualDefinitions = await context.call(EventTopicList, {});

    expect(actualDefinitions).toEqual([
      {
        id: 'myEvent',
        formatParts: { folder: 'firstFolder', name: 'myEvent' },
        schemaFilePath: firstEventFilePath,
      },
    ]);
    expect(context.logger.warn).toHaveBeenCalledOnce();
  });
});
