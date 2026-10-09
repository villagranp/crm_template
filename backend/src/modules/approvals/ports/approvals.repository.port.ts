import type { Page, PageRequest } from '@/infrastructure/database/ports/pagination';

export const APPROVALS_REPOSITORY = Symbol('APPROVALS_REPOSITORY');

export const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_SORTABLE_FIELDS = ['createdAt', 'code', 'title', 'status'] as const;
export type ApprovalSortField = (typeof APPROVAL_SORTABLE_FIELDS)[number];

export interface PersonRef {
  id: string;
  displayName: string;
}

export interface RoleRef {
  id: string;
  name: string;
}

export interface ApprovalSummaryRecord {
  id: string;
  code: string;
  title: string;
  resourceType: string;
  resourceId: string;
  status: ApprovalStatus;
  requestedBy: PersonRef;
  stepCount: number;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface ApprovalStepRecord {
  id: string;
  sequence: number;
  status: ApprovalStatus;
  approver: PersonRef | null;
  approverRole: RoleRef | null;
  comment: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface ApprovalDetailRecord extends ApprovalSummaryRecord {
  reason: string | null;
  payload: unknown;
  updatedAt: Date;
  steps: ApprovalStepRecord[];
}

export interface ApprovalListFilter {
  status?: ApprovalStatus;
  /** Contenido en código o título. */
  search?: string;
}

export interface ApprovalPageRequest extends PageRequest {
  sortBy: ApprovalSortField;
  sortOrder: 'asc' | 'desc';
}

/** Puerto de lectura de aprobaciones (PLAN-ADMIN, D12). Sin escritura: ver `ApprovalsController`. */
export interface ApprovalsRepository {
  list(filter: ApprovalListFilter, page: ApprovalPageRequest): Promise<Page<ApprovalSummaryRecord>>;
  findById(id: string): Promise<ApprovalDetailRecord | null>;
}
