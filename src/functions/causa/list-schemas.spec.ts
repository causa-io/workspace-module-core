import { BASE_CONFIGURATION_SCHEMA_PATH } from '@causa/workspace';
import { createContext } from '@causa/workspace/testing';
import 'jest-extended';
import { basename } from 'path';
import { CausaListConfigurationSchemas } from '../../definitions/index.js';
import { CausaListConfigurationSchemasForCore } from './list-schemas.js';

describe('CausaListConfigurationSchemasForCore', () => {
  it('should return the configuration schemas for the core module', async () => {
    const { context } = createContext({
      configuration: { workspace: { name: 'test' } },
      functions: [CausaListConfigurationSchemasForCore],
    });

    const actualSchemas = await context.call(CausaListConfigurationSchemas, {});

    const actualBaseNames = actualSchemas.map((s) => basename(s));
    expect(actualBaseNames).toIncludeSameMembers([
      basename(BASE_CONFIGURATION_SCHEMA_PATH),
      'causa.yaml',
      'docker.yaml',
      'events.yaml',
      'infrastructure.yaml',
      'model.yaml',
      'openapi.yaml',
      'project.yaml',
      'serverless-functions.yaml',
      'service-container.yaml',
    ]);
  });
});
