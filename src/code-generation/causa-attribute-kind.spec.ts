import { TypeAttributeKind } from 'quicktype-core';
import { causaTypeAttributeKind } from './causa-attribute-kind.js';

describe('causaTypeAttributeKind', () => {
  it('should return the attributes for the first type', () => {
    const expectedAttribute = {};

    const actualCombined = (
      causaTypeAttributeKind as TypeAttributeKind<any>
    ).combine([expectedAttribute, {}]);

    expect(actualCombined).toBe(expectedAttribute);
  });

  it('should not return the attribute when making an inferred type', () => {
    const actualInferred = (
      causaTypeAttributeKind as TypeAttributeKind<any>
    ).makeInferred({});

    expect(actualInferred).toBeUndefined();
  });
});
