import { WorkspaceContext } from '@causa/workspace';
import { createContext } from '@causa/workspace/testing';
import { jest } from '@jest/globals';
import { Server, createServer } from 'http';
import 'jest-extended';
import { pino } from 'pino';
import { setTimeout } from 'timers/promises';
import {
  DockerEmulatorAvailabilityCheckTimeoutError,
  DockerEmulatorService,
} from './docker-emulator.js';
import { DockerService } from './docker.js';

describe('DockerEmulatorService', () => {
  let context: WorkspaceContext;
  let service: DockerEmulatorService;
  let dockerService: DockerService;

  beforeEach(() => {
    ({ context } = createContext({ logger: pino({ level: 'debug' }) }));
    dockerService = context.service(DockerService);
    service = context.service(DockerEmulatorService);
    jest.spyOn(dockerService, 'rm').mockResolvedValue();
    jest.spyOn(dockerService, 'run').mockResolvedValue({ code: 0 });
    jest
      .spyOn(dockerService, 'createNetworkIfNeeded')
      .mockResolvedValue('my-network');
  });

  describe('start', () => {
    it('should stop and start the container attached to the correct network', async () => {
      await service.start(
        'my-image',
        'my-container',
        [{ local: 8080, container: 1234 }],
        {},
      );

      expect(dockerService.rm).toHaveBeenCalledOnceWith(
        ['my-container'],
        expect.anything(),
      );
      expect(dockerService.createNetworkIfNeeded).toHaveBeenCalledOnce();
      expect(dockerService.run).toHaveBeenCalledOnceWith(
        'my-image',
        expect.objectContaining({
          detach: true,
          name: 'my-container',
          network: 'my-network',
          publish: [{ local: 8080, container: 1234 }],
        }),
      );
    });
  });

  describe('stop', () => {
    it('should remove the container', async () => {
      await service.stop('my-container');

      expect(dockerService.rm).toHaveBeenCalledOnceWith(
        ['my-container'],
        expect.objectContaining({ force: true, volumes: true, logging: null }),
      );
    });
  });

  describe('waitForAvailability', () => {
    const port = 12345;
    let emulatorMockServer: Server;
    let currentHttpStatusCode: number;
    let numRequests: number;
    let lastRequestedUrl: string | undefined;

    beforeEach(async () => {
      numRequests = 0;
      currentHttpStatusCode = 200;
      emulatorMockServer = createServer((req, res) => {
        lastRequestedUrl = req.url;
        numRequests += 1;
        res.writeHead(currentHttpStatusCode);
        res.end();
      });
      await new Promise<void>((resolve, reject) => {
        emulatorMockServer.listen(port, '127.0.0.1', resolve);
        emulatorMockServer.on('error', reject);
      });
    });

    afterEach(async () => {
      await new Promise<void>((resolve, reject) => {
        emulatorMockServer.close((err) => (err ? reject(err) : resolve()));
      });
    });

    it('should return when the server returns the expected status code', async () => {
      currentHttpStatusCode = 500;
      let isAvailable = false;

      const actualPromise = service
        .waitForAvailability('🤖', `http://127.0.0.1:${port}/some-endpoint`, {
          timeBetweenTries: 100,
        })
        .then(() => {
          isAvailable = true;
        });

      await setTimeout(200);

      expect(isAvailable).toBeFalse();

      currentHttpStatusCode = 200;

      await actualPromise;
      expect(isAvailable).toBeTrue();
      expect(numRequests).toBeGreaterThanOrEqual(2);
      expect(lastRequestedUrl).toEqual('/some-endpoint');
    });

    it('should allow a custom status code', async () => {
      currentHttpStatusCode = 204;

      await service.waitForAvailability(
        '🤖',
        `http://127.0.0.1:${port}/custom`,
        { timeBetweenTries: 100, expectedStatus: 204 },
      );

      expect(numRequests).toEqual(1);
      expect(lastRequestedUrl).toEqual('/custom');
    });

    it('should throw when timeout is reached due to the server being unavailable', async () => {
      const actualPromise = service.waitForAvailability(
        '🤖',
        `http://127.0.0.1:12346/custom`,
        { timeBetweenTries: 100, maxNumTries: 2 },
      );

      await expect(actualPromise).rejects.toThrow(
        DockerEmulatorAvailabilityCheckTimeoutError,
      );
      expect(numRequests).toEqual(0);
    });

    it('should throw when timeout is reached due to the server returning the incorrect status', async () => {
      currentHttpStatusCode = 500;
      await setTimeout(100);

      const actualPromise = service.waitForAvailability(
        '🤖',
        `http://127.0.0.1:${port}/custom`,
        { timeBetweenTries: 100, maxNumTries: 3 },
      );

      await expect(actualPromise).rejects.toThrow(
        DockerEmulatorAvailabilityCheckTimeoutError,
      );
      expect(numRequests).toEqual(3);
    });
  });
});
