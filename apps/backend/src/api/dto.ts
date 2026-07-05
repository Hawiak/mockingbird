import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsObject,
  IsArray,
  IsIn,
  Min,
  Max,
} from 'class-validator';
import type {
  SpecSource,
  CorsConfig,
  ProxyConfig,
  ResponseNode,
} from '@mockingbird/shared-types';

// ─── Service ───────────────────────────────────────────────────────────────

export class CreateServiceBodyDto {
  @IsString()
  name!: string;

  @IsNumber()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsObject()
  spec!: SpecSource;

  @IsOptional()
  @IsString()
  specContent?: string;

  @IsOptional()
  @IsObject()
  cors?: CorsConfig;

  @IsOptional()
  @IsObject()
  proxy?: ProxyConfig;
}

export class UpdateServiceBodyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsObject()
  spec?: SpecSource;

  @IsOptional()
  @IsObject()
  cors?: CorsConfig;

  @IsOptional()
  @IsObject()
  proxy?: ProxyConfig;
}

export class UpdateSpecBodyDto {
  @IsOptional()
  @IsString()
  specContent?: string;

  @IsOptional()
  @IsString()
  url?: string;
}

// ─── Endpoint ──────────────────────────────────────────────────────────────

export class UpdateEndpointBodyDto {
  @IsOptional()
  @IsBoolean()
  disabled?: boolean;

  @IsOptional()
  @IsObject()
  proxy?: ProxyConfig | { enabled: false };

  @IsOptional()
  @IsObject()
  responseNode?: ResponseNode;
}

// ─── Response Block ────────────────────────────────────────────────────────

export class CreateResponseBlockBodyDto {
  @IsString()
  name!: string;

  @IsNumber()
  @Min(100)
  @Max(599)
  statusCode!: number;

  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @IsOptional()
  @IsString()
  body?: string;
}

export class UpdateResponseBlockBodyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(599)
  statusCode?: number;

  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @IsOptional()
  @IsString()
  body?: string;
}

// ─── Module ────────────────────────────────────────────────────────────────

export class CreateModuleBodyDto {
  @IsString()
  name!: string;

  @IsIn(['kafka', 'http'])
  type!: 'kafka' | 'http';

  @IsOptional()
  @IsString()
  scope?: string;

  @IsObject()
  config!: Record<string, unknown>;
}

export class UpdateModuleBodyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['kafka', 'http'])
  type?: 'kafka' | 'http';

  @IsOptional()
  @IsString()
  scope?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

// ─── Parameter Set ─────────────────────────────────────────────────────────

export class CreateParameterSetBodyDto {
  @IsString()
  name!: string;

  @IsObject()
  values!: Record<string, string>;
}

export class UpdateParameterSetBodyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsObject()
  values?: Record<string, string>;
}

// ─── Template Preview ──────────────────────────────────────────────────────

export class TemplatePreviewBodyDto {
  @IsString()
  template!: string;

  @IsIn(['json', 'yaml', 'xml', 'plaintext'])
  language!: 'json' | 'yaml' | 'xml' | 'plaintext';

  @IsObject()
  context!: {
    pathParams?: Record<string, string>;
    queryParams?: Record<string, string>;
    headers?: Record<string, string>;
    body?: string;
    parameterSets?: Record<string, Record<string, string>>;
  };
}

// ─── Spec Remap ────────────────────────────────────────────────────────────

export class RemapBodyDto {
  @IsString()
  targetPath!: string;

  @IsString()
  targetMethod!: string;
}

// ─── Response Workflow ─────────────────────────────────────────────────────

export class CreateResponseWorkflowBodyDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsArray()
  steps?: any[];

  @IsOptional()
  @IsArray()
  parameters?: any[];
}

export class UpdateResponseWorkflowBodyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  steps?: any[];

  @IsOptional()
  @IsArray()
  parameters?: any[];
}

// ─── Saved Condition ───────────────────────────────────────────────────────

export class CreateSavedConditionBodyDto {
  @IsString()
  name!: string;

  @IsObject()
  condition!: any;
}

export class UpdateSavedConditionBodyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsObject()
  condition?: any;
}

// ─── Data Store ────────────────────────────────────────────────────────────

export class CreateDataStoreBodyDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsObject()
  seedRecords?: Record<string, unknown>;
}

export class UpdateDataStoreBodyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsObject()
  seedRecords?: Record<string, unknown>;
}
