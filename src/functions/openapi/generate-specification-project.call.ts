import type { WorkspaceContext } from '@causa/workspace';
import { join as joinSpecs } from '@scalar/openapi-parser';
import type { OpenAPIV3_1 } from '@scalar/openapi-types';
import { readFile, writeFile } from 'fs/promises';
import { globby } from 'globby';
import { dump, load } from 'js-yaml';
import { dirname, isAbsolute, relative, resolve } from 'path';
import type { OpenApiConfiguration } from '../../configurations/index.js';
import type { OpenApiGenerateSpecificationForProjectByMerging } from './generate-specification-project.js';
import { rewriteRefs } from './utils.js';

/**
 * The default file where the OpenAPI specification is written.
 */
const DEFAULT_OPENAPI_OUTPUT = 'openapi.yaml';

/**
 * Loads a specification file and rewrites its relative `$ref` paths to be relative to the output directory.
 *
 * @param specFilePath The absolute path to the specification file.
 * @param outputDir The directory of the output file.
 * @returns The parsed specification with rewritten references.
 */
async function loadAndRewriteRefs(
  specFilePath: string,
  outputDir: string,
): Promise<any> {
  const content = await readFile(specFilePath, 'utf-8');
  const spec = load(content);
  const specFileDir = dirname(specFilePath);
  return rewriteRefs(spec, (ref) => {
    const [filePart, fragment] = ref.split('#', 2);
    if (filePart === '' || URL.canParse(filePart) || isAbsolute(filePart)) {
      return ref;
    }

    const absoluteRef = resolve(specFileDir, filePart);
    const relativePath = relative(outputDir, absoluteRef);
    return fragment !== undefined
      ? `${relativePath}#${fragment}`
      : relativePath;
  });
}

export default async function call(
  this: OpenApiGenerateSpecificationForProjectByMerging,
  context: WorkspaceContext,
): Promise<string> {
  const openApiConf = context.asConfiguration<OpenApiConfiguration>();
  const specificationGlobs = openApiConf.get('openApi.specifications') ?? [];
  const globalSpec: OpenAPIV3_1.Document =
    openApiConf.get('openApi.global') ?? {};
  const projectPath = context.getProjectPathOrThrow();

  const output = resolve(this.output ?? DEFAULT_OPENAPI_OUTPUT);
  const outputDir = dirname(output);

  context.logger.info(`📝 Resolving OpenAPI specification globs for project.`);

  const specFiles = await globby(specificationGlobs, {
    cwd: projectPath,
    onlyFiles: true,
    followSymbolicLinks: false,
  });

  const specifications = await Promise.all(
    specFiles.map((specFile) =>
      loadAndRewriteRefs(resolve(projectPath, specFile), outputDir),
    ),
  );

  context.logger.info(
    `📝 Merging ${specifications.length} OpenAPI specification(s).`,
  );

  const inputs = [globalSpec, ...specifications];

  const result = await joinSpecs(inputs);
  if (!result.ok) {
    throw new Error(
      `Could not merge OpenAPI specifications: ${result.conflicts.map((c) => JSON.stringify(c)).join(', ')}.`,
    );
  }

  if (this.version) {
    result.document.info = { ...result.document.info, version: this.version };
  }

  const mergedSpecificationsYaml = dump(result.document);
  context.logger.info(`✅ Merged OpenAPI specifications.`);

  if (this.returnSpecification) {
    return mergedSpecificationsYaml;
  }

  await writeFile(output, mergedSpecificationsYaml);
  return output;
}
