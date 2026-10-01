import { WorkspaceContext } from '@causa/workspace';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { pino } from 'pino';
import { YamlLocator } from './locate.js';

describe('locate', () => {
  describe('YamlLocator', () => {
    let rootPath: string;

    beforeEach(async () => {
      rootPath = resolve(await mkdtemp(join(tmpdir(), 'causa-tests-')));
      await writeFile(
        join(rootPath, 'causa.yaml'),
        'project:\n  name: api\n  triggers:\n    onOrder:\n      topic: t\n',
      );
    });

    afterEach(async () => {
      await rm(rootPath, { recursive: true, force: true });
    });

    it('should locate a mapping entry from its key', async () => {
      const locator = new YamlLocator(rootPath);

      const actualSource = await locator.source('causa.yaml', [
        'project',
        'triggers',
        'onOrder',
      ]);

      expect(actualSource).toEqual({
        path: 'causa.yaml',
        pointer: '/project/triggers/onOrder',
        location: {
          start: { line: 4, column: 5 },
          end: { line: 5, column: 15 },
        },
      });
    });

    it('should return the file alone when the construct cannot be found', async () => {
      const locator = new YamlLocator(rootPath);

      expect(await locator.source('causa.yaml')).toEqual({
        path: 'causa.yaml',
      });
      expect(await locator.source('causa.yaml', ['nope'])).toEqual({
        path: 'causa.yaml',
        pointer: '/nope',
      });
      expect(await locator.source('missing.yaml', ['nope'])).toEqual({
        path: 'missing.yaml',
        pointer: '/nope',
      });
    });

    it('should locate a configuration value in the file declaring it', async () => {
      await writeFile(
        join(rootPath, 'causa.yaml'),
        'workspace:\n  name: test\n',
      );
      await mkdir(join(rootPath, 'api'));
      await writeFile(
        join(rootPath, 'api', 'causa.yaml'),
        'project:\n  name: api\nserviceContainer:\n  outputs:\n    google.spanner:\n      - main.orders\n',
      );
      const context = await WorkspaceContext.init({
        workingDirectory: join(rootPath, 'api'),
        logger: pino({ level: 'silent' }),
      });
      const locator = new YamlLocator(rootPath);

      const actualSource = await locator.configurationSource(context, [
        'serviceContainer',
        'outputs',
        'google.spanner',
        0,
      ]);
      const actualUndeclared = await locator.configurationSource(context, [
        'serviceContainer',
        'nope',
      ]);

      expect(actualSource).toEqual({
        path: 'api/causa.yaml',
        pointer: '/serviceContainer/outputs/google.spanner/0',
        location: {
          start: { line: 6, column: 9 },
          end: { line: 6, column: 19 },
        },
      });
      expect(actualUndeclared).toEqual({
        path: '.',
        pointer: '/serviceContainer/nope',
      });
    });
  });
});
