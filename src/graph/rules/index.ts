import type { GraphRule } from '../../definitions/index.js';
import { apiOperationFromOpenApi } from './api-operation-from-openapi.js';
import { domainFromConfiguration } from './domain-from-configuration.js';
import { enqueuesAssumedFromOwningProject } from './enqueues-assumed-from-owning-project.js';
import { entityFromSchema } from './entity-from-schema.js';
import { eventTopicFromSchemaPath } from './event-topic-from-schema-path.js';
import { projectFromConfiguration } from './project-from-configuration.js';
import { serviceContainerFromConfiguration } from './service-container-from-configuration.js';

/**
 * The rules extracting core Causa concepts: domains, projects, the model, and the relations declared by service
 * containers.
 */
export const CORE_GRAPH_RULES: readonly GraphRule[] = [
  domainFromConfiguration,
  projectFromConfiguration,
  apiOperationFromOpenApi,
  serviceContainerFromConfiguration,
  enqueuesAssumedFromOwningProject,
  eventTopicFromSchemaPath,
  entityFromSchema,
];
