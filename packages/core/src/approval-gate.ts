import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { Action, ApprovalLevel, MurphConfig } from './types.js';
import { createLogger } from './logger.js';

const logger = createLogger('approval-gate');

export interface ApprovalRequest {
  id: string;
  action: Action;
  requestedAt: Date;
  resolvedAt?: Date;
  approved?: boolean;
  resolvedBy?: string;
}

export class ApprovalGate extends EventEmitter {
  private approvalDefaults: Record<string, ApprovalLevel>;
  private pendingApprovals = new Map<string, ApprovalRequest>();

  constructor(config: MurphConfig) {
    super();
    this.approvalDefaults = config.security.approval_defaults;
  }

  getLevel(actionName: string): ApprovalLevel {
    // Check exact match first
    if (this.approvalDefaults[actionName]) {
      return this.approvalDefaults[actionName];
    }

    // Check wildcard patterns (e.g., "bop.*")
    const parts = actionName.split('.');
    for (let i = parts.length - 1; i > 0; i--) {
      const pattern = parts.slice(0, i).join('.') + '.*';
      if (this.approvalDefaults[pattern]) {
        return this.approvalDefaults[pattern];
      }
    }

    // Default to require (strictest)
    return 'require';
  }

  async check(action: Action): Promise<{ approved: boolean; level: ApprovalLevel }> {
    const level = this.getLevel(action.name);
    action.approval = level;

    switch (level) {
      case 'auto':
        logger.debug({ action: action.name }, 'Auto-approved');
        return { approved: true, level };

      case 'notify':
        logger.info({ action: action.name }, 'Executing with notification');
        this.emit('notify', action);
        return { approved: true, level };

      case 'require': {
        logger.info({ action: action.name }, 'Awaiting manual approval');
        const request: ApprovalRequest = {
          id: randomUUID(),
          action,
          requestedAt: new Date(),
        };
        this.pendingApprovals.set(request.id, request);
        this.emit('approval-required', request);

        return new Promise((resolve) => {
          const timeout = setTimeout(() => {
            this.pendingApprovals.delete(request.id);
            logger.warn({ action: action.name }, 'Approval timed out');
            resolve({ approved: false, level });
          }, 5 * 60 * 1000); // 5 minute timeout

          this.once(`approval-${request.id}`, (approved: boolean, resolvedBy?: string) => {
            clearTimeout(timeout);
            request.resolvedAt = new Date();
            request.approved = approved;
            request.resolvedBy = resolvedBy;
            this.pendingApprovals.delete(request.id);
            resolve({ approved, level });
          });
        });
      }
    }
  }

  updateDefaults(defaults: Record<string, ApprovalLevel>): void {
    this.approvalDefaults = defaults;
  }

  resolve(requestId: string, approved: boolean, resolvedBy?: string): void {
    this.emit(`approval-${requestId}`, approved, resolvedBy);
  }

  getPending(): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values());
  }
}
