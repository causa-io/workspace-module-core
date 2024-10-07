import {
  CliArgument,
  CliCommand,
  CliOption,
  type ParentCliCommandDefinition,
} from '@causa/cli';
import { WorkspaceFunction, type BaseConfiguration } from '@causa/workspace';
import { AllowMissing } from '@causa/workspace/validation';
import { IsArray, IsBoolean, IsString } from 'class-validator';

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
This can be any string, or one of the following:
'${ProjectPublishArtefact.TagFormatSemantic}' for the current project version.
'${ProjectPublishArtefact.TagFormatShortSha}' for the current Git short SHA (default).`,
  })
  @AllowMissing()
  readonly tag?: string;

  /**
   * A prefix to add to the tag being published.
   * This is only useful when the tag is automatically generated and is not yet known when calling the function.
   */
  @IsString()
  @CliOption({
    flags: '--tagPrefix <tagPrefix>',
    description: `A prefix to add to the tag being published.
This is mostly useful when using one of the predefined tag formats.`,
  })
  @AllowMissing()
  readonly tagPrefix?: string;

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
 * Initializes an existing project locally.
 * Depending on the project, this could install dependencies, set up a virtual environment, etc.
 */
@CliCommand({
  name: 'init',
  description: `Initializes an existing project locally.
Depending on the project, this could install dependencies, set up a virtual environment, etc.`,
  summary: 'Initializes an existing project locally.',
})
export abstract class ProjectInit extends WorkspaceFunction<Promise<void>> {
  /**
   * Whether the project should be re-initialized, even if it already is.
   * Prior to running the initialization, this will clean up the project.
   */
  @IsBoolean()
  @AllowMissing()
  @CliOption({
    flags: '-f, --force',
    description: 'When set, re-initializes the project.',
  })
  readonly force?: boolean;
}

/**
 * Runs the tests for the project.
 * The project might need to be initialized first (see {@link ProjectInit}).
 */
@CliCommand({
  name: 'test',
  description: `Runs the tests for the project.
The project might need to be initialized first (see the 'init' command).`,
  summary: 'Runs the tests for the project.',
})
export abstract class ProjectTest extends WorkspaceFunction<Promise<void>> {
  /**
   * Computes test coverage.
   */
  @IsBoolean()
  @AllowMissing()
  @CliOption({
    flags: '-c, --coverage',
    description: 'Computes test coverage.',
  })
  readonly coverage?: boolean;
}

/**
 * Runs the configured linter for the project.
 */
@CliCommand({
  name: 'lint',
  description: 'Runs the configured linter for the project.',
})
export abstract class ProjectLint extends WorkspaceFunction<Promise<void>> {}

/**
 * The `dependencies` parent command, grouping all commands related to managing a project's dependencies.
 */
export const dependenciesCommandDefinition: ParentCliCommandDefinition = {
  name: 'dependencies',
  description: 'Manages dependencies for a project.',
  aliases: ['dep'],
};

/**
 * Checks the project's dependencies for vulnerabilities.
 */
@CliCommand({
  parent: dependenciesCommandDefinition,
  name: 'check',
  description: `Checks the project's dependencies for vulnerabilities.`,
})
export abstract class ProjectDependenciesCheck extends WorkspaceFunction<
  Promise<void>
> {}

/**
 * Updates the project's dependencies.
 * Depending on the provider, this might search for new versions online and install them, or simply update a lock file
 * following a manual update of the dependencies.
 * Returns `true` if at least one dependency was updated, `false` otherwise.
 */
export abstract class ProjectDependenciesUpdate extends WorkspaceFunction<
  Promise<boolean>
> {}

/**
 * Updates the project's dependencies and runs tests to ensure there is no regression.
 * Depending on the provider, this might search for new versions online and install them, or simply update a lock file
 * following a manual update of the dependencies.
 */
@CliCommand({
  parent: dependenciesCommandDefinition,
  name: 'update',
  description: `Updates the project's dependencies and runs tests to ensure there is no regression.
Depending on the provider, this might search for new versions online and install them, or simply update a lock file following a manual update of the dependencies.`,
  summary: `Updates the project's dependencies and run tests.`,
})
export abstract class ProjectDependenciesUpdateAndTest extends WorkspaceFunction<
  Promise<void>
> {
  /**
   * Skips running the tests before and after updating the dependencies.
   */
  @IsBoolean()
  @AllowMissing()
  @CliOption({
    flags: '--skip-test',
    description: `Skips running the tests before and after updating the dependencies.`,
  })
  readonly skipTest?: boolean;
}

/**
 * The `security` parent command, grouping all commands related to analyzing the security of a project.
 */
export const securityCommandDefinition: ParentCliCommandDefinition = {
  name: 'security',
  description: 'Analyzes the security of a project.',
  aliases: ['sec'],
};

/**
 * Scans the project's source code for vulnerabilities.
 */
@CliCommand({
  parent: securityCommandDefinition,
  name: 'check',
  description: `Scans the project's source code for vulnerabilities.`,
})
export abstract class ProjectSecurityCheck extends WorkspaceFunction<
  Promise<void>
> {}

/**
 * A dictionary of changes to projects in a workspace.
 * Keys are project paths, relative to the workspace root.
 */
export type ProjectDiffResult = Record<
  string,
  {
    /**
     * The list of files belonging to the project that have changes.
     */
    readonly diff: string[];

    /**
     * The `project` configuration of the project.
     */
    readonly configuration: BaseConfiguration['project'];
  }
>;

/**
 * Lists the projects with changes in the workspace.
 * This is based on git diff and accepts commits as arguments in the same way.
 * A project is detected as having changes if any of the files within it has changes.
 * A project can also use `project.externalFiles` to define files on which it depends and make it change.
 */
@CliCommand({
  name: 'diff',
  description: `Lists the projects with changes in the workspace. This is based on git diff and accepts commits as arguments in the same way.
A project is detected as having changes if any of the files within it has changes. A project can also define "external files" on which it depends and make it change.`,
  summary: `Lists the projects with changes in the workspace.`,
  outputFn: (diff, { json }) =>
    console.log(
      json ? JSON.stringify(diff, null, 2) : Object.keys(diff).join('\n'),
    ),
})
export abstract class ProjectDiff extends WorkspaceFunction<
  Promise<ProjectDiffResult>
> {
  /**
   * The commits to compare.
   * The default behavior is similar to git: compare the working directory with the last commit.
   * At most two commits can be compared.
   */
  @CliArgument({
    name: '[commits...]',
    position: 0,
    description:
      'The commits to compare. The default behavior is similar to git: compare the working directory with the last commit. At most two commits can be compared.',
  })
  @IsArray()
  @IsString({ each: true })
  @AllowMissing()
  readonly commits?: string[];

  /**
   * Changes the output format of the CLI command.
   * This is not used when the function is called programmatically.
   */
  @CliOption({
    flags: '--json',
    description:
      'Returns a detailed diff as JSON instead of a list of projects.',
  })
  @IsBoolean()
  @AllowMissing()
  readonly json?: boolean;
}
