import { WorkspaceContext } from '@causa/workspace';
import { createContext } from '@causa/workspace/testing';
import 'jest-extended';
import nock from 'nock';
import { HttpMakeRequest } from '../../definitions/index.js';
import { HttpMakeRequestForAll } from './make-request.js';

describe('HttpMakeRequestForAll', () => {
  let context: WorkspaceContext;

  beforeEach(() => {
    ({ context } = createContext({ functions: [HttpMakeRequestForAll] }));
  });

  afterEach(() => {
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
