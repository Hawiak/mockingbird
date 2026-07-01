import { Injectable } from '@nestjs/common';
import type { ResponseBlock } from '@mockingbird/shared-types';

const MAX_DEPTH = 10;

type Schema = Record<string, unknown>;
type Responses = Record<string, unknown>;

@Injectable()
export class ResponseGeneratorService {
  /**
   * Generate a default ResponseBlock for an operation.
   * Returns null if a block with the same id already exists in existingBlocks.
   */
  generateDefaultBlock(
    operation: Record<string, unknown>,
    endpointId: string,
    existingBlocks: ResponseBlock[],
  ): ResponseBlock | null {
    const blockId = `${endpointId}_default`;
    if (existingBlocks.some(b => b.id === blockId)) return null;

    const responses = (operation['responses'] ?? {}) as Responses;

    // Pick lowest 2xx status code
    const statusCode = this.pickLowest2xx(responses);

    // Get the response object for that status
    const responseObj = (responses[String(statusCode)] ?? responses['default'] ?? {}) as Record<string, unknown>;

    // Pick content type
    const { contentType, body } = this.extractBody(responseObj, statusCode);

    const headers: Record<string, string> = {};
    if (contentType) headers['Content-Type'] = contentType;

    return {
      id: blockId,
      name: 'Default',
      statusCode,
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    };
  }

  /**
   * Generate default response values (statusCode, contentType, body, headers)
   * for use in ParsedEndpoint construction.
   */
  generateDefaultValues(operation: Record<string, unknown>): {
    statusCode: number;
    contentType: string;
    body: string;
    headers: Record<string, string>;
  } {
    const responses = (operation['responses'] ?? {}) as Responses;
    const statusCode = this.pickLowest2xx(responses);
    const responseObj = (responses[String(statusCode)] ?? responses['default'] ?? {}) as Record<string, unknown>;
    const { contentType, body } = this.extractBody(responseObj, statusCode);

    const headers: Record<string, string> = {};
    if (contentType) headers['Content-Type'] = contentType;

    return {
      statusCode,
      contentType: contentType || 'application/json',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers,
    };
  }

  private pickLowest2xx(responses: Responses): number {
    const codes = Object.keys(responses)
      .map(k => parseInt(k, 10))
      .filter(n => !isNaN(n) && n >= 200 && n < 300)
      .sort((a, b) => a - b);
    return codes[0] ?? 200;
  }

  private extractBody(
    responseObj: Record<string, unknown>,
    statusCode: number,
  ): { contentType: string; body: unknown } {
    // OAS3: responseObj.content
    const content = responseObj['content'] as Record<string, unknown> | undefined;
    if (content) {
      const mediaType =
        Object.keys(content).find(k => k === 'application/json') ?? Object.keys(content)[0];
      const mediaObj = (content[mediaType] ?? {}) as Record<string, unknown>;

      const body = this.extractFromMediaObject(mediaObj, statusCode);
      return { contentType: mediaType ?? '', body };
    }

    // OAS2: responseObj.schema + responseObj.examples
    const schema = responseObj['schema'] as Schema | undefined;
    const examples = responseObj['examples'] as Record<string, unknown> | undefined;

    if (examples?.['application/json'] !== undefined) {
      return { contentType: 'application/json', body: examples['application/json'] };
    }

    if (schema) {
      const generated = this.generateFromSchema(schema, 0);
      return { contentType: 'application/json', body: generated };
    }

    // No content (e.g. 204)
    return { contentType: '', body: '' };
  }

  private extractFromMediaObject(mediaObj: Record<string, unknown>, statusCode: number): unknown {
    // Priority 1: response example
    if (mediaObj['example'] !== undefined) return mediaObj['example'];

    // Priority 2: examples[0].value
    const examples = mediaObj['examples'] as Record<string, unknown> | undefined;
    if (examples) {
      const first = Object.values(examples)[0] as Record<string, unknown> | undefined;
      if (first?.['value'] !== undefined) return first['value'];
    }

    const schema = mediaObj['schema'] as Schema | undefined;
    if (!schema) {
      // Priority 6: empty for 204 / no schema
      return statusCode === 204 ? '' : '';
    }

    // Priority 3: schema.example
    if (schema['example'] !== undefined) return schema['example'];

    // Priority 4: schema.default
    if (schema['default'] !== undefined) return schema['default'];

    // Priority 5: generate from schema
    return this.generateFromSchema(schema, 0);
  }

  generateFromSchema(schema: Schema, depth: number): unknown {
    if (depth >= MAX_DEPTH) return null;

    // Handle nullable (OAS3 extension)
    // nullable: true means the schema can also be null, but we return the non-null value

    // $ref should already be resolved by SwaggerParser.dereference()

    // oneOf / anyOf → first schema
    if (Array.isArray(schema['oneOf'])) {
      const first = (schema['oneOf'] as Schema[])[0];
      return first ? this.generateFromSchema(first, depth + 1) : null;
    }
    if (Array.isArray(schema['anyOf'])) {
      const first = (schema['anyOf'] as Schema[])[0];
      return first ? this.generateFromSchema(first, depth + 1) : null;
    }

    // allOf → merge all schemas
    if (Array.isArray(schema['allOf'])) {
      const merged: Record<string, unknown> = {};
      for (const sub of schema['allOf'] as Schema[]) {
        const generated = this.generateFromSchema(sub, depth + 1);
        if (generated !== null && typeof generated === 'object' && !Array.isArray(generated)) {
          Object.assign(merged, generated as Record<string, unknown>);
        }
      }
      return merged;
    }

    const type = schema['type'] as string | undefined;

    if (type === 'string' || (!type && schema['format'])) {
      return this.generateString(schema);
    }
    if (type === 'integer' || type === 'number') {
      const minimum = schema['minimum'] as number | undefined;
      return minimum ?? 0;
    }
    if (type === 'boolean') return true;

    if (type === 'array') {
      const items = schema['items'] as Schema | undefined;
      const element = items ? this.generateFromSchema(items, depth + 1) : 'string';
      return [element];
    }

    if (type === 'object' || (schema['properties'] && !type)) {
      return this.generateObject(schema, depth);
    }

    // No type — try to infer from properties
    if (schema['properties']) {
      return this.generateObject(schema, depth);
    }

    // Enum
    if (Array.isArray(schema['enum'])) {
      return (schema['enum'] as unknown[])[0] ?? null;
    }

    // String fallback
    if (!type) return 'string';

    return null;
  }

  private generateString(schema: Schema): string {
    // Enum takes priority
    if (Array.isArray(schema['enum'])) {
      return String((schema['enum'] as unknown[])[0] ?? '');
    }

    const format = schema['format'] as string | undefined;
    switch (format) {
      case 'email': return 'user@example.com';
      case 'uuid': return '00000000-0000-4000-8000-000000000000';
      case 'date': return new Date().toISOString().slice(0, 10);
      case 'date-time': return new Date().toISOString();
      case 'uri':
      case 'url': return 'https://example.com';
      case 'password': return 'password';
      case 'byte': return 'c3RyaW5n'; // base64 for "string"
      case 'binary': return 'string';
      default: {
        const minLength = schema['minLength'] as number | undefined;
        if (minLength && minLength > 6) return 's'.repeat(minLength);
        return 'string';
      }
    }
  }

  private generateObject(schema: Schema, depth: number): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const properties = schema['properties'] as Record<string, Schema> | undefined;
    if (!properties) return result;
    for (const [key, propSchema] of Object.entries(properties)) {
      result[key] = this.generateFromSchema(propSchema, depth + 1);
    }
    return result;
  }
}
