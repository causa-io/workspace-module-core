import type { WorkspaceContext } from '@causa/workspace';
import { NoImplementationFoundError } from '@causa/workspace/function-registry';
import { bundle } from '@scalar/json-magic/bundle';
import { readFiles } from '@scalar/json-magic/bundle/plugins/node';
import { join as joinSpecs } from '@scalar/openapi-parser';
import type { OpenAPIV3_1 } from '@scalar/openapi-types';
import { writeFile } from 'fs/promises';
import { dump, load } from 'js-yaml';
import { resolve } from 'path';
import { isDeepStrictEqual } from 'util';
import type { OpenApiConfiguration } from '../../configurations/index.js';
import { OpenApiGenerateSpecification } from '../../definitions/index.js';
import type { OpenApiGenerateSpecificationForWorkspace } from './generate-specification-workspace.js';
import { renameSecurityRequirements, rewriteRefs } from './utils.js';

/**
 * The default file where the OpenAPI specification is written.
 */
const DEFAULT_OPENAPI_OUTPUT = 'openapi.yaml';

/**
 * Generates the OpenAPI specification for a single project.
 * If the project does not support OpenAPI generation, `null` is returned.
 *
 * @param context The {@link WorkspaceContext}.
 * @param projectPath The path to the project.
 * @param output The output path for the generated specification.
 *   Only used during project generation to correctly rewrite `$ref` paths.
 * @returns The parsed OpenAPI specification for the project, or `null` if the project does not support OpenAPI
 *   generation.
 */
async function generateForProject(
  context: WorkspaceContext,
  projectPath: string,
  output: string,
): Promise<OpenAPIV3_1.Document | null> {
  try {
    context.logger.info(
      `📝 Generating OpenAPI specification for project in directory '${projectPath}'.`,
    );

    const projectContext = await context.clone({
      workingDirectory: projectPath,
      processors: null,
    });

    const openApiStr = await projectContext.call(OpenApiGenerateSpecification, {
      returnSpecification: true,
      output,
    });

    const openApiSpecification = load(openApiStr) as OpenAPIV3_1.Document;

    context.logger.info(
      `📝 Generated OpenAPI specification for project in directory '${projectPath}'.`,
    );

    return openApiSpecification;
  } catch (error) {
    if (error instanceof NoImplementationFoundError) {
      context.logger.info(
        `😴 Skipping project in directory '${projectPath}' that does not support OpenAPI generation.`,
      );
      return null;
    }

    throw error;
  }
}

/**
 * Merges the OpenAPI specifications for all projects in the workspace.
 * If the `openApi.global` configuration is set, it is used as the base specification, e.g. for `info` properties.
 *
 * @param context The {@link WorkspaceContext}.
 * @param specifications The specifications for each project in the workspace.
 * @returns The merged OpenAPI specification.
 */
async function mergeSpecifications(
  context: WorkspaceContext,
  specifications: OpenAPIV3_1.Document[],
): Promise<OpenAPIV3_1.Document> {
  const openApiConf = context.asConfiguration<OpenApiConfiguration>();

  const globalSpec: OpenAPIV3_1.Document =
    openApiConf.get('openApi.global') ?? {};

  const serversFromEnvironmentConfiguration = openApiConf.get(
    'openApi.serversFromEnvironmentConfiguration',
  );
  if (serversFromEnvironmentConfiguration) {
    const environments = context.getOrThrow('environments');
    globalSpec.servers = Object.entries(environments).map(
      ([key, { name }]) => ({
        description: name,
        url: context.getOrThrow(
          `environments.${key}.configuration.${serversFromEnvironmentConfiguration}`,
        ),
      }),
    );
  }

  deduplicateComponents(context, globalSpec, specifications);

  const result = await joinSpecs([globalSpec, ...specifications]);
  if (!result.ok) {
    throw new Error(
      `Could not merge OpenAPI specifications: ${result.conflicts.map((c) => JSON.stringify(c)).join(', ')}.`,
    );
  }

  return result.document;
}

/**
 * Extracts all `components` from project specifications and merges them into the global specification.
 * This avoids conflicts when joining specifications that define the same components.
 * For each component type (e.g. `securitySchemes`, `schemas`), entries with the same key are checked for deep
 * equality. If two entries share the same key but differ in value, a warning is emitted and the duplicate is ignored
 * (the first occurrence wins). Global components take precedence over project-level ones.
 *
 * @param context The {@link WorkspaceContext}.
 * @param globalSpec The global specification to merge components into.
 * @param specifications The project specifications to extract components from.
 */
function deduplicateComponents(
  context: WorkspaceContext,
  globalSpec: OpenAPIV3_1.Document,
  specifications: OpenAPIV3_1.Document[],
): void {
  const merged = globalSpec.components ?? {};

  for (const [specIndex, spec] of specifications.entries()) {
    if (!spec.components) {
      continue;
    }

    const renames: Record<string, string> = {};
    const securityRenames: Record<string, string> = {};

    const componentEntries = Object.entries(spec.components) as [
      keyof OpenAPIV3_1.ComponentsObject,
      OpenAPIV3_1.ComponentsObject[keyof OpenAPIV3_1.ComponentsObject],
    ][];

    for (const [componentType, components] of componentEntries) {
      if (!components || typeof components !== 'object') {
        continue;
      }

      merged[componentType] ??= {};

      for (const [key, value] of Object.entries(components)) {
        if (!(key in merged[componentType])) {
          merged[componentType][key] = value;
          continue;
        }

        if (isDeepStrictEqual(merged[componentType][key], value)) {
          continue;
        }

        let suffix = 0;
        let newKey: string;
        do {
          newKey = `${key}${++suffix}`;
        } while (newKey in merged[componentType]);

        merged[componentType][newKey] = value;

        if (componentType === 'securitySchemes') {
          securityRenames[key] = newKey;
        } else {
          renames[`#/components/${componentType}/${key}`] =
            `#/components/${componentType}/${newKey}`;
        }

        context.logger.warn(
          `⚠️ Duplicate component '${componentType}.${key}' with differing definitions. Renaming to '${newKey}'.`,
        );
      }
    }

    delete spec.components;

    if (Object.keys(renames).length > 0) {
      specifications[specIndex] = rewriteRefs(
        spec,
        (ref) => renames[ref] ?? ref,
      );
    }

    if (Object.keys(securityRenames).length > 0) {
      renameSecurityRequirements(specifications[specIndex], securityRenames);
    }
  }

  if (Object.keys(merged).length > 0) {
    globalSpec.components = merged;
  }
}

export default async function call(
  this: OpenApiGenerateSpecificationForWorkspace,
  context: WorkspaceContext,
): Promise<string> {
  const output = resolve(this.output ?? DEFAULT_OPENAPI_OUTPUT);
  const projectPaths = await context.listProjectPaths();

  const openApiSpecifications = await Promise.all(
    projectPaths.map((projectPath) =>
      generateForProject(context, projectPath, output),
    ),
  );

  context.logger.info(`📝 Merging OpenAPI specifications.`);
  const mergedSpecifications = await mergeSpecifications(
    context,
    openApiSpecifications.filter((spec) => spec !== null),
  );
  context.logger.info(`✅ Merged OpenAPI specifications.`);

  context.logger.info(`📦 Bundling external references.`);
  await bundle(mergedSpecifications, {
    plugins: [readFiles()],
    treeShake: true,
    origin: output,
  });

  if (this.version) {
    mergedSpecifications.info = {
      ...mergedSpecifications.info,
      version: this.version,
    };
  }

  const mergedSpecificationsYaml = dump(mergedSpecifications);

  if (this.returnSpecification) {
    return mergedSpecificationsYaml;
  }

  await writeFile(output, mergedSpecificationsYaml);
  return output;
}
