import {
  SandboxManager,
  type SandboxRuntimeConfig,
} from '@anthropic-ai/sandbox-runtime';
import { jest } from '@jest/globals';
import 'jest-extended';
import { SandboxCoordinator, SandboxNotSupportedError } from './coordinator.js';

describe('SandboxCoordinator', () => {
  const config: SandboxRuntimeConfig = {
    network: { allowedDomains: ['a.example.com'], deniedDomains: [] },
    filesystem: { denyRead: [], allowWrite: [], denyWrite: [] },
  };
  const configCredentials: SandboxRuntimeConfig = {
    network: {
      allowedDomains: ['api.example.com'],
      deniedDomains: [],
      tlsTerminate: {},
    },
    filesystem: { denyRead: [], allowWrite: [], denyWrite: [] },
    credentials: {
      envVars: [
        { name: 'TOKEN', mode: 'mask', injectHosts: ['api.example.com'] },
      ],
    },
  };

  let coordinator: SandboxCoordinator;

  beforeEach(() => {
    jest.spyOn(SandboxManager, 'isSupportedPlatform').mockReturnValue(true);
    jest
      .spyOn(SandboxManager, 'checkDependencies')
      .mockReturnValue({ errors: [], warnings: [] });
    jest.spyOn(SandboxManager, 'initialize').mockResolvedValue(undefined);
    jest.spyOn(SandboxManager, 'reset').mockResolvedValue(undefined);
    jest
      .spyOn(SandboxManager, 'wrapWithSandboxArgv')
      .mockResolvedValue({ argv: ['/bin/bash', '-c', ':'], env: {} });

    coordinator = new SandboxCoordinator();
  });

  afterEach(() => SandboxManager.getSentinelRegistry().clear());

  it('should initialize the manager with the configuration on acquisition', async () => {
    expect(SandboxManager.initialize).not.toHaveBeenCalled();

    await coordinator.acquire(config, 'node', [], undefined);

    expect(SandboxManager.initialize).toHaveBeenCalledExactlyOnceWith(config);
  });

  it('should run sandboxed commands one at a time', async () => {
    const { release } = await coordinator.acquire(
      config,
      'node',
      [],
      undefined,
    );

    let secondAcquired = false;
    const second = coordinator
      .acquire(config, 'node', [], undefined)
      .then(() => {
        secondAcquired = true;
      });

    expect(secondAcquired).toBeFalse();

    await release();
    await second;

    expect(secondAcquired).toBeTrue();
  });

  it('should wrap the quoted command and return the spawn-ready argv and merged environment', async () => {
    const { argv, environment, release } = await coordinator.acquire(
      config,
      'npm',
      ['ci', "a'b"],
      { CALLER: 'x' },
    );

    expect(SandboxManager.wrapWithSandboxArgv).toHaveBeenCalledExactlyOnceWith(
      "'npm' 'ci' 'a'\\''b'",
      undefined,
      { ...config, credentials: {} },
    );
    expect(argv).toEqual(['/bin/bash', '-c', ':']);
    expect(environment).toEqual({ CALLER: 'x' });
    expect(release).toBeFunction();
  });

  it('should tear the manager down on release so the process can exit', async () => {
    const { release } = await coordinator.acquire(
      config,
      'node',
      [],
      undefined,
    );

    expect(SandboxManager.reset).not.toHaveBeenCalled();

    await release();

    expect(SandboxManager.reset).toHaveBeenCalledOnce();
  });

  it('should initialize and tear down the manager for each command', async () => {
    const first = await coordinator.acquire(config, 'node', [], undefined);
    await first.release();

    const second = await coordinator.acquire(config, 'node', [], undefined);
    await second.release();

    expect(SandboxManager.initialize).toHaveBeenCalledTimes(2);
    expect(SandboxManager.reset).toHaveBeenCalledTimes(2);
  });

  it('should mask declared credentials from the caller environment and strip them from the wrap config', async () => {
    const registry = SandboxManager.getSentinelRegistry();

    const { environment } = await coordinator.acquire(
      configCredentials,
      'node',
      [],
      { TOKEN: 'real-secret', OTHER: 'keep' },
    );

    expect(environment).toMatchObject({
      TOKEN: expect.toStartWith('fake_value_'),
      OTHER: 'keep',
    });
    expect(registry.lookupReal(environment.TOKEN!)).toEqual('real-secret');

    // The wrap configuration has credentials neutralized so the runtime does not also mask them.
    expect(SandboxManager.wrapWithSandboxArgv).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      undefined,
      expect.objectContaining({ credentials: {} }),
    );
  });

  it('should deny (unset) a credential declared with deny mode', async () => {
    const denyConfig: SandboxRuntimeConfig = {
      network: { allowedDomains: [], deniedDomains: [] },
      filesystem: { denyRead: [], allowWrite: [], denyWrite: [] },
      credentials: { envVars: [{ name: 'SECRET', mode: 'deny' }] },
    };

    const { environment } = await coordinator.acquire(denyConfig, 'node', [], {
      SECRET: 'real-secret',
      OTHER: 'keep',
    });

    expect(environment).not.toContainKey('SECRET');
    expect(environment.OTHER).toEqual('keep');
  });

  it('should clear masked credentials on release', async () => {
    const registry = SandboxManager.getSentinelRegistry();

    const { release } = await coordinator.acquire(
      configCredentials,
      'node',
      [],
      { TOKEN: 'real-secret' },
    );
    expect(registry.size).toBeGreaterThan(0);

    await release();

    expect(registry.size).toEqual(0);
  });

  it('should reject when the platform is not supported', async () => {
    jest.spyOn(SandboxManager, 'isSupportedPlatform').mockReturnValue(false);

    const actualPromise = coordinator.acquire(config, 'node', [], undefined);

    await expect(actualPromise).rejects.toThrow(SandboxNotSupportedError);
    expect(SandboxManager.initialize).not.toHaveBeenCalled();
  });

  it('should reject when sandbox dependencies are missing', async () => {
    jest
      .spyOn(SandboxManager, 'checkDependencies')
      .mockReturnValue({ errors: ['ripgrep (rg) not found'], warnings: [] });

    const actualPromise = coordinator.acquire(config, 'node', [], undefined);

    await expect(actualPromise).rejects.toThrow(SandboxNotSupportedError);
    expect(SandboxManager.initialize).not.toHaveBeenCalled();
  });

  it('should release the hold so the next command can run when initialization fails', async () => {
    jest
      .spyOn(SandboxManager, 'initialize')
      .mockRejectedValueOnce(new Error('💥'));

    await expect(
      coordinator.acquire(config, 'node', [], undefined),
    ).rejects.toThrow('💥');

    await coordinator.acquire(config, 'node', [], undefined);
    expect(SandboxManager.initialize).toHaveBeenCalledTimes(2);
  });
});
