import type { OpenAPIV3_1 } from '@scalar/openapi-types';
import { readFile } from 'fs/promises';
import { globby } from 'globby';
import { basename, join, relative } from 'path';
import { parse } from 'yaml';
import type { OpenApiConfiguration } from '../../configurations/index.js';
import {
  GraphOriginKind,
  HttpMethod,
  type ApiGraphNodeData,
  type ApiOperationGraphNodeData,
  type GraphRule,
  type GraphRuleNode,
  type GraphWarning,
} from '../../definitions/index.js';
import { apiId, projectId } from '../ids.js';
import { ProjectsFact } from '../projects.js';

/**
 * An `api` node per OpenAPI document matched by a project's `openApi.specifications`, resolved relative to the project
 * directory as `cs openapi generateSpecification` does, and an `apiOperation` node per operation of the document. The
 * locator of an `api` is the path of the document, relative to the workspace root, and its name is the document's
 * `info.title`, falling back to the file name. The locator of an `apiOperation` is its `operationId`.
 *
 * `public` reads the effective `security` of the operation: its own, else the document's, else the project's
 * `openApi.global.security`. An empty list, or no security at all, makes the operation public.
 */
export const apiOperationFromOpenApi: GraphRule = {
  name: 'apiOperationFromOpenApi',
  kind: GraphOriginKind.Declared,
  description:
    "One `api` node per OpenAPI document matched by each project's `openApi.specifications`, parented to the project, and one `apiOperation` node per operation in the document, parented to the `api`.",
  async run(graph) {
    const { locator, context } = graph;
    const projects = await graph.get(ProjectsFact);
    const nodes: GraphRuleNode[] = [];
    const warnings: GraphWarning[] = [];

    const documentParents = new Map<string, string>();
    const operationParents = new Map<string, string>();

    for (const project of projects) {
      const openApi = project.context.asConfiguration<OpenApiConfiguration>();
      const globs = openApi.get('openApi.specifications');
      if (!Array.isArray(globs) || globs.length === 0) {
        continue;
      }

      const projectPath = join(context.rootPath, project.directory);
      const files = await globby(globs, {
        cwd: projectPath,
        followSymbolicLinks: false,
      });
      files.sort();
      const globalSecurity = openApi.get('openApi.global.security');
      const projectNode = projectId(project.directory);

      for (const file of files) {
        const absolutePath = join(projectPath, file);
        const relativePath = relative(context.rootPath, absolutePath);
        const documentSource = await locator.source(relativePath);

        // Several projects can match the same document, e.g. through a shared configuration file. It is read once.
        const existingProject = documentParents.get(relativePath);
        if (existingProject) {
          warnings.push({
            message: `Document '${relativePath}' is matched by both '${existingProject}' and '${projectNode}'. It is kept under the first one.`,
            sources: [documentSource],
          });
          continue;
        }
        documentParents.set(relativePath, projectNode);

        const document = parse(
          await readFile(absolutePath, 'utf-8'),
        ) as OpenAPIV3_1.Document;
        const { title, description, version } = document.info ?? {};
        const apiData: ApiGraphNodeData = {
          format: 'openApi',
          version: typeof version === 'string' ? version : undefined,
        };
        nodes.push({
          layer: 'architecture',
          type: 'api',
          locator: relativePath,
          parent: projectNode,
          name: typeof title === 'string' ? title : basename(relativePath),
          description: description || undefined,
          sources: [documentSource],
          data: apiData,
        });
        const parent = apiId(relativePath);

        for (const [path, item] of Object.entries(document.paths ?? {})) {
          for (const method of Object.values(HttpMethod)) {
            const operation = item?.[method];
            if (!operation) {
              continue;
            }

            const source = await locator.source(relativePath, [
              'paths',
              path,
              method,
            ]);
            const { operationId } = operation;
            if (typeof operationId !== 'string') {
              warnings.push({
                message: `Operation ${method.toUpperCase()} ${path} has no 'operationId' and cannot be located.`,
                sources: [source],
              });
              continue;
            }

            // The locator is the bare `operationId`: two documents declaring the same operation collide on one node.
            const existingParent = operationParents.get(operationId);
            if (existingParent && existingParent !== parent) {
              warnings.push({
                message: `Operation '${operationId}' is declared by both '${existingParent}' and '${parent}'. It is kept under the first one.`,
                sources: [source],
              });
            }
            operationParents.set(operationId, existingParent ?? parent);

            const security =
              operation.security ?? document.security ?? globalSecurity ?? [];
            const data: ApiOperationGraphNodeData = {
              method,
              path,
              public: security.length === 0,
            };
            nodes.push({
              layer: 'architecture',
              type: 'apiOperation',
              locator: operationId,
              parent,
              name: operationId,
              description: operation.summary || undefined,
              sources: [source],
              data,
            });
          }
        }
      }
    }

    return { nodes, warnings };
  },
};
