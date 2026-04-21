import { WorkspaceContext } from '@causa/workspace';
import { NoImplementationFoundError } from '@causa/workspace/function-registry';
import { createContext } from '@causa/workspace/testing';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import 'jest-extended';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { EventTopicCreateBackfillSource } from '../../definitions/index.js';
import { EventTopicCreateBackfillSourceFromJsonFiles } from './create-backfill-source-json-files.js';

describe('EventTopicCreateBackfillSourceFromJsonFiles', () => {
  let rootPath: string;
  let context: WorkspaceContext;

  beforeEach(async () => {
    rootPath = resolve(await mkdtemp(join(tmpdir(), 'causa-test-')));
    ({ context } = createContext({
      rootPath,
      functions: [EventTopicCreateBackfillSourceFromJsonFiles],
    }));
  });

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true });
  });

  it('should not handle sources that are not json URIs', () => {
    expect(() =>
      context.call(EventTopicCreateBackfillSource, {
        eventTopic: 'test-topic',
        source: 'bq://dataset.table',
      }),
    ).toThrow(NoImplementationFoundError);
  });

  it('should not handle a missing source', () => {
    expect(() =>
      context.call(EventTopicCreateBackfillSource, {
        eventTopic: 'test-topic',
      }),
    ).toThrow(NoImplementationFoundError);
  });

  it('should yield parseable events from all matched files in sorted order', async () => {
    const fileA = join(rootPath, 'a.jsonl');
    const fileB = join(rootPath, 'b.jsonl');
    await writeFile(
      fileA,
      [
        JSON.stringify({ data: 'a1', attributes: { i: '0' } }),
        JSON.stringify({ data: 'a2', key: 'k' }),
      ].join('\n'),
    );
    await writeFile(fileB, JSON.stringify({ data: 'b1' }));

    const iterable = await context.call(EventTopicCreateBackfillSource, {
      eventTopic: 'test-topic',
      source: `json://${rootPath}/*.jsonl`,
    });

    const events = await Array.fromAsync(iterable);
    expect(events).toEqual([
      { data: Buffer.from('a1'), attributes: { i: '0' }, key: undefined },
      { data: Buffer.from('a2'), attributes: undefined, key: 'k' },
      { data: Buffer.from('b1'), attributes: undefined, key: undefined },
    ]);
  });

  it('should skip unparseable lines', async () => {
    const file = join(rootPath, 'events.jsonl');
    await writeFile(
      file,
      [JSON.stringify({ data: 'ok' }), 'not-json'].join('\n'),
    );

    const iterable = await context.call(EventTopicCreateBackfillSource, {
      eventTopic: 'test-topic',
      source: `json://${file}`,
    });

    const events = await Array.fromAsync(iterable);
    expect(events).toEqual([
      { data: Buffer.from('ok'), attributes: undefined, key: undefined },
    ]);
  });

  it('should throw when a filter is provided', async () => {
    const actualPromise = context.call(EventTopicCreateBackfillSource, {
      eventTopic: 'test-topic',
      source: `json://${rootPath}/*.jsonl`,
      filter: '👀',
    });

    await expect(actualPromise).rejects.toThrow(
      'Filtering JSON events from files is not supported.',
    );
  });
});
