# 🔖 Changelog

## Unreleased

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
