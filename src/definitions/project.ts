import { CliCommand, CliOption } from '@causa/cli';
import { WorkspaceFunction } from '@causa/workspace';
import { AllowMissing } from '@causa/workspace/validation';
import { IsBoolean, IsString } from 'class-validator';

/**
 * Builds the artefact for a project.
 * Returns the name of the output artefact (either the one specified as argument, or a generated one).
 */
@CliCommand({
  name: 'build',
  description: `Builds the artefact for the project.
Returns the name/identifier of the built artefact.`,
  summary: 'Builds the artefact for the project.',
  outputFn: console.log,
})
export abstract class ProjectBuildArtefact extends WorkspaceFunction<
  Promise<string>
> {
  /**
   * Optionally, the name of the output artefact.
   * Depending on the project being built, this can be the name of the created archive, the tag of the built Docker
   * image, etc.
   */
  @CliOption({
    flags: '-a, --artefact <artefact>',
    description: 'The name of the output artefact.',
  })
  @IsString()
  @AllowMissing()
  readonly artefact?: string;
}

/**
 * Returns the version of the project, as set in the project type-specific definition (e.g. the `package.json` file).
 */
export abstract class ProjectReadVersion extends WorkspaceFunction<
  Promise<string>
> {}

/**
 * Pushes the given build artefact to the configured repository.
 * This can upload a Cloud Function archive to Storage, push a Docker container to a registry, etc.
 * Returns the destination provided as input.
 */
export abstract class ProjectPushArtefact extends WorkspaceFunction<
  Promise<string>
> {
  /**
   * The local artefact to push.
   */
  @IsString()
  readonly artefact!: string;

  /**
   * The location where the artefact is being pushed.
   */
  @IsString()
  readonly destination!: string;

  /**
   * Whether the destination should be overwritten.
   * Defaults to `false`, which throws an error if the destination already exists.
   */
  @IsBoolean()
  @AllowMissing()
  readonly overwrite?: boolean;
}

/**
 * An error thrown when calling {@link ProjectPushArtefact} without `overwrite` and the `destination` already exists.
 */
export class ArtefactAlreadyExistsError extends Error {
  constructor(readonly destination: string) {
    super(`Artefact at destination '${destination}' already exists.`);
  }
}

/**
 * Constructs the destination for a project artefact.
 * For example, for a service container this would be the remote Docker tag that would be pushed. For a Cloud Function,
 * it would be the Cloud Storage URI where the archive will be uploaded.
 */
export abstract class ProjectGetArtefactDestination extends WorkspaceFunction<
  Promise<string>
> {
  /**
   * The tag or version of the artefact. This can be a semantic version, a Git SHA1, etc.
   */
  @IsString()
  readonly tag!: string;
}

/**
 * Combines the operations of {@link ProjectBuildArtefact} and {@link ProjectPushArtefact}, appropriately tagging the
 * artefact following the specified versioning (see {@link ProjectPublishArtefact.tag}).
 * Returns the artefact's destination (remote location).
 */
@CliCommand({
  name: 'publish',
  description: `Builds and pushes the artefact for the given project.
See the -t option to determine the versioning strategy.
Returns the artefact's destination (remote location).`,
  summary: 'Builds and pushes the artefact for the given project.',
  outputFn: console.log,
})
export abstract class ProjectPublishArtefact extends WorkspaceFunction<
  Promise<string>
> {
  /**
   * An already-built local artefact to push.
   * If this is not specified, the artefact for the project will first be built.
   */
  @CliOption({
    flags: '-a, --artefact <artefact>',
    description:
      'The name of the local artefact to push, instead of building one.',
  })
  @IsString()
  @AllowMissing()
  readonly artefact?: string;

  /**
   * The tag used to determine the remote destination for the artefact.
   * This can be any string, or one of the following:
   * - {@link ProjectPublishArtefact.TagFormatSemantic}: The artefact will be tagged with the current semantic
   *   version for the project.
   * - {@link ProjectPublishArtefact.TagFormatShortSha}: The artefact will be tagged with the current Git commit
   *   short SHA.
   */
  @IsString()
  @CliOption({
    flags: '-t, --tag <tag>',
    description: `The tag used to determine the remote destination for the artefact.
'${ProjectPublishArtefact.TagFormatSemantic}' for the current project version.
'${ProjectPublishArtefact.TagFormatShortSha}' for the current Git short SHA.`,
  })
  @AllowMissing()
  readonly tag?: string;

  /**
   * Whether the remote artefact should be overwritten.
   * Defaults to `false`, which throws an error if the destination already exists.
   */
  @IsBoolean()
  @CliOption({
    flags: '-f, --force',
    description: 'When set, overrides the destination (remote) artefact.',
  })
  @AllowMissing()
  readonly overwrite?: boolean;

  /**
   * The value of {@link ProjectPublishArtefact.tag} when the artefact should be tagged with the semantic version.
   */
  static readonly TagFormatSemantic = 'semantic';

  /**
   * The value of {@link ProjectPublishArtefact.tag} when the artefact should be tagged with the Git short SHA.
   */
  static readonly TagFormatShortSha = 'shortSha';
}

/**
 * Returns a URI to fetch (or display) the logs for the project.
 * This usually implies the `environment` being set in the context such that the logs can be appropriately filtered.
 * The URI could point to the console of the log service for example.
 */
@CliCommand({
  name: 'logs',
  description: `Outputs the URI where logs for the project can be accessed.
This usually implies the environment being set (using the -e option).`,
  summary: 'Outputs the URI where logs for the project can be accessed.',
  outputFn: console.log,
})
export abstract class ProjectGetLogsUri extends WorkspaceFunction<
  Promise<string>
> {}
