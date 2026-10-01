import { WorkspaceContext } from '@causa/workspace';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import 'jest-extended';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { pino } from 'pino';
import { GraphContext } from './context.js';
import { DomainsFact } from './domains.js';
import { projectAt, ProjectsFact } from './projects.js';

describe('projects', () => {
  let rootPath: string;
  let graph: GraphContext;

  beforeEach(async () => {
    rootPath = resolve(await mkdtemp(join(tmpdir(), 'causa-tests-')));
    const files = {
      'causa.yaml':
        'workspace:\n  name: test\ninfrastructure:\n  environmentProject: ./tools/\n',
      'domains/ordering/causa.yaml': 'domain:\n  name: Ordering\n',
      'domains/ordering/api/causa.yaml':
        'project:\n  name: ordering-api\n  type: serviceContainer\n  language: typescript\n',
      'tools/causa.yaml': 'project:\n  name: tools\n',
    };
    for (const [file, content] of Object.entries(files)) {
      await mkdir(dirname(join(rootPath, file)), { recursive: true });
      await writeFile(join(rootPath, file), content);
    }

    graph = new GraphContext(
      await WorkspaceContext.init({
        workingDirectory: rootPath,
        logger: pino({ level: 'silent' }),
      }),
    );
  });

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true });
  });

  describe('ProjectsFact', () => {
    it('should list the projects of the workspace, their domain, and the environment project', async () => {
      const [ordering] = await graph.get(DomainsFact);

      const actualProjects = await graph.get(ProjectsFact);

      expect(
        actualProjects.map((p) => [
          p.directory,
          p.name,
          p.type,
          p.language,
          p.environment,
          p.domain,
        ]),
      ).toEqual([
        [
          'domains/ordering/api',
          'ordering-api',
          'serviceContainer',
          'typescript',
          false,
          ordering,
        ],
        ['tools', 'tools', undefined, undefined, true, undefined],
      ]);
    });

    it('should expose a context reading the configuration of each project', async () => {
      const [api] = await graph.get(ProjectsFact);

      const actualSource = await graph.locator.configurationSource(
        api.context,
        ['project', 'name'],
      );

      expect(actualSource).toEqual({
        path: 'domains/ordering/api/causa.yaml',
        pointer: '/project/name',
        location: {
          start: { line: 2, column: 3 },
          end: { line: 2, column: 20 },
        },
      });
    });
  });

  describe('projectAt', () => {
    it('should return the project containing a directory', async () => {
      const projects = await graph.get(ProjectsFact);

      expect(projectAt(projects, 'domains/ordering/api/src')).toBe(projects[0]);
      expect(projectAt(projects, 'tools')).toBe(projects[1]);
      expect(projectAt(projects, 'domains/ordering')).toBeUndefined();
      expect(projectAt(projects, 'tools-other')).toBeUndefined();
    });
  });
});
