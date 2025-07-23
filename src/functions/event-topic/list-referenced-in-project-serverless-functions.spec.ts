import { NoImplementationFoundError } from '@causa/workspace/function-registry';
import { createContext } from '@causa/workspace/testing';
import 'jest-extended';
import {
  EventTopicList,
  EventTopicListReferencedInProject,
  MissingEventTopicDefinitionsError,
  type EventTopicDefinition,
} from '../../definitions/index.js';
import { EventTopicListReferencedInProjectForServerlessFunctions } from './list-referenced-in-project-serverless-functions.js';

describe('EventTopicListReferencedInProjectForServerlessFunctions', () => {
  const myFirstEventDefinition = {
    id: 'my.first-event.v1',
    formatParts: { domain: 'my', name: 'first-event', version: 'v1' },
    schemaFilePath: 'my/first-event/v1.yaml',
  };
  const mySecondEventDefinition = {
    id: 'my.second-event.v1',
    formatParts: { domain: 'my', name: 'second-event', version: 'v1' },
    schemaFilePath: 'my/second-event/v1.yaml',
  };
  const myOtherEventDefinition = {
    id: 'my.other-event.v1',
    formatParts: { domain: 'my', name: 'other-event', version: 'v1' },
    schemaFilePath: 'my/other-event/v1.yaml',
  };

  class EventTopicListMock extends EventTopicList {
    async _call(): Promise<EventTopicDefinition[]> {
      return [
        myFirstEventDefinition,
        mySecondEventDefinition,
        myOtherEventDefinition,
      ];
    }

    _supports(): boolean {
      return true;
    }
  }

  const baseConfiguration = {
    workspace: { name: '🏷️' },
    project: { type: 'serverlessFunctions', language: 'ts', name: '🧪' },
  };

  it('should not handle a project of type other than serverless functions', async () => {
    const { context } = createContext({
      configuration: {
        ...baseConfiguration,
        project: { type: 'serviceContainer', language: 'ts', name: '🧪' },
      },
      functions: [
        EventTopicListReferencedInProjectForServerlessFunctions,
        EventTopicListMock,
      ],
    });

    expect(() => context.call(EventTopicListReferencedInProject, {})).toThrow(
      NoImplementationFoundError,
    );
  });

  it('should return empty lists', async () => {
    const { context } = createContext({
      configuration: baseConfiguration,
      functions: [
        EventTopicListReferencedInProjectForServerlessFunctions,
        EventTopicListMock,
      ],
    });

    const actualTopics = await context.call(
      EventTopicListReferencedInProject,
      {},
    );

    expect(actualTopics).toEqual({ consumed: [], produced: [] });
  });

  it('should throw if a non-existing event topic is referenced', async () => {
    const { context } = createContext({
      configuration: {
        ...baseConfiguration,
        serverlessFunctions: {
          functions: {
            myFunction: {
              trigger: { type: 'event', topic: 'my.non-existing-event.v1' },
            },
          },
        },
      },
      functions: [
        EventTopicListReferencedInProjectForServerlessFunctions,
        EventTopicListMock,
      ],
    });

    const actualPromise = context.call(EventTopicListReferencedInProject, {});

    await expect(actualPromise).rejects.toThrow(
      MissingEventTopicDefinitionsError,
    );
  });

  it('should return the consumed and produced topic', async () => {
    const { context } = createContext({
      configuration: {
        ...baseConfiguration,
        serverlessFunctions: {
          functions: {
            myFirstFunction: {
              trigger: { type: 'event', topic: 'my.first-event.v1' },
              outputs: { eventTopics: ['my.first-event.v1'] },
            },
            mySecondFunction: {
              trigger: { type: 'event', topic: 'my.second-event.v1' },
              outputs: { eventTopics: ['my.first-event.v1'] },
            },
            myThirdFunction: {
              trigger: { type: 'event', topic: 'my.second-event.v1' },
            },
            notAnEventFunction: {
              trigger: { type: 'cron', schedule: '* * * * *' },
              outputs: { eventTopics: ['my.other-event.v1'] },
            },
          },
        },
      },
      functions: [
        EventTopicListReferencedInProjectForServerlessFunctions,
        EventTopicListMock,
      ],
    });

    const actualTopics = await context.call(
      EventTopicListReferencedInProject,
      {},
    );

    expect(actualTopics).toEqual({
      consumed: expect.toIncludeSameMembers([
        myFirstEventDefinition,
        mySecondEventDefinition,
      ]),
      produced: expect.toIncludeSameMembers([
        myFirstEventDefinition,
        myOtherEventDefinition,
      ]),
    });
  });
});
