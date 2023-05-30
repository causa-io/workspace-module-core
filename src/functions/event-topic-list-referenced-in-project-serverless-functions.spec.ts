import { NoImplementationFoundError } from '@causa/workspace/function-registry';
import { createContext } from '@causa/workspace/testing';
import 'jest-extended';
import { EventTopicListReferencedInProject } from '../definitions/index.js';
import { EventTopicListReferencedInProjectForServerlessFunctions } from './event-topic-list-referenced-in-project-serverless-functions.js';

describe('EventTopicListReferencedInProjectForServerlessFunctions', () => {
  it('should not handle a project of type other than serverless functions', async () => {
    const { context } = createContext({
      configuration: {
        workspace: { name: '🏷️' },
        project: { type: 'serviceContainer', language: 'ts', name: '🧪' },
      },
      functions: [EventTopicListReferencedInProjectForServerlessFunctions],
    });

    expect(() => context.call(EventTopicListReferencedInProject, {})).toThrow(
      NoImplementationFoundError,
    );
  });

  it('should return empty lists', async () => {
    const { context } = createContext({
      configuration: {
        workspace: { name: '🏷️' },
        project: { type: 'serverlessFunctions', language: 'ts', name: '🧪' },
      },
      functions: [EventTopicListReferencedInProjectForServerlessFunctions],
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
        project: { type: 'serverlessFunctions', language: 'ts', name: '🧪' },
        serverlessFunctions: {
          functions: {
            myFirstFunction: {
              trigger: {
                type: 'event',
                topic: 'my.first-event.v1',
              },
              outputs: {
                eventTopics: ['my.first-event.v1'],
              },
            },
            mySecondFunction: {
              trigger: {
                type: 'event',
                topic: 'my.second-event.v1',
              },
              outputs: {
                eventTopics: ['my.first-event.v1'],
              },
            },
            myThirdFunction: {
              trigger: {
                type: 'event',
                topic: 'my.second-event.v1',
              },
            },
            notAnEventFunction: {
              trigger: {
                type: 'cron',
                schedule: '* * * * *',
              },
              outputs: {
                eventTopics: ['my.other-event.v1'],
              },
            },
          },
        },
      },
      functions: [EventTopicListReferencedInProjectForServerlessFunctions],
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
});
