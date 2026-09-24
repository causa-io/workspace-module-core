/**
 * Node IDs and locators, as `graph/nodes.yaml` defines them for each type of the core schema.
 * Rules go through these helpers so that a rule referencing a node emitted by another rule spells its ID the same way.
 */

/**
 * Returns the ID of a node, `<type>:<locator>`.
 *
 * @param type The type of the node.
 * @param locator The locator of the node within its type.
 * @returns The ID of the node.
 */
export function nodeId(type: string, locator: string): string {
  return `${type}:${locator}`;
}

export const domainId = (directory: string) => nodeId('domain', directory);

export const projectId = (directory: string) => nodeId('project', directory);

export const apiOperationId = (operationId: string) =>
  nodeId('apiOperation', operationId);

/**
 * The locator of a trigger, `<project directory>#<trigger name>`.
 * Infrastructure resources created for a single trigger reuse it.
 */
export const triggerLocator = (projectDirectory: string, trigger: string) =>
  `${projectDirectory}#${trigger}`;

export const triggerId = (projectDirectory: string, trigger: string) =>
  nodeId('trigger', triggerLocator(projectDirectory, trigger));

export const topicId = (topic: string) => nodeId('topic', topic);

export const entityId = (locator: string) => nodeId('entity', locator);

export const stateId = (locator: string) => nodeId('state', locator);

/**
 * The locator of a service, `<project directory>#<service name>`.
 */
export const serviceLocator = (projectDirectory: string, service: string) =>
  `${projectDirectory}#${service}`;

export const serviceId = (projectDirectory: string, service: string) =>
  nodeId('service', serviceLocator(projectDirectory, service));

export const apiRouterId = (name: string) => nodeId('apiRouter', name);

export const brokerTopicId = (topic: string) => nodeId('brokerTopic', topic);

export const brokerSubscriptionId = (locator: string) =>
  nodeId('brokerSubscription', locator);

export const queueId = (queue: string) => nodeId('queue', queue);

export const scheduledJobId = (locator: string) =>
  nodeId('scheduledJob', locator);

/**
 * The locator of a database, `<engine>/<name>`.
 * The name alone is not an identity, as databases of different engines can share a name.
 */
export const databaseLocator = (engine: string, name: string) =>
  `${engine}/${name}`;

export const databaseId = (locator: string) => nodeId('database', locator);

/**
 * The locator of a table, `<database locator>#<table name>`.
 */
export const tableLocator = (databaseLocator: string, table: string) =>
  `${databaseLocator}#${table}`;

export const tableId = (databaseLocator: string, table: string) =>
  nodeId('table', tableLocator(databaseLocator, table));
