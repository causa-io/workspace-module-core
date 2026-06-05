import { readFile } from 'fs/promises';
import { basename, resolve } from 'path';
import {
  type HttpFormField,
  type HttpResponse,
  HttpMakeRequest,
} from '../../definitions/index.js';

/**
 * Implements {@link HttpMakeRequest} using the native `fetch` API.
 */
export class HttpMakeRequestForAll extends HttpMakeRequest {
  async _call(): Promise<HttpResponse> {
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
    const contentTypeHeader = Object.keys(headers).find(
      (h) => h.toLowerCase() === 'content-type',
    );
    const contentType = headers[contentTypeHeader ?? '']?.toLowerCase();
    const isFormData = contentType?.includes('multipart/form-data');
    const isJsonRequest = contentType?.includes('application/json');

    let body: string | FormData | undefined;
    if (this.body !== undefined && method !== 'GET' && method !== 'HEAD') {
      if (isFormData) {
        // `fetch` sets the `multipart/form-data` content type, including the boundary, from the `FormData` body, so the
        // header is removed to let it do so.
        delete headers[contentTypeHeader!];
        body = await this.buildFormData(this.body);
      } else if (!isJsonRequest && typeof this.body === 'string') {
        body = this.body;
      } else {
        body = JSON.stringify(this.body);
        if (contentTypeHeader === undefined) {
          headers['content-type'] = 'application/json';
        }
      }
    }

    this._context.logger.debug(`Making HTTP call '${method} ${url}'.`);

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

  /**
   * Builds a {@link FormData} body from a `multipart/form-data` request body. String fields are appended as text;
   * object fields are appended as file parts, with content sourced from an inline `value` or a local file `path`
   * (resolved from the workspace root).
   *
   * @param body The request body, expected to be an object keyed by field name with {@link HttpFormField} values.
   * @returns The populated {@link FormData}.
   */
  private async buildFormData(body: unknown): Promise<FormData> {
    if (typeof body !== 'object' || body === null) {
      throw new Error(
        "A 'multipart/form-data' request body must be an object keyed by field name.",
      );
    }

    const formData = new FormData();

    for (const [name, field] of Object.entries(
      body as Record<string, HttpFormField>,
    )) {
      if (typeof field === 'string') {
        formData.append(name, field);
        continue;
      }

      const hasPath = 'path' in field;
      const content = hasPath
        ? await readFile(resolve(this._context.rootPath, field.path))
        : field.value;
      const defaultFilename = hasPath ? basename(field.path) : undefined;
      const blob = new Blob([content], { type: field.contentType ?? '' });

      formData.append(name, blob, field.filename ?? defaultFilename);
    }

    return formData;
  }

  _supports(): boolean {
    return true;
  }
}
