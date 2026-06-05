import { WorkspaceContext } from '@causa/workspace';
import { createContext } from '@causa/workspace/testing';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import 'jest-extended';
import nock from 'nock';
import { tmpdir } from 'os';
import { join } from 'path';
import { HttpMakeRequest } from '../../definitions/index.js';
import { HttpMakeRequestForAll } from './make-request.js';

describe('HttpMakeRequestForAll', () => {
  let tmpDir: string;
  let context: WorkspaceContext;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'causa-http-'));
    ({ context } = createContext({
      rootPath: tmpDir,
      functions: [HttpMakeRequestForAll],
    }));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    nock.cleanAll();
  });

  it('should default to GET / and parse a JSON response', async () => {
    const scope = nock('https://api.example.com')
      .get('/')
      .reply(200, { hello: 'world' }, { 'content-type': 'application/json' });

    const actual = await context.call(HttpMakeRequest, {
      baseUrl: 'https://api.example.com',
    });

    expect(actual).toEqual({
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: { hello: 'world' },
    });
    scope.done();
  });

  it('should send a JSON body with content-type and forward custom headers', async () => {
    const scope = nock('https://api.example.com', {
      reqheaders: {
        'content-type': 'application/json',
        authorization: 'Bearer token',
      },
    })
      .post('/items', { name: 'thing' })
      .reply(201, { id: '🆔' }, { 'content-type': 'application/json' });

    const actual = await context.call(HttpMakeRequest, {
      baseUrl: 'https://api.example.com',
      method: 'POST',
      path: '/items',
      headers: { authorization: 'Bearer token' },
      body: { name: 'thing' },
    });

    expect(actual).toEqual({
      statusCode: 201,
      headers: { 'content-type': 'application/json' },
      body: { id: '🆔' },
    });
    scope.done();
  });

  it('should JSON-serialize a string body when the content type is application/json', async () => {
    const scope = nock('https://api.example.com', {
      reqheaders: { 'content-type': 'application/json' },
    })
      .post('/items', '"already-a-string"')
      .reply(201, { ok: true }, { 'content-type': 'application/json' });

    const actual = await context.call(HttpMakeRequest, {
      baseUrl: 'https://api.example.com',
      method: 'POST',
      path: '/items',
      headers: { 'content-type': 'application/json' },
      body: 'already-a-string',
    });

    expect(actual).toEqual({
      statusCode: 201,
      headers: { 'content-type': 'application/json' },
      body: { ok: true },
    });
    scope.done();
  });

  it('should send a string body as-is and return non-JSON responses as text', async () => {
    const scope = nock('https://api.example.com')
      .put('/raw', 'plain-text')
      .matchHeader(
        'content-type',
        (value) => value === undefined || !value.includes('application/json'),
      )
      .reply(200, 'hello there', { 'content-type': 'text/plain' });

    const actual = await context.call(HttpMakeRequest, {
      baseUrl: 'https://api.example.com',
      method: 'PUT',
      path: '/raw',
      body: 'plain-text',
    });

    expect(actual).toEqual({
      statusCode: 200,
      headers: { 'content-type': 'text/plain' },
      body: 'hello there',
    });
    scope.done();
  });

  it('should default the scheme to https when missing and honor a path prefix', async () => {
    const scope = nock('https://api.example.com')
      .get('/v1/items/42')
      .reply(200, { id: 42 }, { 'content-type': 'application/json' });

    const actual = await context.call(HttpMakeRequest, {
      baseUrl: 'api.example.com/v1/',
      path: 'items/42',
    });

    expect(actual).toEqual({
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: { id: 42 },
    });
    scope.done();
  });

  it('should append query string parameters to the URL', async () => {
    const scope = nock('https://api.example.com')
      .get('/search')
      .query({ q: 'hello world', page: '2' })
      .reply(200, { ok: true }, { 'content-type': 'application/json' });

    const actual = await context.call(HttpMakeRequest, {
      baseUrl: 'https://api.example.com',
      path: '/search',
      query: { q: 'hello world', page: '2' },
    });

    expect(actual).toEqual({
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: { ok: true },
    });
    scope.done();
  });

  it('should send the body as multipart/form-data when the content type requests it', async () => {
    const scope = nock('https://api.example.com')
      .matchHeader('content-type', (value) =>
        value.startsWith('multipart/form-data; boundary='),
      )
      .post(
        '/upload',
        (body) =>
          body.includes('name="field"') &&
          body.includes('hello') &&
          body.includes('name="file"') &&
          body.includes('filename="data.txt"') &&
          body.includes('file-content'),
      )
      .reply(200, { ok: true }, { 'content-type': 'application/json' });

    const actual = await context.call(HttpMakeRequest, {
      baseUrl: 'https://api.example.com',
      method: 'POST',
      path: '/upload',
      headers: { 'content-type': 'multipart/form-data' },
      body: {
        field: 'hello',
        file: {
          value: 'file-content',
          filename: 'data.txt',
          contentType: 'text/plain',
        },
      },
    });

    expect(actual).toEqual({
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: { ok: true },
    });
    scope.done();
  });

  it('should send a multipart/form-data file part sourced from a local file path', async () => {
    await writeFile(join(tmpDir, 'upload.txt'), 'file-from-disk');
    const scope = nock('https://api.example.com')
      .matchHeader('content-type', (value) =>
        value.startsWith('multipart/form-data; boundary='),
      )
      .post(
        '/upload',
        (body) =>
          typeof body === 'string' &&
          body.includes('name="file"') &&
          body.includes('filename="upload.txt"') &&
          body.includes('file-from-disk'),
      )
      .reply(200, { ok: true }, { 'content-type': 'application/json' });

    const actual = await context.call(HttpMakeRequest, {
      baseUrl: 'https://api.example.com',
      method: 'POST',
      path: '/upload',
      headers: { 'content-type': 'multipart/form-data' },
      body: { file: { path: 'upload.txt' } },
    });

    expect(actual).toEqual({
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: { ok: true },
    });
    scope.done();
  });

  it('should throw when a multipart/form-data body is not an object', async () => {
    const actualPromise = context.call(HttpMakeRequest, {
      baseUrl: 'https://api.example.com',
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data' },
      body: 'not-an-object',
    });

    await expect(actualPromise).rejects.toThrow(
      "A 'multipart/form-data' request body must be an object",
    );
  });

  it('should expose error responses without throwing', async () => {
    const scope = nock('https://api.example.com')
      .get('/missing')
      .reply(
        404,
        { error: 'not found' },
        { 'content-type': 'application/json' },
      );

    const actual = await context.call(HttpMakeRequest, {
      baseUrl: 'https://api.example.com',
      path: '/missing',
    });

    expect(actual).toEqual({
      statusCode: 404,
      headers: { 'content-type': 'application/json' },
      body: { error: 'not found' },
    });
    scope.done();
  });
});
