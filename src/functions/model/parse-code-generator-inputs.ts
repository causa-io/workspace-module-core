import type { WorkspaceContext } from '@causa/workspace';
import { globby } from 'globby';
import { resolve } from 'path';
import {
  EventTopicListReferencedInProject,
  ModelParseCodeGeneratorInputs,
  type CodeGeneratorInputs,
} from '../../definitions/index.js';

/**
 * Implements the {@link ModelParseCodeGeneratorInputs} function.
 * This parses the standard code generator configuration and returns the list of input files.
 */
export class ModelParseCodeGeneratorInputsForAll extends ModelParseCodeGeneratorInputs {
  async _call(context: WorkspaceContext): Promise<CodeGeneratorInputs> {
    const projectPath = context.getProjectPathOrThrow();

    const includeEvents = this.configuration.includeEvents ?? false;
    if (includeEvents !== undefined && typeof includeEvents !== 'boolean') {
      throw new Error(
        `The 'includeEvents' configuration option must be a boolean.`,
      );
    }

    const globs = this.configuration.globs ?? [];
    if (
      globs !== undefined &&
      (!Array.isArray(globs) || globs.some((g) => typeof g !== 'string'))
    ) {
      throw new Error(
        `The 'globs' configuration option must be an array of strings.`,
      );
    }

    const { nestedSchemas } = this.configuration;
    if (
      nestedSchemas !== undefined &&
      (!Array.isArray(nestedSchemas) ||
        nestedSchemas.some((f) => typeof f !== 'string'))
    ) {
      throw new Error(
        `The 'nestedSchemas' configuration option must be an array of strings.`,
      );
    }

    const { includeFullReferences } = this.configuration;
    if (
      includeFullReferences !== undefined &&
      typeof includeFullReferences !== 'boolean'
    ) {
      throw new Error(
        `The 'includeFullReferences' configuration option must be a boolean.`,
      );
    }

    const filesSet = new Set<string>();

    if (includeEvents) {
      context.logger.debug('Listing event topics referenced in the project.');

      const { consumed, produced } = await context.call(
        EventTopicListReferencedInProject,
        {},
      );
      consumed.forEach((t) => filesSet.add(t.schemaFilePath));
      produced.forEach((t) => filesSet.add(t.schemaFilePath));
    }

    if (globs.length > 0) {
      context.logger.debug(
        'Listing schemas from globs configured for the generator.',
      );

      const paths = await globby(globs, {
        followSymbolicLinks: false,
        cwd: projectPath,
      });
      paths.forEach((p) => filesSet.add(resolve(projectPath, p)));
    }

    const files = Array.from(filesSet);
    context.logger.debug(
      `Found input schema files to generate:\n${files.join('\n')}`,
    );

    return {
      includeEvents,
      globs,
      files,
      nestedSchemas,
      includeFullReferences,
    };
  }

  _supports(): boolean {
    return true;
  }
}
