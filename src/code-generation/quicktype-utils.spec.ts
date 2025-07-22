import {
  ConvenienceRenderer,
  FetchingJSONSchemaStore,
  funPrefixNamer,
  InputData,
  JSONSchemaInput,
  Namer,
  Option,
  quicktype,
  TargetLanguage,
  type JSONSchemaSourceData,
  type RenderContext,
} from 'quicktype-core';
import type { Renderer } from 'quicktype-core/dist/Renderer.js';
import { causaTypeAttributeKind } from './causa-attribute-kind.js';
import { causaJsonSchemaAttributeProducer } from './jsonschema-attribute-producer.js';
import { findTypeForUri } from './quicktype-utils.js';

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
    const references: Record<string, any> = {};

    this.forEachObject('none', (classType) => {
      const referencedType = causaTypeAttributeKind.tryGetInAttributes(
        classType.getAttributes(),
      )?.objectAttributes.referencedType;
      if (!referencedType) {
        return;
      }

      // This checks that the `causaJsonSchemaAttributeProducer` has been set up on the input.
      references[classType.getCombinedName()] =
        findTypeForUri(
          this.typeGraph,
          classType,
          referencedType,
        )?.getCombinedName() ?? '🤷';
    });

    this.emitLine(JSON.stringify(references));
  }
}

class DummyTargetLanguage extends TargetLanguage {
  constructor() {
    super({ displayName: 'dummy', names: ['dummy'], extension: 'dummy' });
  }

  protected getOptions(): Record<string, Option<string, unknown>> {
    return {};
  }

  protected makeRenderer(renderContext: RenderContext): Renderer {
    return new DummyRenderer(this, renderContext);
  }
}

async function generateSchema(
  files: Record<string, object>,
  includeCausaAttributes = true,
): Promise<object> {
  const input = new JSONSchemaInput(
    new FetchingJSONSchemaStore(),
    includeCausaAttributes ? [causaJsonSchemaAttributeProducer] : [],
  );

  const sources: JSONSchemaSourceData[] = Object.entries(files).map(
    ([uri, content]) => ({
      name: undefined as unknown as string,
      schema: JSON.stringify(content),
      uris: [uri],
    }),
  );

  for (const source of sources) {
    await input.addSource(source);
  }

  const inputData = new InputData();
  inputData.addInput(input);

  const lang = new DummyTargetLanguage();

  const result = await quicktype({ inputData, lang });

  return JSON.parse(result.lines.join('\n'));
}

describe('findTypeForUri', () => {
  it('should resolve a reference to another file', async () => {
    const actual = await generateSchema({
      '/path/other.json': {
        title: 'MyReferencedObject',
        type: 'object',
        properties: { a: { type: 'string' } },
      },
      '/path/base.json': {
        title: 'MyBaseObject',
        type: 'object',
        causa: { referencedType: './other.json#' },
        properties: { a: { type: 'string' } },
      },
    });

    expect(actual).toEqual({ MyBaseObject: 'MyReferencedObject' });
  });

  it('should resolve a reference to a nested schema in the same file', async () => {
    const actual = await generateSchema({
      '/path/base.json': {
        title: 'MyBaseObject',
        type: 'object',
        causa: { referencedType: '#/$defs/MyNestedObject' },
        // The nested type must be referenced somewhere to be included in the type graph.
        properties: { a: { oneOf: [{ $ref: '#/$defs/MyNestedObject' }] } },
        $defs: {
          MyNestedObject: {
            title: 'MyReferencedObject',
            type: 'object',
            properties: { b: { type: 'string' } },
          },
        },
      },
    });

    expect(actual).toEqual({ MyBaseObject: 'MyReferencedObject' });
  });

  it('should resolve a reference to a nested schema in another file', async () => {
    const actual = await generateSchema({
      '/path/other.json': {
        title: 'MyReferencedObject',
        type: 'object',
        properties: { b: { oneOf: [{ $ref: '#/$defs/MyNestedObject' }] } },
        $defs: {
          MyNestedObject: {
            title: 'MyReferencedObject',
            type: 'object',
            properties: { c: { type: 'string' } },
          },
        },
      },
      '/path/base.json': {
        title: 'MyBaseObject',
        type: 'object',
        causa: { referencedType: './other.json#/$defs/MyNestedObject' },
        properties: { a: { type: 'string' } },
      },
    });

    expect(actual).toEqual({ MyBaseObject: 'MyReferencedObject' });
  });

  it('should return undefined for a reference to a non-existing type', async () => {
    const actual = await generateSchema({
      '/path/base.json': {
        title: 'MyBaseObject',
        type: 'object',
        causa: { referencedType: './non-existing.json#' },
        properties: { a: { type: 'string' } },
      },
    });

    expect(actual).toEqual({ MyBaseObject: '🤷' });
  });
});
