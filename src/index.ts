import { ModuleRegistrationFunction } from '@causa/workspace';
import { registerFunctions } from './functions/register.js';

export * from './configurations/index.js';
export * from './definitions/index.js';
export * from './functions/index.js';
export * from './services/index.js';

const registerModule: ModuleRegistrationFunction = async (context) => {
  registerFunctions(context);
};

export default registerModule;
