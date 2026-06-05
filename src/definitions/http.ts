import { WorkspaceFunction } from '@causa/workspace';
import { AllowMissing } from '@causa/workspace/validation';
import { IsObject, IsString } from 'class-validator';

/**
 * A single field of a `multipart/form-data` request body. Such a body is sent by setting {@link HttpMakeRequest.body}
 * to an object keyed by field name and the `Content-Type` header to `multipart/form-data`.
 */
export type HttpFormField =
  | string
  | ({
      /**
       * The filename to advertise for the part, which sends the field as a file rather than a text field. For a `path`
       * part, defaults to the basename of the path.
       */
      readonly filename?: string;

      /**
       * The content type of the part.
       */
      readonly contentType?: string;
    } & (
      | {
          /**
           * The inline content of the part.
           */
          readonly value: string;
        }
      | {
          /**
           * The path to a local file, resolved from the workspace root, whose content is sent as the part.
           */
          readonly path: string;
        }
    ));

/**
 * The result of a {@link HttpMakeRequest} call.
 */
export type HttpResponse = {
  /**
   * The HTTP status code of the response.
   */
  readonly statusCode: number;

  /**
   * The response headers, with header names lowercased.
   */
  readonly headers: Record<string, string>;

  /**
   * The parsed response body. JSON responses are parsed, other content types are returned as a string.
   */
  readonly body: any;
};

/**
 * Performs an HTTP request and returns the status code, headers, and parsed body.
 */
export abstract class HttpMakeRequest extends WorkspaceFunction<
  Promise<HttpResponse>
> {
  /**
   * The base URL of the target service. May include a path prefix (e.g. `https://api.example.com/v1`). The scheme is
   * optional and defaults to `https://` when missing.
   */
  @IsString()
  readonly baseUrl!: string;

  /**
   * The HTTP method to use. Defaults to `GET`.
   */
  @AllowMissing()
  @IsString()
  readonly method?: string;

  /**
   * The path appended to {@link HttpMakeRequest.baseUrl}. Defaults to `/`.
   */
  @AllowMissing()
  @IsString()
  readonly path?: string;

  /**
   * Query string parameters appended to the URL, keyed by parameter name. Values are URL-encoded automatically.
   */
  @AllowMissing()
  @IsObject()
  readonly query?: Record<string, string>;

  /**
   * Additional request headers, keyed by header name.
   */
  @AllowMissing()
  @IsObject()
  readonly headers?: Record<string, string>;

  /**
   * The request body.
   * - When the `Content-Type` header is `multipart/form-data`, an object is sent as a form (keyed by field name, with
   *   {@link HttpFormField} values) and the header's boundary is set automatically.
   * - When the `Content-Type` header is `application/json`, the body is JSON-serialized.
   * - Otherwise, strings are sent as-is, and objects and arrays are JSON-serialized.
   */
  @AllowMissing()
  readonly body?: any;
}
