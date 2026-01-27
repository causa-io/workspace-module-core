import { WorkspaceContext } from '@causa/workspace';
import { NoImplementationFoundError } from '@causa/workspace/function-registry';
import { bundle } from '@scalar/json-magic/bundle';
import { readFiles } from '@scalar/json-magic/bundle/plugins/node';
import { join as joinSpecs } from '@scalar/openapi-parser';
import type { OpenAPIV3_1 } from '@scalar/openapi-types';
import { writeFile } from 'fs/promises';
import { dump, load } from 'js-yaml';
import { resolve } from 'path';
import type { OpenApiConfiguration } from '../../configurations/index.js';
import { OpenApiGenerateSpecification } from '../../definitions/index.js';

/**
 * The default file where the OpenAPI specification is written.
 */
const DEFAULT_OPENAPI_OUTPUT = 'openapi.yaml';

/**
 * Implements {@link OpenApiGenerateSpecification} for the Causa workspace, outside of any actual project.
 * This triggers the generation of the OpenAPI documentation for all projects in the workspace, ignoring projects for
 * which the generation is not supported. Then, it merges all the generated documentation into a single file.
 */
export class OpenApiGenerateSpecificationForWorkspace extends OpenApiGenerateSpecification {
  async _call(context: WorkspaceContext): Promise<string> {
    const output = resolve(this.output ?? DEFAULT_OPENAPI_OUTPUT);
    const projectPaths = await context.listProjectPaths();

    const openApiSpecifications = await Promise.all(
      projectPaths.map((projectPath) =>
        this.generateForProject(context, projectPath, output),
      ),
    );

    context.logger.info(`📝 Merging OpenAPI specifications.`);
    const mergedSpecifications = await this.mergeSpecifications(
      context,
      openApiSpecifications.filter((spec): spec is object => spec !== null),
    );
    context.logger.info(`✅ Merged OpenAPI specifications.`);

    context.logger.info(`📦 Bundling external references.`);
    await bundle(mergedSpecifications, {
      plugins: [readFiles()],
      treeShake: true,
      origin: output,
    });

    const mergedSpecificationsYaml = dump(mergedSpecifications);

    if (this.returnSpecification) {
      return mergedSpecificationsYaml;
    }

    await writeFile(output, mergedSpecificationsYaml);
    return output;
  }

  _supports(context: WorkspaceContext): boolean {
    return (
      context.get('project.name') === undefined &&
      context.get('project.type') === undefined &&
      context.get('project.language') === undefined
    );
  }

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
  private async generateForProject(
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

      const openApiStr = await projectContext.call(
        OpenApiGenerateSpecification,
        { returnSpecification: true, output },
      );

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
  private async mergeSpecifications(
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

    this.deduplicateSecuritySchemes(globalSpec, specifications);

    const result = await joinSpecs([globalSpec, ...specifications]);
    if (!result.ok) {
      throw new Error(
        `Could not merge OpenAPI specifications: ${result.conflicts.map((c) => JSON.stringify(c)).join(', ')}.`,
      );
    }

    return result.document;
  }

  /**
   * Extracts `components.securitySchemes` from all project specifications and merges them into the global
   * specification. This avoids conflicts when joining specifications that define the same security schemes.
   * Global security schemes take precedence over project-level ones.
   *
   * @param globalSpec The global specification to merge security schemes into.
   * @param specifications The project specifications to extract security schemes from.
   */
  private deduplicateSecuritySchemes(
    globalSpec: OpenAPIV3_1.Document,
    specifications: OpenAPIV3_1.Document[],
  ): void {
    const securitySchemes: OpenAPIV3_1.ComponentsObject['securitySchemes'] = {};
    for (const spec of specifications) {
      if (!spec.components?.securitySchemes) {
        continue;
      }

      Object.assign(securitySchemes, spec.components.securitySchemes);
      delete spec.components.securitySchemes;
    }

    const globalSecuritySchemes = globalSpec.components?.securitySchemes;
    if (Object.keys(securitySchemes).length > 0 || globalSecuritySchemes) {
      globalSpec.components = {
        ...globalSpec.components,
        securitySchemes: { ...securitySchemes, ...globalSecuritySchemes },
      };
    }
  }
}
