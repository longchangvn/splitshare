import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Anchor, Box, Button, Table, Text } from '@mantine/core';
import { api, fmt } from '../api.js';
import { Err, useAuth } from '../auth.jsx';
import { BrandMark, Shell } from '../components/Shell.jsx';
import { displayNameOf, initialsOf, pastelFor } from '../components/Net.jsx';
import { MoneyDonut, PaidShareBars, chartColorsFor } from '../components/MoneyCharts.jsx';
import { SettlementBox } from '../components/SettlementBox.jsx';
import { useT } from '../prefs.jsx';

function netTone(cents) {
  if (cents === 0) return 'settled';
  return cents < 0 ? 'owe' : 'owed';
}

function netLabel(cents, currency, settledLabel) {
  if (cents === 0) return settledLabel || 'Settled';
  return fmt(cents, currency);
}

function formatDate(iso, withTime = false) {
  try {
    const d = new Date(iso);
    return withTime
      ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
      : d.toLocaleDateString(undefined, { dateStyle: 'medium' });
  } catch {
    return iso || '—';
  }
}

function kindLabel(kind, t) {
  if (kind === 'expense') return t('groupDetail.expense');
  if (kind === 'payment') return t('groupDetail.payment');
  return kind || '—';
}

function PrintPageHead({ title, hint }) {
  return (
    <div className="report-doc-section-head is-page">
      <div className="report-doc-sec-copy">
        <h2>{title}</h2>
        {hint ? <p>{hint}</p> : null}
      </div>
    </div>
  );
}

function ReportDecor() {
  return (
    <svg className="report-doc-decor" viewBox="0 0 160 120" aria-hidden>
      <rect x="78" y="18" width="70" height="86" rx="6" fill="#e7f5ef" stroke="#0f766e" strokeWidth="2.5" />
      <rect x="88" y="32" width="28" height="6" rx="2" fill="#0f766e" opacity="0.35" />
      <rect x="88" y="44" width="42" height="6" rx="2" fill="#0f766e" opacity="0.22" />
      <rect x="88" y="56" width="36" height="6" rx="2" fill="#0f766e" opacity="0.22" />
      <circle cx="128" cy="78" r="18" fill="#fff" stroke="#0f766e" strokeWidth="2.5" />
      <path d="M128 78 L128 64 A14 14 0 0 1 140 78 Z" fill="#3dde84" />
      <path d="M128 78 L140 78 A14 14 0 0 1 122 90 Z" fill="#0f766e" />
      <rect x="12" y="48" width="58" height="54" rx="8" fill="#0f766e" />
      <rect x="22" y="58" width="16" height="12" rx="2" fill="#3dde84" />
      <rect x="44" y="58" width="16" height="12" rx="2" fill="#e7f5ef" />
      <rect x="22" y="76" width="16" height="12" rx="2" fill="#e7f5ef" />
      <rect x="44" y="76" width="16" height="12" rx="2" fill="#3dde84" />
      <circle cx="42" cy="36" r="14" fill="#149a62" opacity="0.9" />
      <rect x="36" y="30" width="12" height="14" rx="2" fill="#fff" opacity="0.9" />
    </svg>
  );
}

function ReportPageHeader({ detail, pageNo, totalPages, t }) {
  return (
    <header className="report-doc-page-banner">
      <div className="report-doc-page-brand">
        <BrandMark size={16} />
        <span>{t('report.brand')}</span>
      </div>
      <div className="report-doc-page-context">
        <span className="report-doc-page-group">{detail.name}</span>
        <span className="report-doc-page-num">
          {t('report.pageOf', { current: pageNo, total: totalPages })}
        </span>
      </div>
    </header>
  );
}

/** Print-only group report — one sheet per major section, with page numbers. */
function ReportPrintDoc({
  detail,
  summary,
  plan,
  breakdown = [],
  ledgerItems,
  reporterName,
  generatedAt,
}) {
  const t = useT();
  const c = detail.currency;
  const members = detail.members || [];
  const rows = [...(summary || [])].sort((a, b) => a.display_name.localeCompare(b.display_name));
  const transfers = plan?.transfers || [];
  const settled = transfers.length === 0;
  const totalSpend = rows.reduce((a, m) => a + (m.total_paid_cents || 0), 0);
  const expenses = (ledgerItems || []).filter((item) => item.kind === 'expense');
  const statement = [...(ledgerItems || [])].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at),
  );
  const categoryRows = [...(breakdown || [])]
    .map((b) => {
      const cat = String(b.category || 'other').trim().toLowerCase() || 'other';
      const nameKey = `forms.expense.cat.${cat}`;
      const translated = t(nameKey);
      const name = translated === nameKey ? (b.category || t('forms.expense.cat.other')) : translated;
      return {
        key: cat,
        label: name,
        count: b.expense_count,
        value: b.paid_cents,
        paid_cents: b.paid_cents,
      };
    })
    .sort((a, b) => b.value - a.value);
  const categoryTotal = categoryRows.reduce((a, r) => a + r.value, 0);
  const categoryColors = chartColorsFor(categoryRows.map((row) => row.key), 'category');

  const sheets = [
    {
      id: 'cover',
      cover: true,
    },
    {
      id: 'overview',
      title: t('report.byCategory'),
      hint: t('report.byCategoryHint'),
      body: (
        <>
          {categoryRows.length === 0 ? (
            <p className="report-doc-empty">{t('report.noCategories')}</p>
          ) : (
            <div className="report-doc-category">
              <div className="report-doc-category-chart">
                <MoneyDonut
                  rows={categoryRows}
                  valueKey="paid_cents"
                  currency={c}
                  emptyLabel={t('report.noCategoriesYet')}
                  size={168}
                  hideLegend
                  colorMode="category"
                />
              </div>
              <table className="report-doc-table">
                <thead>
                  <tr>
                    <th>{t('common.category')}</th>
                    <th className="is-num">{t('report.amount')}</th>
                    <th className="is-num">%</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryRows.map((row) => {
                    const pct = categoryTotal > 0 ? Math.round((row.value / categoryTotal) * 100) : 0;
                    return (
                      <tr key={row.key}>
                        <td>
                          <span className="report-doc-cat-swatch" style={{ background: categoryColors.get(row.key) }} aria-hidden />
                          {row.label}
                          <span className="report-doc-cat-count">
                            {' '}
                            ({t(row.count === 1 ? 'report.catCountOne' : 'report.catCount', { count: row.count })})
                          </span>
                        </td>
                        <td className="is-num">{fmt(row.value, c)}</td>
                        <td className="is-num">{pct}%</td>
                      </tr>
                    );
                  })}
                  <tr className="is-total">
                    <td>{t('common.total')}</td>
                    <td className="is-num">{fmt(categoryTotal, c)}</td>
                    <td className="is-num">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      ),
    },
    {
      id: 'balance',
      title: t('report.balanceSheet'),
      hint: t('report.balanceSheetHint'),
      body: transfers.length === 0 ? (
        <p className="report-doc-empty">{settled ? t('report.allSettled') : t('report.emptyTransfers')}</p>
      ) : (
        <table className="report-doc-table">
          <thead>
            <tr>
              <th>#</th>
              <th>{t('report.from')}</th>
              <th>{t('report.to')}</th>
              <th className="is-num">{t('report.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((xfer, i) => (
              <tr key={`${xfer.from_user_id}-${xfer.to_user_id}-${i}`}>
                <td>{i + 1}</td>
                <td>{displayNameOf(members, xfer.from_user_id)}</td>
                <td>{displayNameOf(members, xfer.to_user_id)}</td>
                <td className="is-num">{fmt(xfer.amount_cents, c)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    },
    {
      id: 'cashflow',
      title: t('report.membersCashflow'),
      hint: t('report.membersCashflowHint'),
      body: (
        <>
          <table className="report-doc-table">
            <thead>
              <tr>
                <th>{t('report.member')}</th>
                <th className="is-num">{t('report.spentCol')}</th>
                <th className="is-num">{t('report.shareCol')}</th>
                <th>{t('report.status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.user_id}>
                  <td>{m.display_name}</td>
                  <td className="is-num">{fmt(m.total_paid_cents, c)}</td>
                  <td className="is-num">{fmt(m.total_share_cents, c)}</td>
                  <td className={`is-${netTone(m.net_cents)}`}>
                    {netLabel(m.net_cents, c, t('common.settled'))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ),
    },
    {
      id: 'statement',
      title: t('report.statementTitle'),
      hint: t('report.statementHint'),
      body: statement.length === 0 ? (
        <p className="report-doc-empty">{t('report.emptyStatement')}</p>
      ) : (
        <table className="report-doc-table">
          <thead>
            <tr>
              <th>{t('report.date')}</th>
              <th>{t('report.kind')}</th>
              <th>{t('report.event')}</th>
              <th className="is-num">{t('report.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {statement.map((item) => (
              <tr key={`${item.kind}-${item.id}`}>
                <td>{formatDate(item.created_at)}</td>
                <td>{kindLabel(item.kind, t)}</td>
                <td>{item.title}</td>
                <td className="is-num">{fmt(item.amount_cents, c)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    },
    {
      id: 'expenses',
      title: t('report.expensesTitle'),
      hint: t('report.expensesHint'),
      body: expenses.length === 0 ? (
        <p className="report-doc-empty">{t('report.emptyExpenses')}</p>
      ) : (
        <table className="report-doc-table">
          <thead>
            <tr>
              <th>{t('report.date')}</th>
              <th>{t('report.event')}</th>
              <th>{t('common.category')}</th>
              <th>{t('report.payer')}</th>
              <th className="is-num">{t('report.amount')}</th>
              <th>{t('report.status')}</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((item) => {
              const cat = item.category
                ? t(`forms.expense.cat.${item.category}`)
                : '—';
              return (
                <tr key={item.id}>
                  <td>{formatDate(item.created_at)}</td>
                  <td>{item.title}</td>
                  <td>{cat === `forms.expense.cat.${item.category}` ? item.category : cat}</td>
                  <td>{item.payer_name || displayNameOf(members, item.payer_id)}</td>
                  <td className="is-num">{fmt(item.amount_cents, c)}</td>
                  <td>
                    {item.status === 'LOCKED'
                      ? t('groupDetail.statusLocked')
                      : item.status === 'OPEN'
                        ? t('groupDetail.statusOpen')
                        : (item.status || '—')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ),
    },
  ];
  const totalPages = sheets.length;
  const memberCount = members.length;
  const transferCount = transfers.length;

  const topCats = categoryRows.slice(0, 3);
  const avgPaid = memberCount > 0 ? Math.round(totalSpend / memberCount) : 0;

  const coverHeader = (
    <div className={`report-cover report-cover-bento is-${settled ? 'settled' : 'open'}`}>
      <header className="report-cover-top report-cover-bento-card is-identity">
        <div className="report-cover-top-copy">
          <div className="report-cover-brand">
            <BrandMark size={14} />
            <p className="report-cover-kicker">{t('report.brand')}</p>
          </div>
          <h1 className="report-cover-title">{t('report.tripReport')}</h1>
          <p className="report-cover-group">{detail.name}</p>
          <div className="report-cover-meta">
            <span className="report-cover-meta-item">
              <span className="report-cover-meta-label">{t('report.createdOn')}</span>
              <span className="report-cover-meta-value">{formatDate(generatedAt, true)}</span>
            </span>
            <span className="report-cover-meta-dot" aria-hidden>·</span>
            <span className="report-cover-meta-item">
              <span className="report-cover-meta-label">{t('report.currency')}</span>
              <span className="report-cover-meta-value">{c}</span>
            </span>
            {plan?.version != null && (
              <>
                <span className="report-cover-meta-dot" aria-hidden>·</span>
                <span className="report-cover-meta-item">
                  <span className="report-cover-meta-label">{t('report.settlement')}</span>
                  <span className="report-cover-meta-value">
                    {t('report.settlementVer', { version: plan.version })}
                  </span>
                </span>
              </>
            )}
          </div>
          <div className="report-cover-status">
            <span className={`report-doc-pill is-${settled ? 'settled' : 'open'}`}>
              {settled ? t('report.statusSettled') : t('report.statusOpen')}
            </span>
          </div>
        </div>
        <ReportDecor />
      </header>

      <section className="report-doc-block is-metrics report-cover-bento-card is-metrics-card">
        <h2 className="report-doc-block-title">{t('report.keyMetrics')}</h2>
        <table className="report-doc-table is-metrics">
          <thead>
            <tr>
              <th>{t('report.metric')}</th>
              <th className="is-num">{t('report.value')}</th>
              <th>{t('report.note')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{t('report.totalSpend')}</td>
              <td className="is-num">{fmt(totalSpend, c)}</td>
              <td><span className="report-doc-chip is-ok">{t('report.coverSpendHint')}</span></td>
            </tr>
            <tr>
              <td>{t('report.coverMembers')}</td>
              <td className="is-num">{memberCount}</td>
              <td>
                <span className="report-doc-chip">
                  {t(memberCount === 1 ? 'report.coverMembersHintOne' : 'report.coverMembersHint', { count: memberCount })}
                </span>
              </td>
            </tr>
            <tr>
              <td>{t('report.expenses')}</td>
              <td className="is-num">{expenses.length}</td>
              <td>
                <span className="report-doc-chip">
                  {t('report.avgPerMember', { amount: fmt(avgPaid, c) })}
                </span>
              </td>
            </tr>
            <tr>
              <td>{t('report.settlement')}</td>
              <td className="is-num">{transferCount}</td>
              <td>
                <span className={`report-doc-chip ${settled ? 'is-ok' : 'is-warn'}`}>
                  {settled
                    ? t('report.coverTransfersClear')
                    : t(transferCount === 1 ? 'report.coverTransfersOne' : 'report.coverTransfers', { count: transferCount })}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <div className="report-doc-split report-cover-bento-pair">
        <section className="report-doc-block report-cover-bento-card">
          <h2 className="report-doc-block-title">{t('report.keyHighlights')}</h2>
          {topCats.length === 0 ? (
            <p className="report-doc-empty">{t('report.noCategories')}</p>
          ) : (
            <div className="report-doc-highlights">
              {topCats.map((row) => {
                const pct = categoryTotal > 0 ? Math.round((row.value / categoryTotal) * 100) : 0;
                return (
                  <div key={row.key} className="report-doc-highlight">
                    <div className="report-doc-ring" style={{ '--pct': pct, '--ring-color': categoryColors.get(row.key) }}>
                      <span className="report-doc-ring-hole"><b>{pct}%</b></span>
                    </div>
                    <p className="report-doc-highlight-label">
                      <strong>{row.label}</strong>
                      <span>{fmt(row.value, c)}</span>
                    </p>
                  </div>
                );
              })}
            </div>
          )}
          <p className="report-cover-lead">
            {settled ? t('report.coverLeadSettled') : t('report.coverLeadOpen', { count: transferCount })}
          </p>
        </section>

        <section className="report-doc-block report-cover-bento-card">
          <h2 className="report-doc-block-title">{t('report.settlement')}</h2>
          {transfers.length === 0 ? (
            <div className="report-doc-settle-empty">
              <span aria-hidden>✓</span>
              <p>{t('report.allSettled')}</p>
            </div>
          ) : (
            <ul className="report-doc-challenge-list">
              {transfers.slice(0, 5).map((xfer, i) => (
                <li key={`${xfer.from_user_id}-${xfer.to_user_id}-${i}`}>
                  <span className="report-doc-challenge-icon" aria-hidden>{i + 1}</span>
                  <p>
                    <strong>{displayNameOf(members, xfer.from_user_id)}</strong>
                    {' → '}
                    <strong>{displayNameOf(members, xfer.to_user_id)}</strong>
                    {': '}
                    {fmt(xfer.amount_cents, c)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="report-doc-meta-line">
            {t('report.reporter')}: {reporterName || '—'} · {t('report.createdOn')}: {formatDate(generatedAt, true)}
          </p>
        </section>
      </div>
    </div>
  );

  return (
    <article className="report-doc only-print" id="group-report-print" aria-label={t('report.tripReport')}>
      {sheets.map((sheet, i) => {
        const pageNo = i + 1;
        const isCover = !!sheet.cover;
        return (
          <section
            key={sheet.id}
            className={`report-doc-sheet${i > 0 ? ' report-doc-page' : ''}${isCover ? ' is-cover' : ''}`}
          >
            <ReportPageHeader detail={detail} pageNo={pageNo} totalPages={totalPages} t={t} />
            {isCover ? (
              coverHeader
            ) : (
              <>
                <PrintPageHead title={sheet.title} hint={sheet.hint} />
                <div className="report-doc-sheet-body">{sheet.body}</div>
              </>
            )}
          </section>
        );
      })}
    </article>
  );
}

// Printable trip summary: totals, per-person, settlement, categories.
export function ReportPanel({
  groupId,
  detail: detailProp = null,
  summary: summaryProp = null,
  plan: planProp = null,
  embedded = false,
  onPay = null,
  categoryManager = null,
}) {
  const { user } = useAuth();
  const [detail, setDetail] = useState(detailProp);
  const [summary, setSummary] = useState(summaryProp);
  const [plan, setPlan] = useState(planProp);
  const [breakdown, setBreakdown] = useState([]);
  const [ledgerItems, setLedgerItems] = useState([]);
  const [generatedAt] = useState(() => new Date().toISOString());
  const t = useT();
  const [e, setE] = useState(null);

  useEffect(() => { setDetail(detailProp); }, [detailProp]);
  useEffect(() => { setSummary(summaryProp); }, [summaryProp]);
  useEffect(() => { setPlan(planProp); }, [planProp]);

  useEffect(() => {
    if (!groupId) return;
    let cancel = false;
    const needDetail = !detailProp;
    const needSummary = !summaryProp;
    Promise.all([
      needDetail ? api.get(`/api/v1/groups/${groupId}`) : Promise.resolve(detailProp),
      needSummary ? api.get(`/api/v1/groups/${groupId}/summary`) : Promise.resolve(summaryProp),
      planProp ? Promise.resolve(planProp) : api.get(`/api/v1/groups/${groupId}/settlement`).catch(() => null),
      api.get(`/api/v1/groups/${groupId}/breakdown`).catch(() => []),
      api.get(`/api/v1/groups/${groupId}/ledger?limit=100&sort=created_at`).catch(() => ({ items: [] })),
    ]).then(([d, s, p, b, ledger]) => {
      if (cancel) return;
      setDetail(d);
      setSummary(s);
      setPlan(p);
      setBreakdown(b || []);
      setLedgerItems(ledger?.items || []);
      setE(null);
    }).catch((err) => { if (!cancel) setE(err); });
    return () => { cancel = true; };
  }, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!detail) return <Text size="sm" c="dimmed">{t('common.loading')}<Err e={e} /></Text>;

  const c = detail.currency;
  const members = detail.members || [];
  const rows = summary || [];
  const totalPaid = rows.reduce((a, m) => a + m.total_paid_cents, 0);
  const totalShare = rows.reduce((a, m) => a + m.total_share_cents, 0);
  const paidRows = [...rows].sort((a, b) => b.total_paid_cents - a.total_paid_cents)
    .map((m) => ({ key: m.user_id, label: m.display_name, value: m.total_paid_cents, total_paid_cents: m.total_paid_cents }));
  const shareRows = [...rows].sort((a, b) => b.total_share_cents - a.total_share_cents)
    .map((m) => ({ key: m.user_id, label: m.display_name, value: m.total_share_cents, total_share_cents: m.total_share_cents }));
  const categoryRows = [...breakdown]
    .map((b) => {
      const cat = String(b.category || 'other').trim().toLowerCase() || 'other';
      const nameKey = `forms.expense.cat.${cat}`;
      const translated = t(nameKey);
      const name = translated === nameKey ? (b.category || t('forms.expense.cat.other')) : translated;
      return {
        key: cat,
        label: name,
        count: b.expense_count,
        value: b.paid_cents,
        paid_cents: b.paid_cents,
      };
    })
    .sort((a, b) => b.value - a.value);
  const categoryTotal = breakdown.reduce((a, b) => a + b.paid_cents, 0);
  const categoryColors = chartColorsFor(categoryRows.map((row) => row.key), 'category');
  const reporterName = user?.display_name || user?.username || '';

  const runPrint = () => {
    const prev = document.title;
    document.title = t('report.docTitle', { name: detail.name });
    window.print();
    document.title = prev;
  };

  return (
    <div id="group-report" className="report-panel">
      <div className="report-screen no-print">
        <div className="report-panel-head">
          <div>
            <Text className="report-panel-kicker">{t('report.title')}</Text>
            {!embedded && <Text size="sm" fw={600}>{detail.name}</Text>}
          </div>
          {!embedded && (
            <Button size="xs" variant="light" radius="xl" onClick={runPrint}>
              {t('report.print')}
            </Button>
          )}
        </div>
        <Err e={e} />

        <div className={`report-metrics${detail.budget ? ' has-budget' : ''}`}>
          <SettlementBox
            groupId={groupId}
            currency={c}
            members={members}
            plan={plan}
            onPay={onPay}
          />
          <div className="report-metric">
            <span className="report-metric-label">{t('report.totalPaid')}</span>
            <span className="report-metric-value">{fmt(totalPaid, c)}</span>
          </div>
          <div className="report-metric">
            <span className="report-metric-label">{t('report.totalShare')}</span>
            <span className="report-metric-value">{fmt(totalShare, c)}</span>
          </div>
          <div className="report-metric is-members">
            <span className="report-metric-label">{t('common.members')}</span>
            <span className="report-metric-value">{members.length}</span>
            <span className="report-metric-sub">{detail.mode || 'shared'} · {c}</span>
          </div>
          {detail.budget && (
            <div className={`report-metric${detail.budget.over ? ' is-alert' : ''}`}>
              <span className="report-metric-label">{t('report.budget')}</span>
              <span className="report-metric-value">{detail.budget.pct}%</span>
              <span className="report-metric-sub">
                {fmt(detail.budget.spent_cents, c)} / {fmt(detail.budget.budget_cents, c)}
              </span>
            </div>
          )}
        </div>

        {(plan?.transfers || []).length > 0 && (
          <section className="report-card">
          <div className="report-settle-head">
            <h3 className="report-card-title">{t('report.settlement')}</h3>
            {(plan?.transfers || []).length > 0 && (
              <span className="report-settle-count">
                {t(
                  plan.transfers.length === 1 ? 'report.transferCountOne' : 'report.transferCount',
                  { count: plan.transfers.length },
                )}
              </span>
            )}
          </div>
          {(plan?.transfers || []).length === 0 ? (
            <div className="report-settle-empty">
              <span className="report-settle-empty-icon" aria-hidden>✓</span>
              <Text size="sm">{t('report.allSettled')}</Text>
            </div>
          ) : (
            <ul className="report-settle-list">
              {(plan?.transfers || []).map((xfer, i) => (
                <li key={i} className="report-settle-row">
                  <span className="report-settle-step" aria-hidden>{i + 1}</span>
                  <div className="report-settle-people">
                    <span className="report-settle-name">{displayNameOf(members, xfer.from_user_id)}</span>
                    <span className="report-settle-arrow" aria-hidden>→</span>
                    <span className="report-settle-name">{displayNameOf(members, xfer.to_user_id)}</span>
                  </div>
                  <span className="report-settle-amt">{fmt(xfer.amount_cents, c)}</span>
                  {onPay && (
                    <Button
                      size="compact-xs"
                      variant="light"
                      color="teal"
                      className="report-settle-pay"
                      onClick={() => onPay(xfer)}
                    >
                      {t('groupDetail.pay')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Text size="xs" c="dimmed" mt="sm" className="report-settle-meta">
            {t('report.generated', { when: new Date().toLocaleString() })}
          </Text>
          </section>
        )}

        <div className="report-charts-row">
          <section className="report-card">
            <h3 className="report-card-title">{t('report.paidVsShare')}</h3>
            <PaidShareBars summary={rows} currency={c} />
          </section>
          <section className="report-card">
            <h3 className="report-card-title">{t('report.whoPaid')}</h3>
            <MoneyDonut rows={paidRows} valueKey="total_paid_cents" currency={c} emptyLabel={t('report.noPayments')} colorMode="member" />
          </section>
          <section className="report-card">
            <h3 className="report-card-title">{t('report.whoOwesShare')}</h3>
            <MoneyDonut rows={shareRows} valueKey="total_share_cents" currency={c} emptyLabel={t('report.noShares')} colorMode="member" />
          </section>
        </div>

        <section className="report-card">
          <h3 className="report-card-title">{t('report.perPerson')}</h3>
          <Box hiddenFrom="sm">
            <div className="report-person-list">
              {rows.map((m) => {
                const tone = netTone(m.net_cents);
                const pastel = pastelFor(m.display_name);
                return (
                  <div key={m.user_id} className="report-person">
                    <div className="report-person-main">
                      <div className="report-member">
                        <span
                          className="report-person-avatar"
                          style={{ '--rp-from': pastel.from, '--rp-to': pastel.to }}
                          aria-hidden
                        >
                          {initialsOf(m.display_name)}
                        </span>
                        <div className="report-person-body">
                          <span className="report-member-name">{m.display_name}</span>
                          <div className="report-person-meta">
                            <span>{t('report.paid')} <b>{fmt(m.total_paid_cents, c)}</b></span>
                            <span>{t('report.share')} <b>{fmt(m.total_share_cents, c)}</b></span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <span className={`report-net is-${tone}`}>{netLabel(m.net_cents, c, t('common.settled'))}</span>
                  </div>
                );
              })}
            </div>
          </Box>
          <Box visibleFrom="sm">
            <Table className="report-table" withTableBorder={false} withColumnBorders={false} withRowBorders={false} horizontalSpacing="md" verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('report.member')}</Table.Th>
                  <Table.Th>{t('report.paid')}</Table.Th>
                  <Table.Th>{t('report.share')}</Table.Th>
                  <Table.Th>{t('report.net')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((m) => {
                  const tone = netTone(m.net_cents);
                  const pastel = pastelFor(m.display_name);
                  return (
                    <Table.Tr key={m.user_id}>
                      <Table.Td>
                        <div className="report-member">
                          <span
                            className="report-person-avatar is-table"
                            style={{ '--rp-from': pastel.from, '--rp-to': pastel.to }}
                            aria-hidden
                          >
                            {initialsOf(m.display_name)}
                          </span>
                          <span className="report-member-name">{m.display_name}</span>
                        </div>
                      </Table.Td>
                      <Table.Td className="report-td-num">{fmt(m.total_paid_cents, c)}</Table.Td>
                      <Table.Td className="report-td-num">{fmt(m.total_share_cents, c)}</Table.Td>
                      <Table.Td>
                        <span className={`report-net is-${tone}`}>{netLabel(m.net_cents, c, t('common.settled'))}</span>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Box>
        </section>

        <section className="report-card">
          <h3 className="report-card-title">{t('report.byCategory')}</h3>
          {categoryRows.length > 0 ? (
            <div className="report-category">
              <div className="report-category-chart">
                <MoneyDonut
                  rows={categoryRows}
                  valueKey="paid_cents"
                  currency={c}
                  emptyLabel={t('report.noCategoriesYet')}
                  hideLegend
                  size={180}
                  colorMode="category"
                />
              </div>
              <div className="report-cat-panel" role="list">
                {categoryRows.map((row) => {
                  const pct = categoryTotal > 0 ? Math.round((row.value / categoryTotal) * 100) : 0;
                  return (
                    <div key={row.key} className="report-cat-row" role="listitem">
                      <span className="report-cat-swatch" style={{ background: categoryColors.get(row.key) }} aria-hidden />
                      <div className="report-cat-copy">
                        <div className="report-cat-head">
                          <span className="report-cat-name">{row.label}</span>
                          <span className="report-cat-count">
                            {t(row.count === 1 ? 'report.catCountOne' : 'report.catCount', { count: row.count })}
                          </span>
                        </div>
                        <div className="report-cat-track" aria-hidden>
                          <span className="report-cat-fill" style={{ width: `${pct}%`, background: categoryColors.get(row.key) }} />
                        </div>
                      </div>
                      <div className="report-cat-nums">
                        <span className="report-cat-amount">{fmt(row.value, c)}</span>
                        <span className="report-cat-pct">{pct}%</span>
                      </div>
                    </div>
                  );
                })}
                <div className="report-cat-row is-total" role="listitem">
                  <span className="report-cat-swatch is-total" aria-hidden />
                  <div className="report-cat-copy">
                    <span className="report-cat-name">{t('common.total')}</span>
                  </div>
                  <div className="report-cat-nums">
                    <span className="report-cat-amount">{fmt(categoryTotal, c)}</span>
                    <span className="report-cat-pct">100%</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <Text size="sm" c="dimmed">{t('report.noCategories')}</Text>
          )}
        </section>
        <ReportCategoryManagerSlot categoryManager={categoryManager} />
      </div>

      <ReportPrintDoc
        detail={detail}
        summary={rows}
        plan={plan}
        breakdown={breakdown}
        ledgerItems={ledgerItems}
        reporterName={reporterName}
        generatedAt={generatedAt}
      />
    </div>
  );
}

export function ReportCategoryManagerSlot({ categoryManager }) {
  return categoryManager;
}

export function Report() {
  const t = useT();
  const { id } = useParams();
  return (
    <Shell>
      <Anchor component={Link} to={`/groups/${id}`} size="sm" className="no-print">{t('common.backToGroup')}</Anchor>
      <Box mt="md">
        <ReportPanel groupId={id} />
      </Box>
    </Shell>
  );
}
