# `@causa/workspace-core` module

This repository contains the source code for the `@causa/workspace-core` Causa module. It provides the implementations of many `cs` commands. It also provides definitions for commands that are meant to be implemented by other modules, depending on the project types and/or languages. For more information about the Causa CLI `cs`, checkout [its repository](https://github.com/causa-io/cli).

## ➕ Requirements

The core module requires Git and [Docker](https://www.docker.com/) for some of its operations (e.g. reading Git commit SHAs when publishing artefacts, pushing Docker image when publishing service containers, etc).

## 🎉 Installation

Add `@causa/workspace-core` to your Causa configuration in `causa.modules`.

## 🔧 Configuration

Several configurations are defined in this module, first for some generic `project.type`s:

- `infrastructure` ([`InfrastructureConfiguration`](./src/configurations/infrastructure-project.ts)): Projects defining infrastructure as code.
- `serverlessFunctions` ([`ServerlessFunctionsConfiguration`](./src/configurations/infrastructure-project.ts)): Projects defining serverless functions, meant to be run on some `serverlessFunctions.platform` (e.g. AWS Lambda, Google Cloud Functions).
- `serviceContainer` ([`ServiceContainerConfiguration`](./src/configurations/service-container-project.ts)): Projects defining a service, meant to be run as a container on some `serviceContainer.platform` (e.g. Kubernetes, Cloud Run, AWS ECS).

This module also exposes the [`DockerConfiguration`](./src/configurations/docker.ts), which is used by the `DockerService`, exposing usual Docker commands.

It also exposes the [`EventsConfiguration`](./src/configurations/events.ts), which defines the configuration related to events and their topics (e.g. how to find topic schema files in the workspace).

For OpenAPI generation, the [`OpenApiConfiguration`](./src/configurations/openapi.ts) defines a global (base) specification for workspace-wide information (e.g. `info`, `securitySchemes`, etc).

## ✨ Supported project types and commands

The core module defines and implements many base `cs` commands. As a Causa user, you may want to check the [CLI repository](https://github.com/causa-io/cli) instead. As a module developer, you may want to check the [definitions](./src/definitions/) and determine which ones are relevant to implement in your module.

### Commands

- `cs init`: Initializes the workspace. This is a no-op in most cases as the CLI takes care of bootstrapping the workspace before running. The core module does not provide any project-specific implementation.
- `cs emulators`: Provides the `list`, `start`, and `stop` commands. However no actual emulator is implemented by this module. Available emulators will depend on other loaded modules.
- `cs environment`: Provides the `prepare` and `deploy` commands, forwarding those infrastructure commands to the project configured in `infrastructure.environmentProject`.
- `cs events generateCode`: Lists the event topics used by the current project (based on its type) and triggers the generation of the corresponding types. The actual code generation depends on the programming language and should be implemented in the relevant modules.
- `cs events backfill` and `cs events cleanBackfill`: The common backfilling logic is implemented in this module. However, this logic requires several tech stack-specific functions to be implemented by other modules.
- `cs infrastructure`: Provides the `prepare` and `deploy` commands. Those commands run "infrastructure processors" before the actual infrastructure operation, and tear those down afterwards. The core module does not implement actual infrastructure operations, which depend on the project's language, e.g. `terraform`.
- `cs publish`: While many base commands (e.g. `cs build`) are straightforward and should be implemented by the modules handling the corresponding project types and languages, `cs publish` provides some logic around these base commands to both build and push a project's artefact. The artefact is tagged according to the passed value or format, e.g. `my-custom-tag` or `semantic`. (The latter will use the project's version as the tag.)
- `cs openapi generateSpecification`: Provides the implementation at the workspace level, which triggers the generation of the specification in each project, and merges together the outputs. Does not provide any project type-specific implementation.

### Secrets backend

The core module implements a very basic secrets backend: `environmentVariable`. As the name suggests, it retrieves values from the process environment:

```yaml
secrets:
  mySecret:
    backend: environmentVariable
    name: SOME_ENV_VAR
```

## 📚 Definitions

The core module provides many Causa workspace function definitions. Some of those definitions are exposed as `cs` commands and provides the base functionalities for a Causa workspace. Some of the function definitions are implemented "generically" in this module, while others are meant to be implemented by other Causa modules, providing support of a specific project language or type.

This section provides pointers for Causa module developers. Workspace function definitions can be found in the [`./src/definitions`](./src/definitions/) directory. Those include:

- [Emulators](./src/definitions/emulator.ts): Modules exposing local emulators (e.g. of databases) should implement both `EmulatorStart` and `EmulatorStop` for each of them.
- [Environment](./src/definitions/environment.ts): Functions mapping to `cs environment` commands. Those are not meant to be implemented by other modules.
- [Event topic](./src/definitions/event-topic.ts): Functions related to event topics, backfilling, and code generation. Modules providing support for a programming language should implement `EventTopicGenerateCode`. Modules providing support for a new project type should implement `EventTopicListReferencedInProject`. Modules providing tech stack or cloud provider support should implement the `EventTopicBroker*` functions.
- [Infrastructure](./src/definitions/infrastructure.ts): Modules providing support for an Infrastructure as Code tool (e.g. Terraform, Pulumi) should implement the `InfrastructurePrepare` and `InfrastructureDeploy` functions.
- [Project](./src/definitions/project.ts): Many of the definitions in this file should be implemented by modules providing support for a language and/or project type, e.g. `ProjectBuildArtefact`, `ProjectReadVersion`, `ProjectPushArtefact`, `ProjectGetArtefactDestination`.
- [OpenAPI](./src/definitions/openapi.ts): Functions related to OpenAPI specifications. `OpenApiGenerateSpecification` should be implemented by Causa modules providing support for a language / project type (if relevant).

## 🔨 Services

This module implements some [services](./src/services/) used by itself, but which might also come handy in other modules, namely:

- `ProcessService`: Provides a normalized way to spawn child processes.
- `GitService`: Runs `git` commands using the `ProcessService`.
- `DockerService`: Runs `docker` commands using the `ProcessService`.
- `DockerEmulatorService`: Provides a normalized way to starting and stopping containerized emulators. Also provides a way to wait for an emulator exposing an HTTP endpoint.
- `ServiceContainerBuilderService`: Provides the base logic to build service container images (using the `DockerService`). Language-specific modules can use this service and customize build parameters.

## 🧱 Infrastructure processors

### `ProjectWriteConfigurations`

[ProjectWriteConfigurations](./src/functions/project-write-configurations.ts) is an infrastructure processor that writes the configuration of each and every project in the workspace to a single JSON file per project. This allows the configuration to be consumed by external systems that are not implemented in TypeScript and do not integrate directly with Causa. The output directory for the configuration files can be set in the `causa.projectConfigurationsDirectory` configuration, which defaults to `.causa/project-configurations`.

## 📫 Backfilling utilities

One of Causa's features is the ability to backfill events to be processed by services. Although there is always some stack-specific logic, some part of the backfilling flow can be implemented in a generic manner. The [backfill](./src/backfill/) folder contains utilities that may be reused by other Causa modules to provide backfilling functionalities.
