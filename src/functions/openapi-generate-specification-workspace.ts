import { WorkspaceContext } from '@causa/workspace';
import { NoImplementationFoundError } from '@causa/workspace/function-registry';
import { writeFile } from 'fs/promises';
import { dump, load } from 'js-yaml';
import { isErrorResult, merge } from 'openapi-merge';
import { OpenApiConfiguration } from '../configurations/index.js';
import { OpenApiGenerateSpecification } from '../definitions/index.js';

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
    const projectPaths = await context.listProjectPaths();

    const openApiSpecifications = await Promise.all(
      projectPaths.map((projectPath) =>
        this.generateForProject(context, projectPath),
      ),
    );

    context.logger.info(`📝 Merging OpenAPI specifications.`);
    const mergedSpecifications = this.mergeSpecifications(
      context,
      openApiSpecifications.filter((spec): spec is object => spec !== null),
    );
    const mergedSpecificationsYaml = dump(mergedSpecifications);
    context.logger.info(`✅ Merged OpenAPI specifications.`);

    if (this.returnSpecification) {
      return mergedSpecificationsYaml;
    }

    const output = this.output ?? DEFAULT_OPENAPI_OUTPUT;
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
   * @returns The parsed OpenAPI specification for the project, or `null` if the project does not support OpenAPI
   *   generation.
   */
  private async generateForProject(
    context: WorkspaceContext,
    projectPath: string,
  ): Promise<object | null> {
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
        { returnSpecification: true },
      );

      const openApiSpecification = load(openApiStr) as object;

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
  private mergeSpecifications(
    context: WorkspaceContext,
    specifications: object[],
  ): object {
    const inputs = specifications.map((spec) => ({ oas: spec as any }));

    const globalSpecs = context
      .asConfiguration<OpenApiConfiguration>()
      .get('openApi.global');
    if (globalSpecs) {
      inputs.unshift({ oas: globalSpecs });
    }

    const result = merge(inputs);
    if (isErrorResult(result)) {
      throw new Error(
        `Could not merge OpenAPI specifications: '${result.message}'.`,
      );
    }

    return result.output;
  }
}
