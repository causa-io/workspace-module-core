import { NoImplementationFoundError } from '@causa/workspace/function-registry';
import { createContext } from '@causa/workspace/testing';
import 'jest-extended';
import {
  EventTopicList,
  EventTopicListReferencedInProject,
  MissingEventTopicDefinitionsError,
  type EventTopicDefinition,
} from '../../definitions/index.js';
import { EventTopicListReferencedInProjectForServiceContainer } from './list-referenced-in-project-service-container.js';

describe('EventTopicListReferencedInProjectForServiceContainer', () => {
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
    project: { type: 'serviceContainer', language: 'ts', name: '🧪' },
  };

  it('should return empty lists', async () => {
    const { context } = createContext({
      configuration: baseConfiguration,
      functions: [
        EventTopicListReferencedInProjectForServiceContainer,
        EventTopicListMock,
      ],
    });

    const actualTopics = await context.call(
      EventTopicListReferencedInProject,
      {},
    );

    expect(actualTopics).toEqual({ consumed: [], produced: [] });
  });

  it('should return the consumed and produced topic', async () => {
    const { context } = createContext({
      configuration: {
        ...baseConfiguration,
        serviceContainer: {
          triggers: {
            myFirstTrigger: { type: 'event', topic: 'my.first-event.v1' },
            mySecondTrigger: { type: 'event', topic: 'my.second-event.v1' },
            myThirdTrigger: { type: 'event', topic: 'my.second-event.v1' },
            notAnEventTrigger: { type: 'cron', schedule: '* * * * *' },
          },
          outputs: {
            eventTopics: [
              'my.first-event.v1',
              'my.other-event.v1',
              'my.other-event.v1',
            ],
          },
        },
      },
      functions: [
        EventTopicListReferencedInProjectForServiceContainer,
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

  it('should throw if a non-existing event topic is referenced', async () => {
    const { context } = createContext({
      configuration: {
        ...baseConfiguration,
        serviceContainer: {
          triggers: {
            myTrigger: { type: 'event', topic: 'my.non-existing-event.v1' },
          },
        },
      },
      functions: [
        EventTopicListReferencedInProjectForServiceContainer,
        EventTopicListMock,
      ],
    });

    const actualPromise = context.call(EventTopicListReferencedInProject, {});

    await expect(actualPromise).rejects.toThrow(
      MissingEventTopicDefinitionsError,
    );
  });

  it('should not handle a project type other than service container', async () => {
    const { context } = createContext({
      configuration: {
        ...baseConfiguration,
        project: { type: 'function', language: 'ts', name: '🧪' },
      },
      functions: [EventTopicListReferencedInProjectForServiceContainer],
    });

    expect(() => context.call(EventTopicListReferencedInProject, {})).toThrow(
      NoImplementationFoundError,
    );
  });
});
