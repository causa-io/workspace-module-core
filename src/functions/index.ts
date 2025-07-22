import type { ModuleRegistrationContext } from '@causa/workspace';
import {
  EmulatorListForAll,
  EmulatorStartManyForAll,
  EmulatorStopManyForAll,
} from './emulator/index.js';
import {
  EnvironmentDeployForAll,
  EnvironmentPrepareForAll,
} from './environment/index.js';
import {
  EventTopicBackfillForAll,
  EventTopicCleanBackfillForAll,
  EventTopicGenerateCodeForJsonSchema,
  EventTopicGenerateCodeReferencedInProjectForAll,
  EventTopicListForAll,
  EventTopicListReferencedInProjectForServerlessFunctions,
  EventTopicListReferencedInProjectForServiceContainer,
} from './event-topic/index.js';
import {
  InfrastructureProcessAndDeployForAll,
  InfrastructureProcessAndPrepareForAll,
} from './infrastructure/index.js';
import { ModelGenerateCodeForAll } from './model/generate-code.js';
import { OpenApiGenerateSpecificationForWorkspace } from './openapi/index.js';
import {
  ProjectDependenciesUpdateAndTestForAll,
  ProjectDiffForAll,
  ProjectInitForWorkspace,
  ProjectPublishArtefactForAll,
  ProjectPushArtefactForServiceContainer,
  ProjectWriteConfigurations,
} from './project/index.js';
import { SecretFetchForEnvironmentVariable } from './secret/index.js';

export function registerFunctions(context: ModuleRegistrationContext) {
  context.registerFunctionImplementations(
    EmulatorListForAll,
    EmulatorStartManyForAll,
    EmulatorStopManyForAll,
    EnvironmentDeployForAll,
    EnvironmentPrepareForAll,
    EventTopicBackfillForAll,
    EventTopicCleanBackfillForAll,
    EventTopicGenerateCodeForJsonSchema,
    EventTopicGenerateCodeReferencedInProjectForAll,
    EventTopicListReferencedInProjectForServerlessFunctions,
    EventTopicListReferencedInProjectForServiceContainer,
    EventTopicListForAll,
    InfrastructureProcessAndDeployForAll,
    InfrastructureProcessAndPrepareForAll,
    ModelGenerateCodeForAll,
    OpenApiGenerateSpecificationForWorkspace,
    ProjectDependenciesUpdateAndTestForAll,
    ProjectDiffForAll,
    ProjectInitForWorkspace,
    ProjectPublishArtefactForAll,
    ProjectPushArtefactForServiceContainer,
    ProjectWriteConfigurations,
    SecretFetchForEnvironmentVariable,
  );
}
