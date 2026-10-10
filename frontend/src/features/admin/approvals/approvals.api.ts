import type { ListQuery, Paginated } from '@/features/admin/common';
import { httpClient } from '@/services/api';

/**
 * Cliente de `/approvals` (PLAN-ADMIN, D12): sólo lectura. Los tipos reflejan
 * `backend/src/modules/approvals/dto/approval.dto.ts`.
 */

export const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export interface PersonRef {
  id: string;
  displayName: string;
}

export interface ApprovalSummary {
  id: string;
  code: string;
  title: string;
  resourceType: string;
  resourceId: string;
  status: ApprovalStatus;
  requestedBy: PersonRef;
  stepCount: number;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ApprovalStep {
  id: string;
  sequence: number;
  status: ApprovalStatus;
  approver: PersonRef | null;
  approverRole: { id: string; name: string } | null;
  comment: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ApprovalDetail extends ApprovalSummary {
  reason: string | null;
  payload: unknown;
  updatedAt: string;
  steps: ApprovalStep[];
}

const APPROVALS_PATH = '/approvals';

export function listApprovals(query: ListQuery): Promise<Paginated<ApprovalSummary>> {
  return httpClient.get<Paginated<ApprovalSummary>>(APPROVALS_PATH, { query });
}

export function getApproval(id: string): Promise<ApprovalDetail> {
  return httpClient.get<ApprovalDetail>(`${APPROVALS_PATH}/${encodeURIComponent(id)}`);
}
