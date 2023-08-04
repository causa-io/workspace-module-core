import { WorkspaceContext } from '@causa/workspace';
import { createContext } from '@causa/workspace/testing';
import { jest } from '@jest/globals';
import 'jest-extended';
import { setTimeout } from 'timers/promises';
import { BackfillEvent } from './event.js';
import { BackfillEventPublisher } from './publisher.js';
import { BackfillEventsSource } from './source.js';

class MyPublisher extends BackfillEventPublisher {
  publishEvent(): Promise<void> | null {
    return null;
  }

  async flush(): Promise<void> {}
}

describe('BackfillEventPublisher', () => {
  let context: WorkspaceContext;
  let publisher: BackfillEventPublisher;
  let publishEventMock: jest.SpiedFunction<
    (event: BackfillEvent) => Promise<void> | null
  >;
  let flushMock: jest.SpiedFunction<() => Promise<void>>;

  beforeEach(() => {
    ({ context } = createContext({
      configuration: {
        workspace: { name: 'my-workspace' },
        events: { broker: 'google.pubSub' },
        google: { project: 'my-project' },
      },
    }));
    publisher = new MyPublisher(context);
    publishEventMock = jest.spyOn(publisher as any, 'publishEvent');
    flushMock = jest.spyOn(publisher as any, 'flush');
  });

  function makeSource(
    numBatches: number,
    numEventsInBatch: number,
  ): BackfillEventsSource {
    let batchIndex = 0;
    return {
      getBatch: async () => {
        if (batchIndex >= numBatches) {
          return null;
        }
        batchIndex++;
        return Array.from({ length: numEventsInBatch }, (_, i) => ({
          data: Buffer.from(`${batchIndex}-${i}`),
          attributes: { batch: `${batchIndex}`, index: `${i}` },
        }));
      },
      dispose: jest.fn(() => Promise.resolve()),
    };
  }

  it('should publish the events', async () => {
    const source = makeSource(2, 3);

    await publisher.publishFromSource(source);

    expect(publisher['publishEvent']).toHaveBeenCalledTimes(6);
    const actualMessages = publishEventMock.mock.calls.map(([msg]) => ({
      ...msg,
      data: msg.data.toString(),
    }));
    expect(actualMessages).toEqual([
      { data: '1-0', attributes: { batch: '1', index: '0' } },
      { data: '1-1', attributes: { batch: '1', index: '1' } },
      { data: '1-2', attributes: { batch: '1', index: '2' } },
      { data: '2-0', attributes: { batch: '2', index: '0' } },
      { data: '2-1', attributes: { batch: '2', index: '1' } },
      { data: '2-2', attributes: { batch: '2', index: '2' } },
    ]);
    expect(flushMock).toHaveBeenCalledOnce();
    expect(source.dispose).toHaveBeenCalledOnce();
  });

  it('should wait for the publisher to catch up', async () => {
    const source = makeSource(2, 3);
    let waitPromiseResolve!: () => void;
    const waitPromise = new Promise<void>(
      (resolve) => (waitPromiseResolve = resolve),
    );
    publishEventMock.mockImplementationOnce(() => waitPromise);

    const publishPromise = publisher.publishFromSource(source);
    await setTimeout(50);

    expect(publishEventMock).toHaveBeenCalledExactlyOnceWith({
      data: expect.toSatisfy((d) => d.toString() === '1-0'),
      attributes: { batch: '1', index: '0' },
    });
    expect(flushMock).not.toHaveBeenCalled();
    waitPromiseResolve();

    await publishPromise;
    expect(publishEventMock).toHaveBeenCalledTimes(6);
    expect(flushMock).toHaveBeenCalledOnce();
  });
});
