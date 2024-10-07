# 🔖 Changelog

## Unreleased

Breaking change:

- Change `GitService.diff` option to `commits`, to explicitly handle several commits.

Features:

- Implement `GitService.getRepositoryRootPath`.
- Define `ProjectDiff` and implement it for any projects and workspace.

## v0.21.0 (2024-05-27)

Breaking change:

- Ignore symbolic links in the `JsonFilesEventSource`.

## v0.20.0 (2024-05-17)

Breaking change:

- Drop support for Node.js 16.

Chore:

- Upgrade dependencies.

## v0.19.1 (2023-11-02)

Fixes:

- Handle Causa attributes being combined with a null type during JSONSchema-based code generation.

## v0.19.0 (2023-10-31)

Breaking changes:

- Language-specific modules are no longer expected to implement `EventTopicGenerateCode` directly, at least for JSONSchema topic definitions. `EventTopicGenerateCode` is now implemented by this module using [quicktype](https://github.com/glideapps/quicktype). Language modules should implement `EventTopicMakeCodeGenerationTargetLanguage` instead and return a quicktype `TargetLanguage`.

Features:

- Implement and expose [quicktype-related utilities](./src/code-generation/), meant to be used by language-specific Causa modules for code generation.

Chores:

- Organize function implementations into subfolders.

## v0.18.0 (2023-10-03)

Features:

- Allow specifying a prefix for the tag passed to `ProjectPublishArtefact` (`--tagPrefix` when using the CLI).

## v0.17.0 (2023-10-03)

Features:

- Define the `serviceContainer.buildFile` and `serviceContainer.buildSecrets` configuration parameters.
- Implement the `ServiceContainerBuilderService`.

## v0.16.0 (2023-09-18)

Features:

- Support overriding the OpenAPI version in the `openApi.global` document.
- Support generating the list of OpenAPI servers from the list of environments.

## v0.15.0 (2023-09-15)

Features:

- Define the `OpenApiGenerateSpecification` workspace function (`cs openapi genSpec`) and provide its workspace-level implementation, which merges all OpenAPI specifications in a single file.
- Support the `envFile` options for `DockerService.run`.
- Log the emulators configuration after starting them using `cs emulators start`.
- Suggest an authorization issue when failing to push a Docker image for a service container.

## v0.14.1 (2023-08-04)

Fixes:

- Make the backfill command in the logs reflect the selected environment (e.g. `cs events cleanBackfill -e dev "file.json"`).

## v0.14.0 (2023-08-04)

Features:

- Define and implement backfilling utilities: `BackfillEvent`, `BackfillEventsSource`, `BackfillEventPublisher`, and `JsonFilesEventSource`.

Fixes:

- Add missing decorators on `EventTopicBackfill.output` argument.

## v0.13.0 (2023-08-03)

Features:

- Define backfill-related workspace functions: `EventTopicBackfill`, `EventTopicCleanBackfill`, `EventTopicBrokerCreateTopic`, `EventTopicBrokerGetTopicId`, `EventTopicBrokerCreateTrigger`, `EventTopicBrokerPublishEvents`, `EventTopicBrokerDeleteTriggerResource`, and `EventTopicBrokerDeleteTopic`.
- Implement `EventTopicBackfill` and `EventTopicCleanBackfill` for any context.

## v0.12.0 (2023-08-01)

Breaking changes:

- `ProjectDependenciesUpdate` should now return a boolean indicating whether at least one dependency was updated.
- Make `GitService.diff` accept spawn options and return a process result.

Features:

- Do not run tests again if no dependency was updated.

## v0.11.0 (2023-07-31)

Features:

- Implement `ProjectDependenciesUpdateAndTest` for all types of projects.

## v0.10.0 (2023-07-31)

Features:

- Define the `--destroy` option for the `infrastructure` and `environment prepare` commands.
- Define the `ProjectDependenciesUpdate` and `ProjectDependenciesUpdateAndTest` functions, which define the `dependencies update` command.
- Implement the `diff` and `filesDiff` method of the `GitService`.

## v0.9.0 (2023-07-28)

Features:

- Define the `EventsConfiguration`, and add new fields to `ServiceContainerConfiguration`.

Fixes:

- Ensure the project configurations directory is emptied before writing configurations.

## v0.8.0 (2023-07-24)

Features:

- Implement the `ProjectWriteConfigurations` infrastructure processor.

## v0.7.0 (2023-06-08)

Features:

- Define the `ProjectInit`, `ProjectTest`, `ProjectLint`, `ProjectDependenciesCheck`, and `ProjectSecurityCheck` workspace functions.
- Implement `ProjectInit` for Causa workspaces.

## v0.6.0 (2023-06-01)

Features:

- Define the `serverlessFunctions.build.globPatterns` configuration.

## v0.5.0 (2023-05-31)

Features:

- Implement `EventTopicListReferencedInProject` for `serverlessFunctions` projects.

Fixes:

- Ensure there is no duplicate in the events returned by `EventTopicListReferencedInProjectForServiceContainer`.

## v0.4.0 (2023-05-23)

Features:

- Expose `DockerContainerMount` and `DockerContainerPublish` types for the `DockerService`.
- Implement the `DockerEmulatorService`.

## v0.3.0 (2023-05-19)

Breaking changes:

- Upgrade to `@causa/workspace >= 0.6.0`.

## v0.2.0 (2023-05-19)

Breaking changes:

- The `InfrastructureProcessor` now extends the generic `ProcessorFunction`. This means the processors should return a value containing a `configuration` property, rather than the configuration itself.

## v0.1.0 (2023-05-17)

Features:

- Expose `WorkspaceFunction` definitions.
- Expose base configuration types.
- Implement the `ProcessService`.
- Implement the `GitService`.
- Implement the `DockerService`.
- Implement the `SecretFetchForEnvironmentVariable` workspace function.
- Implement the `EmulatorListForAll`, `EmulatorStartManyForAll`, and `EmulatorStopManyForAll` functions.
- Implement the `ProjectPublishArtefactForAll` and `ProjectPushArtefactForServiceContainer` functions.
- Implement the `EnvironmentDeployForAll` and `EnvironmentPrepareForAll` functions.
- Implement the `InfrastructureProcessAndPrepareForAll` and `InfrastructureProcessAndDeployForAll` functions.
- Implement the `EventTopicGenerateCodeReferencedInProjectForAll`, `EventTopicListReferencedInProjectForServiceContainer`, and `EventTopicListForAll` functions.
