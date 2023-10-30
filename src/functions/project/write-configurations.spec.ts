import { BaseConfiguration, WorkspaceContext } from '@causa/workspace';
import { PartialConfiguration } from '@causa/workspace/configuration';
import { createContext } from '@causa/workspace/testing';
import { existsSync } from 'fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import 'jest-extended';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { ProjectWriteConfigurations } from './write-configurations.js';

describe('ProjectWriteConfigurations', () => {
  let context: WorkspaceContext;

  beforeEach(async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'causa-tests-'));
    ({ context } = createContext({
      rootPath,
      configuration: { workspace: { name: '🏷️' } },
      functions: [ProjectWriteConfigurations],
    }));
  });

  afterEach(async () => {
    await rm(context.rootPath, { recursive: true, force: true });
  });

  async function writeConfiguration(
    relativePath: string,
    configuration: PartialConfiguration<BaseConfiguration> &
      Record<string, any>,
  ): Promise<void> {
    const fullPath = join(context.rootPath, relativePath);
    const dirPath = dirname(fullPath);

    await mkdir(dirPath, { recursive: true });

    const confStr = JSON.stringify(configuration);
    await writeFile(fullPath, confStr);
  }

  async function readActualProjectConfiguration(
    project: string,
  ): Promise<object> {
    const configurationFile = join(
      context.rootPath,
      '.causa',
      'project-configurations',
      `${project}.json`,
    );
    const bufferConfiguration = await readFile(configurationFile);
    return JSON.parse(bufferConfiguration.toString());
  }

  it('should write configurations to the default directory', async () => {
    await writeConfiguration('causa.yaml', {
      workspace: { name: '🏷️' },
      someBaseConf: '🔧',
    });
    await writeConfiguration('project1/causa.project.yaml', {
      project: { name: 'my-first-project', type: '🐳', language: '🐍' },
      someFirstProjectConf: '🥇',
    });
    await writeConfiguration('project2/causa.yaml', {
      project: { name: 'my-second-project', type: '🐳', language: '🐍' },
      someSecondProjectConf: '🥈',
    });

    const actualResult = await context.call(ProjectWriteConfigurations, {});

    expect(actualResult).toEqual({
      configuration: {
        causa: {
          projectConfigurationsDirectory: join(
            '.causa',
            'project-configurations',
          ),
        },
      },
    });
    const actualFirstProjectConf =
      await readActualProjectConfiguration('my-first-project');
    expect(actualFirstProjectConf).toEqual({
      workspace: { name: '🏷️' },
      someBaseConf: '🔧',
      project: { name: 'my-first-project', type: '🐳', language: '🐍' },
      someFirstProjectConf: '🥇',
    });
    const actualSecondProjectConf =
      await readActualProjectConfiguration('my-second-project');
    expect(actualSecondProjectConf).toEqual({
      workspace: { name: '🏷️' },
      someBaseConf: '🔧',
      project: { name: 'my-second-project', type: '🐳', language: '🐍' },
      someSecondProjectConf: '🥈',
    });
  });

  it('should write configurations to the configured directory', async () => {
    const expectedDirectory = 'my-configs';
    await writeConfiguration('causa.yaml', {
      workspace: { name: '🏷️' },
      project: { name: 'my-project', type: '🐳', language: '🐍' },
    });
    ({ context } = createContext({
      rootPath: context.rootPath,
      configuration: {
        workspace: { name: '🏷️' },
        causa: {
          projectConfigurationsDirectory: expectedDirectory,
        } as any,
      },
      functions: [ProjectWriteConfigurations],
    }));

    const actualResult = await context.call(ProjectWriteConfigurations, {});

    expect(actualResult).toEqual({
      configuration: {
        causa: {
          projectConfigurationsDirectory: expectedDirectory,
        },
      },
    });
    const actualFirstProjectConf = await readFile(
      join(context.rootPath, expectedDirectory, 'my-project.json'),
    );
    expect(JSON.parse(actualFirstProjectConf.toString())).toEqual({
      workspace: { name: '🏷️' },
      project: { name: 'my-project', type: '🐳', language: '🐍' },
    });
  });

  it('should keep the environment set', async () => {
    await writeConfiguration('causa.yaml', {
      workspace: { name: '🏷️' },
      project: { name: 'my-project', type: '🐳', language: '🐍' },
      renderedVar: { $format: "✅ ${ configuration('devVar') }" },
      environments: {
        dev: { name: 'Dev', configuration: { devVar: '👷' } },
      },
    });
    ({ context } = createContext({
      rootPath: context.rootPath,
      configuration: { workspace: { name: '🏷️' } },
      environment: 'dev',
      functions: [ProjectWriteConfigurations],
    }));

    await context.call(ProjectWriteConfigurations, {});

    const actualFirstProjectConf =
      await readActualProjectConfiguration('my-project');
    expect(actualFirstProjectConf).toEqual({
      workspace: { name: '🏷️' },
      project: { name: 'my-project', type: '🐳', language: '🐍' },
      environments: {
        dev: { name: 'Dev', configuration: { devVar: '👷' } },
      },
      devVar: '👷',
      renderedVar: '✅ 👷',
    });
  });

  it('should clean the directory during tear down', async () => {
    await writeConfiguration('causa.yaml', {
      workspace: { name: '🏷️' },
      project: { name: 'my-project', type: '🐳', language: '🐍' },
    });
    const result = await context.call(ProjectWriteConfigurations, {});
    const configurationDirectory = join(
      context.rootPath,
      result.configuration.causa.projectConfigurationsDirectory,
    );
    const existsAfterWrite = existsSync(configurationDirectory);

    await context.call(ProjectWriteConfigurations, { tearDown: true });
    const existsAfterTearDown = existsSync(configurationDirectory);

    expect(existsAfterWrite).toBeTrue();
    expect(existsAfterTearDown).toBeFalse();
  });
});
