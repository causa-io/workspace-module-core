import type { WorkspaceContext } from '@causa/workspace';
import type { FunctionRegistry } from '@causa/workspace/function-registry';
import {
  createContext,
  registerMockFunction,
  type WorkspaceFunctionCallMock,
} from '@causa/workspace/testing';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import 'jest-extended';
import { join, resolve } from 'path';
import {
  EventTopicListReferencedInProject,
  ModelParseCodeGeneratorInputs,
  type EventTopicDefinition,
} from '../../definitions/index.js';
import { ModelParseCodeGeneratorInputsForAll } from './parse-code-generator-inputs.js';

describe('ModelParseCodeGeneratorInputsForAll', () => {
  let context: WorkspaceContext;
  let functionRegistry: FunctionRegistry<WorkspaceContext>;
  let listReferencedMock: WorkspaceFunctionCallMock<EventTopicListReferencedInProject>;
  let rootPath: string;
  let projectPath: string;

  beforeEach(async () => {
    rootPath = resolve(await mkdtemp('causa-tests-'));
    projectPath = join(rootPath, 'project');
    await mkdir(projectPath);

    ({ context, functionRegistry } = createContext({
      rootPath,
      projectPath,
      functions: [ModelParseCodeGeneratorInputsForAll],
      configuration: { workspace: { name: '🧪' } },
    }));

    listReferencedMock = registerMockFunction(
      functionRegistry,
      EventTopicListReferencedInProject,
      async () => ({
        consumed: [],
        produced: [],
      }),
    );
  });

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true });
  });

  describe('configuration validation', () => {
    it('should throw an error when includeEvents is not a boolean', async () => {
      const actualPromise = context.call(ModelParseCodeGeneratorInputs, {
        configuration: { includeEvents: 'not-a-boolean' },
      });

      await expect(actualPromise).rejects.toThrow(
        `The 'includeEvents' configuration option must be a boolean.`,
      );
    });

    it('should throw an error when globs is not an array', async () => {
      const actualPromise = context.call(ModelParseCodeGeneratorInputs, {
        configuration: { globs: 'not-an-array' },
      });

      await expect(actualPromise).rejects.toThrow(
        `The 'globs' configuration option must be an array of strings.`,
      );
    });

    it('should throw an error when globs contains non-string values', async () => {
      const actualPromise = context.call(ModelParseCodeGeneratorInputs, {
        configuration: { globs: ['valid', 123, 'also-valid'] },
      });

      await expect(actualPromise).rejects.toThrow(
        `The 'globs' configuration option must be an array of strings.`,
      );
    });

    it('should throw an error when nestedSchemas is not an array', async () => {
      const actualPromise = context.call(ModelParseCodeGeneratorInputs, {
        configuration: { nestedSchemas: 'not-an-array' },
      });

      await expect(actualPromise).rejects.toThrow(
        `The 'nestedSchemas' configuration option must be an array of strings.`,
      );
    });

    it('should throw an error when nestedSchemas contains non-string values', async () => {
      const actualPromise = context.call(ModelParseCodeGeneratorInputs, {
        configuration: { nestedSchemas: ['valid', false, 'also-valid'] },
      });

      await expect(actualPromise).rejects.toThrow(
        `The 'nestedSchemas' configuration option must be an array of strings.`,
      );
    });

    it('should throw an error when includeFullReferences is not a boolean', async () => {
      const actualPromise = context.call(ModelParseCodeGeneratorInputs, {
        configuration: { includeFullReferences: 'not-a-boolean' },
      });

      await expect(actualPromise).rejects.toThrow(
        `The 'includeFullReferences' configuration option must be a boolean.`,
      );
    });

    it('should return nestedSchemas when provided', async () => {
      const result = await context.call(ModelParseCodeGeneratorInputs, {
        configuration: {
          nestedSchemas: ['definitions', 'properties'],
        },
      });

      expect(result.nestedSchemas).toEqual(['definitions', 'properties']);
    });

    it('should return includeFullReferences when provided', async () => {
      const result = await context.call(ModelParseCodeGeneratorInputs, {
        configuration: {
          includeFullReferences: true,
        },
      });

      expect(result.includeFullReferences).toBeTrue();
    });
  });

  describe('file collection', () => {
    it('should return empty files when no configuration is provided', async () => {
      const result = await context.call(ModelParseCodeGeneratorInputs, {
        configuration: {},
      });

      expect(result).toEqual({
        includeEvents: false,
        globs: [],
        files: [],
        nestedSchemas: undefined,
        includeFullReferences: undefined,
      });
    });

    it('should collect files from globs', async () => {
      await mkdir(join(projectPath, 'schemas'));
      await mkdir(join(projectPath, 'models'));
      const schema1 = join(projectPath, 'schemas/schema.json');
      const model1 = join(projectPath, 'models/model.yaml');
      await writeFile(schema1, '{}');
      await writeFile(model1, 'type: object');

      const result = await context.call(ModelParseCodeGeneratorInputs, {
        configuration: { globs: ['schemas/*.json', 'models/*.yaml'] },
      });

      expect(result.files).toIncludeSameMembers([schema1, model1]);
    });

    it('should include event topic files when includeEvents is true', async () => {
      const consumedTopic: EventTopicDefinition = {
        id: 'topic1',
        schemaFilePath: '/path/to/consumed.yaml',
        formatParts: {},
      };
      const producedTopic: EventTopicDefinition = {
        id: 'topic2',
        schemaFilePath: '/path/to/produced.yaml',
        formatParts: {},
      };

      listReferencedMock.mockResolvedValueOnce({
        consumed: [consumedTopic],
        produced: [producedTopic],
      });

      const result = await context.call(ModelParseCodeGeneratorInputs, {
        configuration: { includeEvents: true },
      });

      expect(result.includeEvents).toBeTrue();
      expect(result.files).toIncludeSameMembers([
        '/path/to/consumed.yaml',
        '/path/to/produced.yaml',
      ]);
      expect(listReferencedMock).toHaveBeenCalledWith(context, {});
    });

    it('should deduplicate files when the same file appears in multiple sources', async () => {
      const sharedFile = join(projectPath, 'shared.yaml');
      await writeFile(sharedFile, 'shared');

      const sharedTopic: EventTopicDefinition = {
        id: 'shared',
        schemaFilePath: sharedFile,
        formatParts: {},
      };

      listReferencedMock.mockResolvedValueOnce({
        consumed: [sharedTopic],
        produced: [sharedTopic],
      });

      const result = await context.call(ModelParseCodeGeneratorInputs, {
        configuration: {
          includeEvents: true,
          globs: ['*.yaml'],
        },
      });

      expect(result.files).toEqual([sharedFile]);
    });
  });
});
