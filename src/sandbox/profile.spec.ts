import { WorkspaceContext } from '@causa/workspace';
import { createContext } from '@causa/workspace/testing';
import type { SandboxProfile } from '../configurations/index.js';
import {
  InvalidSandboxProfileError,
  SandboxProfileNotFoundError,
  resolveSandboxProfile,
} from './profile.js';

describe('resolveSandboxProfile', () => {
  const rootPath = '/workspace/root';

  function makeContext(
    sandboxes?: Record<string, SandboxProfile>,
  ): WorkspaceContext {
    const { context } = createContext({
      rootPath,
      workingDirectory: rootPath,
      configuration: sandboxes ? { causa: { sandboxes } } : {},
    });
    return context;
  }

  it('should throw when the referenced profile is not configured', () => {
    const noSandboxesContext = makeContext();
    expect(() => resolveSandboxProfile(noSandboxesContext, 'install')).toThrow(
      SandboxProfileNotFoundError,
    );

    const missingSandboxContext = makeContext({
      install: { network: { allowedDomains: [] } },
    });
    expect(() =>
      resolveSandboxProfile(missingSandboxContext, 'missing'),
    ).toThrow(SandboxProfileNotFoundError);
  });

  it('should resolve a full profile, merging the auto-injected paths into the filesystem restrictions', () => {
    const context = makeContext({
      install: {
        network: {
          allowedDomains: ['registry.npmjs.org', '*.npmjs.org'],
          deniedDomains: ['evil.example.com'],
          allowLocalBinding: true,
          allowUnixSockets: ['/var/run/docker.sock'],
          allowAllUnixSockets: false,
        },
        filesystem: {
          denyRead: ['/secrets'],
          allowRead: ['~/.npm', '~/.asdf'],
          allowWrite: ['~/.npm'],
          denyWrite: ['/workspace/root/.env'],
          disabled: false,
        },
        enableWeakerNestedSandbox: true,
        enableWeakerNetworkIsolation: true,
      },
    });

    const resolved = resolveSandboxProfile(context, 'install');

    expect(resolved).toEqual({
      network: {
        allowedDomains: ['registry.npmjs.org', '*.npmjs.org'],
        deniedDomains: ['evil.example.com'],
        allowLocalBinding: true,
        allowUnixSockets: ['/var/run/docker.sock'],
        allowAllUnixSockets: false,
      },
      filesystem: {
        denyRead: ['~', '/secrets'],
        allowRead: [rootPath, '~/.npm', '~/.asdf'],
        allowWrite: [rootPath, '~/.npm'],
        denyWrite: ['/workspace/root/.env'],
        disabled: false,
      },
      enableWeakerNestedSandbox: true,
      enableWeakerNetworkIsolation: true,
    });
  });

  it('should apply defaults, blocking all network access and restricting the filesystem to the workspace root', () => {
    const context = makeContext({ build: {} });

    const resolved = resolveSandboxProfile(context, 'build');

    expect(resolved).toEqual({
      network: {
        allowedDomains: [],
        deniedDomains: [],
      },
      filesystem: {
        denyRead: ['~'],
        allowRead: [rootPath],
        allowWrite: [rootPath],
        denyWrite: [],
      },
    });
  });

  it('should map masked credentials and enable TLS termination', () => {
    const context = makeContext({
      install: {
        network: { allowedDomains: ['registry.npmjs.org'] },
        credentials: {
          environment: {
            NPM_TOKEN: { hosts: ['registry.npmjs.org'] },
          },
        },
      },
    });

    const resolved = resolveSandboxProfile(context, 'install');

    expect(resolved.network.tlsTerminate).toEqual({});
    expect(resolved.credentials).toEqual({
      envVars: [
        {
          name: 'NPM_TOKEN',
          mode: 'mask',
          injectHosts: ['registry.npmjs.org'],
        },
      ],
    });
  });

  it('should deny a credential with no hosts rather than mask it, without enabling TLS termination', () => {
    const context = makeContext({
      install: {
        network: { allowedDomains: ['registry.npmjs.org'] },
        credentials: {
          environment: {
            AWS_SECRET_ACCESS_KEY: { hosts: [] },
          },
        },
      },
    });

    const resolved = resolveSandboxProfile(context, 'install');

    expect(resolved.network.tlsTerminate).toBeUndefined();
    expect(resolved.credentials).toEqual({
      envVars: [{ name: 'AWS_SECRET_ACCESS_KEY', mode: 'deny' }],
    });
  });

  it('should not enable TLS termination when no credentials are declared', () => {
    const context = makeContext({ build: { network: { allowedDomains: [] } } });

    const resolved = resolveSandboxProfile(context, 'build');

    expect(resolved.network.tlsTerminate).toBeUndefined();
    expect(resolved.credentials).toBeUndefined();
  });

  it('should throw, surfacing the offending path, when the profile is invalid', () => {
    const context = makeContext({
      bad: { network: { allowedDomains: ['not a domain'] } },
    });

    try {
      resolveSandboxProfile(context, 'bad');
      throw new Error('Expected the resolution to throw.');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidSandboxProfileError);
      expect((error as InvalidSandboxProfileError).key).toEqual('bad');
      expect((error as Error).message).toContain('allowedDomains');
    }
  });
});
