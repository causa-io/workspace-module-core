import {
  CliArgument,
  CliCommand,
  type ParentCliCommandDefinition,
} from '@causa/cli';
import { WorkspaceFunction } from '@causa/workspace';
import { AllowMissing } from '@causa/workspace/validation';
import { IsBoolean, IsString } from 'class-validator';

/**
 * The `events` parent command, grouping all commands related to managing events, their topics, and the corresponding
 * schemas.
 */
export const emulatorsCommandDefinition: ParentCliCommandDefinition = {
  name: 'emulators',
  description: 'Manages local emulators.',
};

/**
 * The result of the {@link EmulatorStart} function.
 */
export type EmulatorStartResult = {
  /**
   * The name of the emulator.
   */
  name: string;

  /**
   * The dictionary (usually environment variables and their values) that can be used to configure a client to reach the
   * emulator.
   */
  configuration: Record<string, string>;
};

/**
 * Starts a local emulator.
 * This function is meant to be implemented by all modules providing emulator capabilities. In addition to possibly
 * checking the configuration, the implementation's {@link WorkspaceFunction._supports} should also check the
 * {@link EmulatorStart.name} argument, and return `true` only when `name` is `undefined` or equal to its own name.
 * If {@link EmulatorStart.dryRun} is `true`, the implementation should be a no-op.
 * The implementation should always return the emulator's name (the one matched with {@link EmulatorStart.name}).
 */
export abstract class EmulatorStart extends WorkspaceFunction<
  Promise<EmulatorStartResult>
> {
  /**
   * The name of the emulator that should be launched.
   * `undefined` will match all emulators and start all of them.
   */
  @IsString()
  @AllowMissing()
  readonly name?: string;

  /**
   * If `true`, the function is a no-op and only the emulator's name is returned.
   */
  @IsBoolean()
  @AllowMissing()
  readonly dryRun?: boolean;
}

/**
 * Stops a local emulator.
 * Similarly to {@link EmulatorStart}, implementations should check {@link EmulatorStop.name} to determine whether they
 * support the call.
 * Returns the name of the emulator.
 */
export abstract class EmulatorStop extends WorkspaceFunction<Promise<string>> {
  @IsString()
  @AllowMissing()
  readonly name?: string;
}

/**
 * The result of the {@link EmulatorStartMany} function.
 */
export type EmulatorStartManyResult = {
  /**
   * The list of emulators that were started.
   */
  emulatorNames: string[];

  /**
   * The merged configurations returned by the calls to {@link EmulatorStart}.
   */
  configuration: Record<string, string>;
};

/**
 * Starts one or several emulators.
 * This is a generic function meant to be exposed as a CLI command and should not be implemented by modules other than
 * the core module.
 */
@CliCommand({
  parent: emulatorsCommandDefinition,
  name: 'start',
  description: `Starts all or the selected emulators.
By default running emulators are restarted.`,
  summary: 'Starts all or the selected emulators.',
  outputFn: ({ emulatorNames }) => console.log(emulatorNames.join('\n')),
})
export abstract class EmulatorStartMany extends WorkspaceFunction<
  Promise<EmulatorStartManyResult>
> {
  /**
   * The list of emulators to start. If the list is empty, all available emulators are started.
   */
  @CliArgument({
    name: '[emulators...]',
    position: 0,
    description:
      'The list of emulators to start. By default all emulators are started.',
  })
  @IsString({ each: true })
  readonly emulators!: string[];
}

/**
 * Stops one or several emulators.
 * This is a generic function meant to be exposed as a CLI command and should not be implemented by modules other than
 * the core module.
 */
@CliCommand({
  parent: emulatorsCommandDefinition,
  name: 'stop',
  description: 'Stops all or the selected emulators.',
  outputFn: (emulators) => console.log(emulators.join('\n')),
})
export abstract class EmulatorStopMany extends WorkspaceFunction<
  Promise<string[]>
> {
  /**
   * The list of emulators to stop. If the list is empty, all available emulators are stopped.
   */
  @CliArgument({
    name: '[emulators...]',
    position: 0,
    description:
      'The list of emulators to stop. By default all emulators are stopped.',
  })
  @IsString({ each: true })
  readonly emulators!: string[];
}

/**
 * Returns the names of available emulators.
 * This is a generic function meant to be exposed as a CLI command and should not be implemented by modules other than
 * the core module.
 */
@CliCommand({
  parent: emulatorsCommandDefinition,
  name: 'list',
  description: 'Lists the available emulators.',
  outputFn: (emulators) => console.log(emulators.join('\n')),
})
export abstract class EmulatorList extends WorkspaceFunction<
  Promise<string[]>
> {}
