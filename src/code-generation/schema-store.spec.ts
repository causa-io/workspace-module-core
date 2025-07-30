import { jest } from '@jest/globals';
import { FetchingJSONSchemaStore } from 'quicktype-core';
import { AbsoluteIdJsonSchemaStore } from './schema-store.js';

describe('AbsoluteIdJsonSchemaStore', () => {
  let store: AbsoluteIdJsonSchemaStore;
  let mockSuperFetch: jest.SpiedFunction<FetchingJSONSchemaStore['fetch']>;

  beforeEach(() => {
    store = new AbsoluteIdJsonSchemaStore();
    mockSuperFetch = jest.spyOn(FetchingJSONSchemaStore.prototype, 'fetch');
  });

  describe('fetch', () => {
    it('should return undefined for relative paths', async () => {
      const relativePaths = [
        'relative/path/schema.json',
        './relative/path/schema.json',
        '../relative/path/schema.json',
        'schema.json',
      ];

      for (const path of relativePaths) {
        const result = await store.fetch(path);
        expect(result).toBeUndefined();
      }
      expect(mockSuperFetch).not.toHaveBeenCalled();
    });

    it('should handle absolute paths and set $id', async () => {
      const absolutePath = '/absolute/path/to/schema.json';
      const mockSchema = { type: 'object', properties: {} };
      mockSuperFetch.mockResolvedValue(mockSchema);

      const result = await store.fetch(absolutePath);

      expect(mockSuperFetch).toHaveBeenCalledExactlyOnceWith(absolutePath);
      const expectedSchema = { ...mockSchema, $id: absolutePath };
      expect(result).toEqual(expectedSchema);
      expect(store.absolutePathSchemas[absolutePath]).toEqual(expectedSchema);
    });

    it('should return undefined when super.fetch returns undefined for absolute paths', async () => {
      const absolutePath = '/absolute/path/to/schema.json';
      mockSuperFetch.mockResolvedValue(undefined);

      const result = await store.fetch(absolutePath);

      expect(mockSuperFetch).toHaveBeenCalledExactlyOnceWith(absolutePath);
      expect(result).toBeUndefined();
      expect(store.absolutePathSchemas[absolutePath]).toBeUndefined();
    });

    it('should handle non-object schemas for absolute paths', async () => {
      const absolutePath = '/absolute/path/to/schema.json';
      const booleanSchema = true;
      mockSuperFetch.mockResolvedValue(booleanSchema);

      const result = await store.fetch(absolutePath);

      expect(mockSuperFetch).toHaveBeenCalledExactlyOnceWith(absolutePath);
      expect(result).toBe(booleanSchema);
      expect(store.absolutePathSchemas[absolutePath]).toBe(booleanSchema);
    });

    it('should pass regular URLs directly to super.fetch', async () => {
      const urls = [
        'http://example.com/schema.json',
        'https://example.com/schema.json',
        'ftp://example.com/schema.json',
      ];
      const mockSchema = { type: 'string' };
      mockSuperFetch.mockResolvedValue(mockSchema);

      for (const url of urls) {
        const result = await store.fetch(url);

        expect(mockSuperFetch).toHaveBeenCalledWith(url);
        expect(result).toEqual(mockSchema);
        expect(store.absolutePathSchemas[url]).toBeUndefined();
      }
      expect(mockSuperFetch).toHaveBeenCalledTimes(urls.length);
    });
  });
});
