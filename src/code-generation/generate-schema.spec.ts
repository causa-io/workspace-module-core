import { jest } from '@jest/globals';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import 'jest-extended';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  ConvenienceRenderer,
  Namer,
  Option,
  type RenderContext,
  TargetLanguage,
  funPrefixNamer,
  panic,
} from 'quicktype-core';
import { Renderer } from 'quicktype-core/dist/Renderer.js';
import { causaTypeAttributeKind } from './causa-attribute-kind.js';
import {
  generateCodeForSchemas,
  makeJsonSchemaInputData,
} from './generate-schema.js';
import type { TargetLanguageWithWriter } from './target-language-with-writer.js';

class DummyRenderer extends ConvenienceRenderer {
  protected makeNamedTypeNamer(): Namer {
    return funPrefixNamer('Dummy', (s) => s);
  }

  protected namerForObjectProperty(): Namer | null {
    return funPrefixNamer('Dummy', (s) => s);
  }

  protected makeUnionMemberNamer(): Namer | null {
    return funPrefixNamer('Dummy', (s) => s);
  }

  protected makeEnumCaseNamer(): Namer | null {
    return funPrefixNamer('Dummy', (s) => s);
  }

  protected emitSourceStructure(): void {
    const objects: Record<string, any> = {};

    this.forEachObject('none', (classType) => {
      if (classType.getCombinedName() === 'Boom') {
        panic('💥');
      }

      // This checks that the `causaJsonSchemaAttributeProducer` has been set up on the input.
      objects[classType.getCombinedName()] =
        causaTypeAttributeKind.tryGetInAttributes(classType.getAttributes());
    });

    this.forEachEnum('none', (enumType) => {
      objects[enumType.getCombinedName()] =
        causaTypeAttributeKind.tryGetInAttributes(enumType.getAttributes());
    });

    this.emitLine(JSON.stringify(objects));
  }
}

class DummyTargetLanguage
  extends TargetLanguage
  implements TargetLanguageWithWriter
{
  constructor() {
    super({
      displayName: 'dummy',
      names: ['dummy'],
      extension: 'dummy',
    });
  }

  protected getOptions(): Record<string, Option<string, unknown>> {
    return {};
  }

  protected makeRenderer(renderContext: RenderContext): Renderer {
    return new DummyRenderer(this, renderContext);
  }

  async writeFile(): Promise<void> {}
}

describe('generateCodeForSchemas', () => {
  let rootPath: string;
  let targetLanguage: DummyTargetLanguage;

  beforeEach(async () => {
    targetLanguage = new DummyTargetLanguage();
    jest.spyOn(targetLanguage, 'writeFile').mockResolvedValue();

    rootPath = await mkdtemp(join(tmpdir(), 'causa-tests-'));
  });

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true });
  });

  it('should prepare the inputs, generate the code, and write it to the file', async () => {
    const schemaFilePath = join(rootPath, 'schema.json');
    const referencedPath = join(rootPath, 'referenced.json');
    await writeFile(
      schemaFilePath,
      JSON.stringify({
        // Having a union type here helps test `CausaTypeAttributeKind.combine`, which should propagate attributes.
        oneOf: [
          { type: 'null' },
          {
            title: 'MyDummyObject',
            type: 'object',
            causa: { someObjAttribute: '🎉' },
            properties: {
              myProp: {
                type: 'string',
                causa: { somePropAttribute: '🔧' },
              },
              myOtherProp: {
                oneOf: [{ $ref: './referenced.json' }],
              },
            },
          },
        ],
        myCustomSchemas: {
          MyEnum: {
            type: 'string',
            enum: ['A', 'B', 'C'],
            causa: { someEnumAttribute: '💡' },
          },
        },
      }),
    );
    await writeFile(
      referencedPath,
      JSON.stringify({
        title: 'MyReferencedObject',
        type: 'object',
        properties: {
          myReferencedProp: { type: 'string' },
        },
        myCustomSchemas: {
          NestedTypeInReferenced: {
            title: 'NestedTypeInReferenced',
            type: 'object',
            properties: {
              anotherProp: { type: 'string' },
            },
          },
        },
      }),
    );

    const inputData = await makeJsonSchemaInputData([schemaFilePath], {
      nestedSchemas: ['myCustomSchemas'],
    });
    await generateCodeForSchemas(targetLanguage, inputData);

    expect(targetLanguage.writeFile).toHaveBeenCalledOnce();
    const actualSource = JSON.parse(
      (targetLanguage.writeFile as any).mock.calls[0][0],
    );
    expect(actualSource).toEqual({
      MyDummyObject: {
        uri: `${schemaFilePath}#/oneOf/1`,
        objectAttributes: { someObjAttribute: '🎉' },
        propertiesAttributes: { myProp: { somePropAttribute: '🔧' } },
        constProperties: [],
      },
      MyEnum: {
        uri: `${schemaFilePath}#/myCustomSchemas/MyEnum`,
        objectAttributes: { someEnumAttribute: '💡' },
        propertiesAttributes: {},
        constProperties: [],
      },
      MyReferencedObject: {
        constProperties: [],
        objectAttributes: {},
        propertiesAttributes: {},
        uri: referencedPath,
      },
      NestedTypeInReferenced: {
        uri: `${referencedPath}#/myCustomSchemas/NestedTypeInReferenced`,
        objectAttributes: {},
        propertiesAttributes: {},
        constProperties: [],
      },
    });
  });

  it('should catch a quicktype error and throw a new error with the message', async () => {
    const schemaFilePath = join(rootPath, 'schema.json');
    await writeFile(
      schemaFilePath,
      JSON.stringify({
        type: 'object',
        title: 'Boom',
        properties: {
          myProp: { type: 'string' },
        },
      }),
    );

    const inputData = await makeJsonSchemaInputData([schemaFilePath]);
    const actualPromise = generateCodeForSchemas(targetLanguage, inputData);

    await expect(actualPromise).rejects.toThrow('💥');
  });
});
