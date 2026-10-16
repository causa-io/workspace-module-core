import type { OpenAPIV3_1 } from '@scalar/openapi-types';
import { readFile } from 'fs/promises';
import { globby } from 'globby';
import { basename, dirname, join, relative } from 'path';
import { parse } from 'yaml';
import type { OpenApiConfiguration } from '../../configurations/index.js';
import {
  GraphOriginKind,
  HttpMethod,
  type ApiGraphNodeData,
  type ApiOperationGraphNodeData,
  type GraphRule,
  type GraphRuleEdge,
  type GraphRuleNode,
  type GraphWarning,
  type ReturnsGraphEdgeData,
} from '../../definitions/index.js';
import { joinSchemaPath, splitSchemaPath } from '../../jsonschema/index.js';
import { apiId, apiOperationId, projectId } from '../ids.js';
import type { DocumentPath } from '../locate.js';
import { ModelFact } from '../model.js';
import { ProjectsFact } from '../projects.js';

/**
 * A body of a request or a response of an OpenAPI operation, along with its path in the document.
 */
type OpenApiBody = {
  /**
   * The response status, or `undefined` for the request body.
   */
  readonly status?: string;

  /**
   * The schema of the body.
   */
  readonly schema: unknown;

  /**
   * The path to the schema of the body in the document.
   */
  readonly segments: DocumentPath;
};

/**
 * Lists the bodies of the request and responses of an operation, one per media type.
 *
 * @param operation The OpenAPI operation.
 * @param segments The path to the operation in the document.
 * @returns The bodies of the request and responses.
 */
function operationBodies(
  operation: OpenAPIV3_1.OperationObject,
  segments: DocumentPath,
): OpenApiBody[] {
  const bodiesOf = (
    body: unknown,
    bodySegments: DocumentPath,
    status?: string,
  ): OpenApiBody[] => {
    const content = (body as OpenAPIV3_1.RequestBodyObject | undefined)
      ?.content;
    return Object.entries(content ?? {}).map(([mediaType, media]) => ({
      status,
      schema: media?.schema,
      segments: [...bodySegments, 'content', mediaType, 'schema'],
    }));
  };

  return [
    ...bodiesOf(operation.requestBody, [...segments, 'requestBody']),
    ...Object.entries(operation.responses ?? {}).flatMap(([status, response]) =>
      bodiesOf(response, [...segments, 'responses', status], status),
    ),
  ];
}

/**
 * Lists the schemas referenced by the schema of a body: the schema itself, the members of a `oneOf` or `anyOf`, or the
 * items of an array, when they are references.
 *
 * @param schema The schema of the body.
 * @returns The `$ref` values.
 */
function bodyRefs(schema: unknown): string[] {
  if (!schema || typeof schema !== 'object') {
    return [];
  }

  const { $ref, oneOf, anyOf, items } = schema as Record<string, unknown>;
  if (typeof $ref === 'string') {
    return [$ref];
  }

  const members = [oneOf, anyOf].flatMap((m) => (Array.isArray(m) ? m : []));
  return [...members, items].flatMap((m) => {
    const ref = (m as Record<string, unknown> | undefined)?.$ref;
    return typeof ref === 'string' ? [ref] : [];
  });
}

/**
 * An `api` node per OpenAPI document matched by a project's `openApi.specifications`, resolved relative to the project
 * directory as `cs openapi generateSpecification` does, and an `apiOperation` node per operation of the document. The
 * locator of an `api` is the path of the document, relative to the workspace root, and its name is the document's
 * `info.title`, falling back to the file name. The locator of an `apiOperation` is its `operationId`.
 *
 * `public` reads the effective `security` of the operation: its own, else the document's, else the project's
 * `openApi.global.security`. An empty list, or no security at all, makes the operation public.
 *
 * An operation `accepts` the schemas of its request body, and `returns` the schemas of its responses, labelled with the
 * status. A body schema is followed when it is a `$ref` to a schema file, a `oneOf` or `anyOf` of such references, or
 * an array of them. References within the document (e.g. to `#/components/schemas`) are not schemas of the model.
 */
export const apiOperationFromOpenApi: GraphRule = {
  name: 'apiOperationFromOpenApi',
  kind: GraphOriginKind.Declared,
  description:
    "One `api` node per OpenAPI document matched by each project's `openApi.specifications`, parented to the project, and one `apiOperation` node per operation in the document, parented to the `api`. One `accepts` edge from an operation to each schema of its request body, and one `returns` edge to each schema of its responses.",
  async run(graph) {
    const { locator, context } = graph;
    const [projects, model] = await Promise.all([
      graph.get(ProjectsFact),
      graph.get(ModelFact),
    ]);
    const nodes: GraphRuleNode[] = [];
    const edges: GraphRuleEdge[] = [];
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

            const bodies = operationBodies(operation, ['paths', path, method]);
            for (const { status, schema, segments } of bodies) {
              const bodySource = await locator.source(relativePath, segments);
              for (const ref of bodyRefs(schema)) {
                const { file, pointer } = splitSchemaPath(ref);
                const target = file
                  ? model.schemas.get(
                      joinSchemaPath(
                        join(dirname(absolutePath), file),
                        pointer,
                      ),
                    )
                  : undefined;
                if (!target) {
                  warnings.push({
                    message: `Operation '${operationId}' refers to '${ref}', which is not a schema of the model.`,
                    sources: [bodySource],
                  });
                  continue;
                }

                const from = apiOperationId(operationId);
                if (status === undefined) {
                  edges.push({
                    type: 'accepts',
                    from,
                    to: target.id,
                    sources: [bodySource],
                  });
                  continue;
                }

                const returnsData: ReturnsGraphEdgeData = { status };
                edges.push({
                  type: 'returns',
                  from,
                  to: target.id,
                  label: status,
                  sources: [bodySource],
                  data: returnsData,
                });
              }
            }
          }
        }
      }
    }

    return { nodes, edges, warnings };
  },
};
