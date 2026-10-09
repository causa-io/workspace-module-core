import { WorkspaceContext } from '@causa/workspace';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import 'jest-extended';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { pino } from 'pino';
import { GraphContext, GraphFactError } from './context.js';
import { domainAt, DomainsFact, domainOfFile } from './domains.js';

describe('domains', () => {
  let rootPath: string;
  let graph: GraphContext;

  beforeEach(async () => {
    rootPath = resolve(await mkdtemp(join(tmpdir(), 'causa-tests-')));
    const files = {
      'causa.yaml': 'workspace:\n  name: test\n',
      'domains/ordering/causa.yaml':
        'domain:\n  name: Ordering\n  description: Orders.\n',
      'domains/shipping/causa.shipping.yaml': 'domain:\n  name: Shipping\n',
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

  describe('DomainsFact', () => {
    it('should list the domains of the workspace', async () => {
      const actualDomains = await graph.get(DomainsFact);

      expect(
        actualDomains.map((d) => [d.directory, d.name, d.description]),
      ).toEqual([
        ['domains/ordering', 'Ordering', 'Orders.'],
        ['domains/shipping', 'Shipping', undefined],
      ]);
    });

    it('should expose a context reading the configuration of each domain', async () => {
      const [, shipping] = await graph.get(DomainsFact);

      const actualSource = await graph.locator.configurationSource(
        shipping.context,
        ['domain'],
      );

      expect(actualSource).toEqual({
        path: 'domains/shipping/causa.shipping.yaml',
        pointer: '/domain',
        location: {
          start: { line: 1, column: 1 },
          end: { line: 2, column: 17 },
        },
      });
    });

    it('should fail when a domain is templated', async () => {
      await writeFile(
        join(rootPath, 'domains/shipping/causa.shipping.yaml'),
        'domain:\n  name:\n    $format: "${ configuration(\'workspace.name\') }"\n',
      );
      graph = new GraphContext(
        await WorkspaceContext.init({
          workingDirectory: rootPath,
          logger: pino({ level: 'silent' }),
        }),
      );

      const actualPromise = graph.get(DomainsFact);

      await expect(actualPromise).rejects.toThrow(GraphFactError);
      expect(graph.failures).toEqual([
        {
          name: 'DomainsFact',
          message: expect.stringContaining('domain'),
        },
      ]);
    });
  });

  describe('domainAt', () => {
    it('should return the domain containing a directory', async () => {
      const domains = await graph.get(DomainsFact);

      expect(domainAt(domains, 'domains/ordering/api')).toBe(domains[0]);
      expect(domainAt(domains, 'domains/ordering')).toBe(domains[0]);
      expect(domainAt(domains, 'domains/ordering-other')).toBeUndefined();
    });
  });

  describe('domainOfFile', () => {
    it('should return the domain containing a file', async () => {
      const domains = await graph.get(DomainsFact);

      expect(domainOfFile(domains, 'domains/shipping/x/y.yaml')).toBe(
        domains[1],
      );
      expect(domainOfFile(domains, 'domains/shipping.yaml')).toBeUndefined();
    });
  });
});
