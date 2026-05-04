import { WorkspaceContext } from '@causa/workspace';
import { type HttpResponse, HttpMakeRequest } from '../../definitions/index.js';

/**
 * Implements {@link HttpMakeRequest} using the native `fetch` API.
 */
export class HttpMakeRequestForAll extends HttpMakeRequest {
  async _call(context: WorkspaceContext): Promise<HttpResponse> {
    const method = (this.method ?? 'GET').toUpperCase();
    const path = this.path ?? '/';
    const baseUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(this.baseUrl)
      ? this.baseUrl
      : `https://${this.baseUrl}`;
    const url = new URL(path, baseUrl);
    if (this.query) {
      for (const [key, value] of Object.entries(this.query)) {
        url.searchParams.append(key, value);
      }
    }

    const headers = { ...this.headers };
    let body: string | undefined;
    if (this.body !== undefined && method !== 'GET' && method !== 'HEAD') {
      if (typeof this.body === 'string') {
        body = this.body;
      } else {
        body = JSON.stringify(this.body);
        if (
          !Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')
        ) {
          headers['content-type'] = 'application/json';
        }
      }
    }

    context.logger.debug(`Making HTTP call '${method} ${url}'.`);

    const response = await fetch(url, { method, headers, body });

    const responseHeaders = Object.fromEntries(
      Array.from(response.headers).map(([k, v]) => [k.toLowerCase(), v]),
    );

    const isJson =
      responseHeaders['content-type']?.includes('application/json');
    const responseBody = isJson ? await response.json() : await response.text();

    return {
      statusCode: response.status,
      headers: responseHeaders,
      body: responseBody,
    };
  }

  _supports(): boolean {
    return true;
  }
}
