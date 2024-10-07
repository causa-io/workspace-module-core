import { WorkspaceContext } from '@causa/workspace';
import { createContext } from '@causa/workspace/testing';
import { jest } from '@jest/globals';
import { mkdtemp, rm, symlink, writeFile } from 'fs/promises';
import 'jest-extended';
import { resolve } from 'path';
import type { BackfillEvent } from './event.js';
import { JsonFilesEventSource } from './json-files-source.js';

describe('JsonFilesEventSource', () => {
  let tmpDir: string;
  let context: WorkspaceContext;

  beforeEach(async () => {
    tmpDir = resolve(await mkdtemp('causa-test-'));
    ({ context } = createContext({
      rootPath: tmpDir,
      configuration: { workspace: { name: 'my-workspace' } },
    }));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('fromSourceAndFilter', () => {
    it('should return null if the source is not a JSON files source', async () => {
      const actualSource = await JsonFilesEventSource.fromSourceAndFilter(
        context,
        'bq://my-project/my-dataset/my-table',
        undefined,
      );

      expect(actualSource).toBeNull();
    });

    it('should throw if a filter is provided', async () => {
      const actualPromise = JsonFilesEventSource.fromSourceAndFilter(
        context,
        'json://some-glob',
        'attribute = "value"',
      );

      expect(actualPromise).rejects.toThrow(
        'Filtering JSON events from files is not supported.',
      );
    });

    it('should initialize the source and ignore symlinks', async () => {
      const file1 = resolve(tmpDir, 'file1.json');
      const file2 = resolve(tmpDir, 'file2.json');
      await writeFile(file1, '1️⃣');
      await writeFile(file2, '2️⃣');
      await writeFile(resolve(tmpDir, 'file3.txt'), '❌');
      await symlink(file1, resolve(tmpDir, 'symlink.json'));

      const actualSource = await JsonFilesEventSource.fromSourceAndFilter(
        context,
        `json://${tmpDir}/*.json`,
        undefined,
      );

      expect(actualSource).toBeInstanceOf(JsonFilesEventSource);
      expect(actualSource?.files).toEqual([file1, file2]);
    });
  });

  describe('getBatch', () => {
    let source: JsonFilesEventSource | null;

    afterEach(async () => {
      await source?.dispose();
    });

    async function createJsonFile(
      name: string,
      numLines: number,
    ): Promise<string> {
      let content = '';
      for (let i = 0; i < numLines; i++) {
        content +=
          JSON.stringify({
            data: `${i}`,
            attributes: { someAttribute: `${name} ${i}` },
          }) + '\n';
      }
      const path = resolve(tmpDir, name);
      await writeFile(path, content);
      return path;
    }

    it('should read files in batches', async () => {
      await createJsonFile('file1.json', 20000);
      await createJsonFile('file2.json', 17000);
      source = await JsonFilesEventSource.fromSourceAndFilter(
        context,
        `json://${tmpDir}/*.json`,
        undefined,
      );

      let batch: BackfillEvent[] | null | undefined;
      const batches: BackfillEvent[][] = [];
      while ((batch = await source?.getBatch())) {
        batches.push(batch);
      }

      expect(batches).toHaveLength(4);
      const actualNumEvents = batches.reduce(
        (sum, batch) => sum + batch.length,
        0,
      );
      expect(actualNumEvents).toEqual(37000);
      expect(
        new Set(
          batches.flatMap((b) => b.map((e) => e.attributes?.someAttribute)),
        ).size,
      ).toEqual(37000);
    });

    it('should ignore and log invalid events', async () => {
      await createJsonFile('file1.json', 1);
      await writeFile(resolve(tmpDir, 'file2.json'), 'nope\n');
      await createJsonFile('file3.json', 1);
      source = await JsonFilesEventSource.fromSourceAndFilter(
        context,
        `json://${tmpDir}/*.json`,
        undefined,
      );
      jest.spyOn(context.logger, 'error');

      let batch: BackfillEvent[] | null | undefined;
      const batches: BackfillEvent[][] = [];
      while ((batch = await source?.getBatch())) {
        batches.push(batch);
      }

      expect(batches).toHaveLength(3);
      const actualNumEvents = batches.reduce(
        (sum, batch) => sum + batch.length,
        0,
      );
      expect(actualNumEvents).toEqual(2);
      expect(
        new Set(
          batches.flatMap((b) => b.map((e) => e.attributes?.someAttribute)),
        ).size,
      ).toEqual(2);
      expect(context.logger.error).toHaveBeenCalledExactlyOnceWith(
        expect.stringMatching(`Failed to parse event 'nope':`),
      );
    });
  });
});
