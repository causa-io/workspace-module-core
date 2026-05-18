import 'jest-extended';
import { loadSchemas } from './loader.js';

describe('loadSchemas', () => {
  it('should parse every file in the input set', async () => {
    const files: Record<string, string> = {
      '/abs/a.yaml': 'title: A\ntype: object',
      '/abs/b.yaml': 'title: B\ntype: object',
    };

    const { schemas, errors } = await loadSchemas(
      ['/abs/a.yaml', '/abs/b.yaml'],
      { fileReader: async (p) => files[p] },
    );

    expect(errors).toEqual({});
    expect(Object.keys(schemas)).toIncludeSameMembers([
      '/abs/a.yaml',
      '/abs/b.yaml',
    ]);
  });

  it('should follow $ref to files outside the input set', async () => {
    const files: Record<string, string> = {
      '/abs/root.yaml': `
title: Root
type: object
properties:
  addr:
    $ref: "./address.yaml"`,
      '/abs/address.yaml': 'title: Address\ntype: object',
    };

    const { schemas, errors } = await loadSchemas(['/abs/root.yaml'], {
      fileReader: async (p) => files[p],
    });

    expect(errors).toEqual({});
    expect(schemas['/abs/address.yaml']).toMatchObject({ name: 'Address' });
  });

  it('should follow ref-bearing causa extensions transitively', async () => {
    const files: Record<string, string> = {
      '/abs/root.yaml': `
title: Root
type: object
causa:
  constraintFor: "./other.yaml"`,
      '/abs/other.yaml': 'title: Other\ntype: object',
    };

    const { schemas } = await loadSchemas(['/abs/root.yaml'], {
      fileReader: async (p) => files[p],
    });

    expect(schemas['/abs/other.yaml']).toMatchObject({ name: 'Other' });
  });

  it('should record per-file errors instead of aborting', async () => {
    const files: Record<string, string> = {
      '/abs/ok.yaml': 'title: Ok\ntype: object',
    };

    const { schemas, errors } = await loadSchemas(
      ['/abs/ok.yaml', '/abs/missing.yaml'],
      {
        fileReader: async (p) => {
          if (p in files) return files[p];
          throw new Error(`missing: ${p}`);
        },
      },
    );

    expect(schemas['/abs/ok.yaml']).toMatchObject({ name: 'Ok' });
    expect(errors['/abs/missing.yaml']?.message).toMatch(/missing/);
  });

  it('should index nested $defs schemas under their fragment path', async () => {
    const file = `
title: Root
type: object
$defs:
  Foo:
    title: Foo
    type: object`;

    const { schemas } = await loadSchemas(['/abs/root.yaml'], {
      fileReader: async () => file,
    });

    expect(Object.keys(schemas)).toIncludeSameMembers([
      '/abs/root.yaml',
      '/abs/root.yaml#/$defs/Foo',
    ]);
  });
});
