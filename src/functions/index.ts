import { ModuleRegistrationContext } from '@causa/workspace';
import { EmulatorListForAll } from './emulator-list.js';
import { EmulatorStartManyForAll } from './emulator-start-many.js';
import { EmulatorStopManyForAll } from './emulator-stop-many.js';
import { ProjectPublishArtefactForAll } from './project-publish-artefact.js';
import { SecretFetchForEnvironmentVariable } from './secret-fetch-environment-variable.js';

export function registerFunctions(context: ModuleRegistrationContext) {
  context.registerFunctionImplementations(
    EmulatorListForAll,
    EmulatorStartManyForAll,
    EmulatorStopManyForAll,
    ProjectPublishArtefactForAll,
    SecretFetchForEnvironmentVariable,
  );
}
