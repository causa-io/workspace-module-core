import { NoImplementationFoundError } from '@causa/workspace/function-registry';
import { createContext } from '@causa/workspace/testing';
import 'jest-extended';
import { EventTopicListReferencedInProject } from '../definitions/index.js';
import { EventTopicListReferencedInProjectForServiceContainer } from './event-topic-list-referenced-in-project-service-container.js';

describe('EventTopicListReferencedInProjectForServiceContainer', () => {
  it('should return empty lists', async () => {
    const { context } = createContext({
      configuration: {
        workspace: { name: '🏷️' },
        project: { type: 'serviceContainer', language: 'ts', name: '🧪' },
      },
      functions: [EventTopicListReferencedInProjectForServiceContainer],
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
        workspace: { name: '🏷️' },
        project: { type: 'serviceContainer', language: 'ts', name: '🧪' },
        serviceContainer: {
          triggers: {
            myFirstTrigger: {
              type: 'event',
              topic: 'my.first-event.v1',
            },
            mySecondTrigger: {
              type: 'event',
              topic: 'my.second-event.v1',
            },
            myThirdTrigger: {
              type: 'event',
              topic: 'my.second-event.v1',
            },
            notAnEventTrigger: {
              type: 'cron',
              schedule: '* * * * *',
            },
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
      functions: [EventTopicListReferencedInProjectForServiceContainer],
    });

    const actualTopics = await context.call(
      EventTopicListReferencedInProject,
      {},
    );

    expect(actualTopics).toEqual({
      consumed: expect.toContainAllValues([
        'my.first-event.v1',
        'my.second-event.v1',
      ]),
      produced: expect.toContainAllValues([
        'my.first-event.v1',
        'my.other-event.v1',
      ]),
    });
  });

  it('should not handle a project type other than service container', async () => {
    const { context } = createContext({
      configuration: {
        workspace: { name: '🏷️' },
        project: { type: 'function', language: 'ts', name: '🧪' },
      },
      functions: [EventTopicListReferencedInProjectForServiceContainer],
    });

    expect(() => context.call(EventTopicListReferencedInProject, {})).toThrow(
      NoImplementationFoundError,
    );
  });
});
