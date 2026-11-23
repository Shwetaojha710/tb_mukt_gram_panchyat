export type NdLevel = 'state' | 'district' | 'block';
/** Top tabs: one Overview (level from filters) + Action Items */
export type NdView = 'overview' | 'actions';
export type NdActionType = 'pending-tests' | 'zero-case-pending' | 'poshan-pending';

/** Resolve dashboard level from geography filters (all roles). */
export function ndLevelFromFilters(f: Pick<NdFilters, 'districtId' | 'blockId'>): NdLevel {
  if (f.blockId) return 'block';
  if (f.districtId) return 'district';
  return 'state';
}

export interface NdFilters {
  fromYear: number;
  fromMonth: number;
  toYear: number;
  toMonth: number;
  districtId: number | null;
  blockId: number | null;
  gpId: number | null;
}

export interface NdPeriod {
  year: number;
  month: number;
}

export interface NdScope {
  districtId: number | null;
  districtName: string | null;
  blockId: number | null;
  blockName: string | null;
  gpId: number | null;
}

export interface NdSummary {
  level: NdLevel;
  period: { from: NdPeriod; to: NdPeriod };
  scope: NdScope;
  kpis: Record<string, number>;
  buckets: { bucket: string; count: number }[];
  awards: { award: string; count: number }[];
}

export interface NdDrilldown {
  level: NdLevel;
  period: { from: NdPeriod; to: NdPeriod };
  scope: NdScope;
  groupBy: 'district' | 'block' | 'gp';
  rows: any[];
}

export interface NdActionsPage {
  type: NdActionType;
  page: number;
  pageSize: number;
  total: number;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  rows: any[];
}

export interface NdApiResponse<T> {
  success: boolean;
  data: T;
}

export interface NdKpi {
  label: string;
  value: string;
  sub?: string;
  tone?: 'ok' | 'warn' | 'bad' | 'bronze' | 'silver' | 'gold';
}

export type NdCellType = 'text' | 'num' | 'pct' | 'yesno' | 'check' | 'bucket';

export interface NdColumn {
  key: string;
  label: string;
  type?: NdCellType;
  sortable?: boolean;
}

export interface NdTableQuery {
  page: number;
  pageSize: number;
  search: string;
  sortBy: string;
  sortDir: 'asc' | 'desc';
}

export const ND_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function ndFormat(n: number | string | null | undefined): string {
  return (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 1 });
}

/** Message + kind for the page-level error state. */
export function ndDescribeError(err: any): { kind: 'unauthorized' | 'forbidden' | 'network' | 'server'; message: string } {
  const status = Number(err?.status);
  if (status === 401) return { kind: 'unauthorized', message: 'Your session has expired. Please log in again.' };
  if (status === 403) {
    return { kind: 'forbidden', message: err?.error?.message || 'You do not have access to this view.' };
  }
  if (status === 0) {
    return { kind: 'network', message: 'Cannot reach the server. Check your connection and try again.' };
  }
  return { kind: 'server', message: err?.error?.message || 'Something went wrong while loading the dashboard.' };
}
