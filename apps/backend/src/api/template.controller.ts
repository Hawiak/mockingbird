import { Controller, Post, Body } from '@nestjs/common';
import type { TemplateContext, TemplatePreviewResponseDto } from '@mockingbird/shared-types';
import { TemplateService } from '../workflow/template.service';
import { TemplatePreviewBodyDto } from './dto';

@Controller('template')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Post('preview')
  preview(@Body() dto: TemplatePreviewBodyDto): TemplatePreviewResponseDto {
    const ctx: TemplateContext = {
      request: {
        method: 'GET',
        path: '/',
        pathParams: dto.context.pathParams ?? {},
        queryParams: dto.context.queryParams ?? {},
        headers: dto.context.headers ?? {},
        body: dto.context.body ?? '',
        callCount: 0,
      },
      parameterSets: dto.context.parameterSets ?? {},
    };

    const result = this.templateService.render(dto.template, ctx);

    return {
      rendered: result.output,
      unresolvedVariables: result.warnings.map(w =>
        w.replace('Unresolved variable: ', '').replace(/^\{\{|\}\}$/g, ''),
      ),
    };
  }
}
