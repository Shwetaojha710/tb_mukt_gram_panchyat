import * as XLSX from 'xlsx';
import { firstValueFrom } from 'rxjs';
import { NewDashboardService } from './new-dashboard.service';
import { NdActionType, NdDrilldown, NdFilters, NdLevel, NdSummary } from './new-dashboard.models';

function sheetFromAoA(rows: unknown[][]) {
  return XLSX.utils.aoa_to_sheet(rows);
}

async function fetchAllActions(
  api: NewDashboardService,
  type: NdActionType,
  filters: NdFilters
): Promise<any[]> {
  const pageSize = 100;
  let page = 1;
  let total = Infinity;
  const rows: any[] = [];
  while (rows.length < total) {
    const res = await firstValueFrom(
      api.actions(type, filters, {
        page,
        pageSize,
        search: '',
        sortBy: type === 'poshan-pending' ? 'poshanPending' : 'testsPending',
        sortDir: 'desc',
      })
    );
    const data = res.data;
    total = Number(data?.total) || 0;
    const batch = data?.rows || [];
    rows.push(...batch);
    if (!batch.length) break;
    page += 1;
    if (page > 500) break;
  }
  return rows;
}

/** Build Excel from existing summary/drilldown/actions APIs (no /export needed). */
export async function buildNewDashboardWorkbook(
  api: NewDashboardService,
  level: NdLevel,
  filters: NdFilters,
  cached?: { summary: NdSummary | null; drilldown: NdDrilldown | null }
): Promise<Blob> {
  const [summaryRes, drillRes, pending, zeroCase, poshan] = await Promise.all([
    cached?.summary
      ? Promise.resolve({ data: cached.summary })
      : firstValueFrom(api.summary(level, filters)),
    cached?.drilldown
      ? Promise.resolve({ data: cached.drilldown })
      : firstValueFrom(api.drilldown(level, filters)),
    fetchAllActions(api, 'pending-tests', filters),
    fetchAllActions(api, 'zero-case-pending', filters),
    fetchAllActions(api, 'poshan-pending', filters),
  ]);

  const summary = (summaryRes as any).data as NdSummary;
  const drilldown = (drillRes as any).data as NdDrilldown;
  const k = summary?.kpis || {};
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromAoA([
      ['Metric', 'Value'],
      ['Level', summary?.level],
      ['From', `${summary?.period?.from?.year}-${summary?.period?.from?.month}`],
      ['To', `${summary?.period?.to?.year}-${summary?.period?.to?.month}`],
      ['District', summary?.scope?.districtName || 'All'],
      ['Block', summary?.scope?.blockName || 'All'],
      ['Total Districts', k['totalDistricts']],
      ['Total Blocks', k['totalBlocks']],
      ['Total GPs', k['totalGps']],
      ['Reporting GPs', k['reportingGps']],
      ['Eligible GPs', k['eligibleGps']],
      ['Qualified GPs', k['qualifiedGps']],
      ['Gold GPs', k['goldGps']],
      ['Silver GPs', k['silverGps']],
      ['Bronze GPs', k['bronzeGps']],
      ['Pending Above 50', k['pendingAbove50']],
      ['Zero-case GPs', k['zeroCaseGps']],
      ['Zero-case but tests pending', k['zeroCasePendingGps']],
      ['Poshan pending GPs', k['poshanPendingGps']],
      ...((summary?.buckets || []).map((b) => [`Tests pending · ${b.bucket}`, b.count])),
      ...((summary?.awards || []).map((a) => [`Award · ${a.award}`, a.count])),
    ]),
    'Summary'
  );

  if (drilldown?.groupBy === 'gp') {
    XLSX.utils.book_append_sheet(
      wb,
      sheetFromAoA([
        [
          'GP Name',
          'Population',
          'Eligible',
          'Qualified',
          'Award',
          'Tests Pending',
          'Bucket',
          '0-Case',
          '0-Case + Pending',
          'Consented',
          'Poshan Pending',
        ],
        ...(drilldown.rows || []).map((r) => [
          r.name,
          r.population,
          Number(r.eligible) ? 'Yes' : 'No',
          Number(r.qualified) ? 'Yes' : 'No',
          r.award || '',
          r.testsPending,
          r.bucket,
          Number(r.zeroCase) ? 'Yes' : 'No',
          Number(r.zeroCasePending) ? 'Yes' : 'No',
          r.consented,
          r.poshanPending,
        ]),
      ]),
      'GP Drilldown'
    );
  } else {
    const nameLabel = drilldown?.groupBy === 'district' ? 'District' : 'Block';
    XLSX.utils.book_append_sheet(
      wb,
      sheetFromAoA([
        [
          nameLabel,
          'Total Blocks',
          'Total GPs',
          'Reporting GPs',
          'Eligible GPs',
          'Qualified GPs',
          '% Qualified',
          'Gold',
          'Silver',
          'Bronze',
          'Pending Above 50',
          '0-Case GPs',
          '0-Case + Pending',
          'Consented',
          'Poshan Pending',
        ],
        ...(drilldown?.rows || []).map((r) => [
          r.name,
          r.totalBlocks ?? '',
          r.totalGps,
          r.reportingGps,
          r.eligibleGps,
          r.qualifiedGps,
          r.qualifiedPct,
          r.goldGps,
          r.silverGps,
          r.bronzeGps,
          r.pendingAbove50,
          r.zeroCaseGps,
          r.zeroCasePendingGps,
          r.consented,
          r.poshanPending,
        ]),
      ]),
      `${nameLabel} Drilldown`.slice(0, 31)
    );
  }

  const actionHeaders = [
    'GP Name',
    'Block',
    'District',
    'Population',
    'Tests',
    'Cases',
    'Tests Pending',
    'Bucket',
    'Consented',
    'Poshan Pending',
  ];
  const mapAction = (r: any) => [
    r.gpName,
    r.blockName,
    r.districtName,
    r.population,
    r.tests,
    r.cases,
    r.testsPending,
    r.bucket,
    r.consented,
    r.poshanPending,
  ];

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromAoA([actionHeaders, ...pending.map(mapAction)]),
    'Pending Tests'
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromAoA([actionHeaders, ...zeroCase.map(mapAction)]),
    'Zero Case Pending'
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromAoA([actionHeaders, ...poshan.map(mapAction)]),
    'Poshan Pending'
  );

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
