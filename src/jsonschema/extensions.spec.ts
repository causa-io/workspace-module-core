import { mapExtensionRefs } from './extensions.js';

describe('extensions', () => {
  describe('mapExtensionRefs', () => {
    const fn = (ref: string) => `/abs/${ref}`;

    it('should map the references of each extension, and leave other values unchanged', () => {
      const actualExtensions = mapExtensionRefs(
        {
          custom: 'untouched',
          constraintFor: 'constraint.yaml',
          enumHint: '#/$defs/Hint',
          projectionOf: 'source.yaml',
          entityMutationFrom: ['from.yaml', null],
          entityPropertyChanges: ['name'],
          identifierOf: {
            schema: 'target.yaml',
            property: 'id',
            scope: { parent: 'parent' },
          },
        },
        fn,
      );

      expect(actualExtensions).toEqual({
        custom: 'untouched',
        constraintFor: '/abs/constraint.yaml',
        enumHint: '/abs/#/$defs/Hint',
        projectionOf: '/abs/source.yaml',
        entityMutationFrom: ['/abs/from.yaml', null],
        entityPropertyChanges: ['name'],
        identifierOf: {
          schema: '/abs/target.yaml',
          property: 'id',
          scope: { parent: 'parent' },
        },
      });
      expect(Object.keys(actualExtensions)).toEqual([
        'custom',
        'constraintFor',
        'enumHint',
        'projectionOf',
        'entityMutationFrom',
        'entityPropertyChanges',
        'identifierOf',
      ]);
    });

    it('should leave values that do not have the expected shape unchanged', () => {
      const extensions = {
        constraintFor: 1,
        entityMutationFrom: 'from.yaml',
        identifierOf: 'target.yaml',
      };

      const actualExtensions = mapExtensionRefs(extensions, fn);

      expect(actualExtensions).toEqual(extensions);
      expect(actualExtensions).not.toBe(extensions);
    });

    it('should not add missing extensions', () => {
      const actualExtensions = mapExtensionRefs({}, fn);

      expect(actualExtensions).toEqual({});
    });
  });
});
