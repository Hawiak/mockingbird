import { Injectable } from '@nestjs/common';
import type { Statement, RequestContext } from '@mockingbird/shared-types';
import { ConditionService } from './condition.service';

@Injectable()
export class StatementMatcherService {
  constructor(private readonly conditionService: ConditionService) {}

  /**
   * Sorts enabled statements by priority ascending (lower number = higher priority).
   * Returns the first statement whose condition evaluates to true, or null for default.
   */
  match(statements: Statement[], ctx: RequestContext): Statement | null {
    const enabled = [...statements]
      .filter(s => s.enabled)
      .sort((a, b) => a.priority - b.priority);
    for (const stmt of enabled) {
      if (this.conditionService.evaluate(stmt.condition, ctx)) return stmt;
    }
    return null;
  }
}
