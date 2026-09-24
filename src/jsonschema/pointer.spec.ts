import {
  appendToSchemaPath,
  fromPointer,
  splitSchemaPath,
  toPointer,
} from './pointer.js';

describe('pointer', () => {
  describe('toPointer', () => {
    it('should format and escape segments', () => {
      const actualPointer = toPointer([
        'serviceContainer',
        'outputs',
        'google.spanner',
        0,
      ]);
      const actualEscaped = toPointer(['$defs', 'A/B~C']);

      expect(actualPointer).toEqual(
        '/serviceContainer/outputs/google.spanner/0',
      );
      expect(actualEscaped).toEqual('/$defs/A~1B~0C');
    });

    it('should return an empty pointer for the whole document', () => {
      expect(toPointer([])).toEqual('');
    });
  });

  describe('fromPointer', () => {
    it('should parse and unescape segments', () => {
      const actualPath = fromPointer('/$defs/A~1B~0C');

      expect(actualPath).toEqual(['$defs', 'A/B~C']);
    });

    it('should return an empty path for the whole document', () => {
      expect(fromPointer('')).toEqual([]);
      expect(fromPointer('/')).toEqual([]);
    });
  });

  describe('splitSchemaPath', () => {
    it('should split the file and the pointer', () => {
      const actualSplit = splitSchemaPath('/abs/file.yaml#/$defs/Foo');

      expect(actualSplit).toEqual({
        file: '/abs/file.yaml',
        pointer: '/$defs/Foo',
      });
    });

    it('should return an empty pointer for a schema at the root of a file', () => {
      const actualSplit = splitSchemaPath('/abs/file.yaml');

      expect(actualSplit).toEqual({ file: '/abs/file.yaml', pointer: '' });
    });
  });

  describe('appendToSchemaPath', () => {
    it('should add a fragment to a file path', () => {
      const actualPath = appendToSchemaPath(
        '/abs/file.yaml',
        'properties',
        'address',
      );

      expect(actualPath).toEqual('/abs/file.yaml#/properties/address');
    });

    it('should append escaped segments to an existing fragment', () => {
      const actualPath = appendToSchemaPath(
        '/abs/file.yaml#/$defs/Foo',
        'oneOf',
        1,
        'a/b',
      );

      expect(actualPath).toEqual('/abs/file.yaml#/$defs/Foo/oneOf/1/a~1b');
    });
  });
});
