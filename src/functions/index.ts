import { ModuleRegistrationContext } from '@causa/workspace';
import { EmulatorListForAll } from './emulator-list.js';
import { EmulatorStartManyForAll } from './emulator-start-many.js';
import { EmulatorStopManyForAll } from './emulator-stop-many.js';
import { EnvironmentDeployForAll } from './environment-deploy.js';
import { EnvironmentPrepareForAll } from './environment-prepare.js';
import { EventTopicGenerateCodeReferencedInProjectForAll } from './event-topic-generate-code-referenced-in-project.js';
import { EventTopicListReferencedInProjectForServiceContainer } from './event-topic-list-referenced-in-project-service-container.js';
import { EventTopicListForAll } from './event-topic-list.js';
import { InfrastructureProcessAndDeployForAll } from './infrastructure-process-and-deploy.js';
import { InfrastructureProcessAndPrepareForAll } from './infrastructure-process-and-prepare.js';
import { ProjectPublishArtefactForAll } from './project-publish-artefact.js';
import { ProjectPushArtefactForServiceContainer } from './project-push-artefact-service-container.js';
import { SecretFetchForEnvironmentVariable } from './secret-fetch-environment-variable.js';

export function registerFunctions(context: ModuleRegistrationContext) {
  context.registerFunctionImplementations(
    EmulatorListForAll,
    EmulatorStartManyForAll,
    EmulatorStopManyForAll,
    EnvironmentDeployForAll,
    EnvironmentPrepareForAll,
    EventTopicGenerateCodeReferencedInProjectForAll,
    EventTopicListReferencedInProjectForServiceContainer,
    EventTopicListForAll,
    InfrastructureProcessAndDeployForAll,
    InfrastructureProcessAndPrepareForAll,
    ProjectPublishArtefactForAll,
    ProjectPushArtefactForServiceContainer,
    SecretFetchForEnvironmentVariable,
  );
}
