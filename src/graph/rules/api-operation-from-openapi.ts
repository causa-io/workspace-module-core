import type { OpenAPIV3_1 } from '@scalar/openapi-types';
import { readFile } from 'fs/promises';
import { globby } from 'globby';
import { join, relative } from 'path';
import { parse } from 'yaml';
import type { OpenApiConfiguration } from '../../configurations/index.js';
import {
  GraphOriginKind,
  HttpMethod,
  type ApiOperationGraphNodeData,
  type GraphRule,
  type GraphRuleNode,
  type GraphWarning,
} from '../../definitions/index.js';
import { projectId } from '../ids.js';
import { ProjectsFact } from '../projects.js';

/**
 * An `apiOperation` node per operation of the OpenAPI documents matched by a project's `openApi.specifications`,
 * resolved relative to the project directory as `cs openapi generateSpecification` does. The locator is the
 * `operationId`.
 *
 * `public` reads the effective `security` of the operation: its own, else the document's, else the project's
 * `openApi.global.security`. An empty list, or no security at all, makes the operation public.
 */
export const apiOperationFromOpenApi: GraphRule = {
  name: 'apiOperationFromOpenApi',
  kind: GraphOriginKind.Declared,
  description:
    "One `apiOperation` node per operation in the OpenAPI documents matched by each project's `openApi.specifications`.",
  async run(graph) {
    const { locator, context } = graph;
    const projects = await graph.get(ProjectsFact);
    const nodes: GraphRuleNode[] = [];
    const warnings: GraphWarning[] = [];

    const parents = new Map<string, string>();

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
      const parent = projectId(project.directory);

      for (const file of files) {
        const absolutePath = join(projectPath, file);
        const relativePath = relative(context.rootPath, absolutePath);
        const document = parse(
          await readFile(absolutePath, 'utf-8'),
        ) as OpenAPIV3_1.Document;

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

            // The locator is the bare `operationId`: two projects matching the same document collide on one node.
            const existingParent = parents.get(operationId);
            if (existingParent && existingParent !== parent) {
              warnings.push({
                message: `Operation '${operationId}' is declared by both '${existingParent}' and '${parent}'. It is kept under the first one.`,
                sources: [source],
              });
            }
            parents.set(operationId, existingParent ?? parent);

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
