import { WorkspaceFunction } from '@causa/workspace';
import { AllowMissing } from '@causa/workspace/validation';
import { IsObject, IsString } from 'class-validator';

/**
 * The result of a {@link MakeHttpRequest} call.
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
export abstract class MakeHttpRequest extends WorkspaceFunction<
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
   * The path appended to {@link MakeHttpRequest.baseUrl}. Defaults to `/`.
   */
  @AllowMissing()
  @IsString()
  readonly path?: string;

  /**
   * Additional request headers, keyed by header name.
   */
  @AllowMissing()
  @IsObject()
  readonly headers?: Record<string, string>;

  /**
   * The request body. Objects and arrays are JSON-serialized, strings are sent as-is.
   */
  @AllowMissing()
  readonly body?: any;
}
