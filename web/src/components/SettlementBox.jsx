import { useEffect, useState } from 'react';
import {
  ActionIcon, Alert, Button, Group, Modal, Select, Skeleton, Spoiler, Stack, Text,
} from '@mantine/core';
import { api, fmt } from '../api.js';
import { Err } from '../auth.jsx';
import { displayNameOf } from './Net.jsx';
import { useT } from '../prefs.jsx';

function InfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 11v5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="8" r="1.1" fill="currentColor" />
    </svg>
  );
}

function StatusGlyph({ settled }) {
  if (settled) {
    return (
      <span className="report-status-glyph is-settled" aria-hidden>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
          <path d="M7.5 12.5 10.5 15.5 16.5 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  return (
    <span className="report-status-glyph is-open" aria-hidden>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 7.5v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="16.5" r="1.15" fill="currentColor" />
      </svg>
    </span>
  );
}

function formatWhen(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

/** Status card + detail dialog — first card of the Report section. */
export function SettlementBox({ groupId, currency, members, onPay, plan: planProp = null, settleTick = 0 }) {
  const t = useT();
  const [plan, setPlan] = useState(planProp);
  const [hist, setHist] = useState([]);
  const [viewV, setViewV] = useState(null);
  const [payments, setPayments] = useState([]);
  const [open, setOpen] = useState(false);
  const [e, setE] = useState(null);

  const load = () => api.get(`/api/v1/groups/${groupId}/settlement`)
    .then((p) => { setPlan(p); setViewV(null); setE(null); })
    .catch(setE);

  useEffect(() => {
    if (planProp) { setPlan(planProp); return; }
    load();
  }, [groupId, planProp, settleTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Completed-payments list in the detail dialog — re-fetch after each
  // recorded payment (settleTick) so it never shows a stale list.
  useEffect(() => {
    api.get(`/api/v1/groups/${groupId}/ledger?type=payment&limit=100`)
      .then((r) => setPayments(r.items || [])).catch(() => {});
  }, [groupId, settleTick]);

  const loadHist = async () => {
    try { setHist(await api.get(`/api/v1/groups/${groupId}/settlement/history`)); }
    catch (err) { setE(err); }
  };

  if (!plan && !e) {
    return <Skeleton height={96} radius="lg" className="report-metric report-status-card" />;
  }

  const view = viewV ? hist.find((h) => h.version === viewV) : plan;
  const ex = view?.explanation || {};
  const transfers = view?.transfers || [];
  const historical = viewV !== null;
  const settled = transfers.length === 0;
  const tone = settled ? 'settled' : 'open';

  const statusTitle = settled
    ? t('settlement.statusSettled')
    : t('settlement.statusOpen');
  const subtitle = settled
    ? t('settlement.statusSettledHint')
    : t('settlement.statusOpenHint', {
      n: transfers.length,
      saved: ex.saved ?? '—',
    });

  const netEntries = Object.entries(ex.before_nets || {});
  const balanceRows = netEntries.length > 0
    ? netEntries.map(([uid, cents]) => ({
      id: uid,
      name: displayNameOf(members, uid),
      cents,
    }))
    : (members || []).map((m) => ({
      id: m.user_id,
      name: m.display_name,
      cents: 0,
    }));

  return (
    <>
      <section
        className={`report-metric report-status-card is-${tone} is-clickable`}
        role="button"
        tabIndex={0}
        aria-label={`${statusTitle}. ${subtitle}. ${t('settlement.viewDetails')}`}
        title={t('settlement.viewDetails')}
        onClick={() => setOpen(true)}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            setOpen(true);
          }
        }}
      >
        <div className="report-status-row">
          <StatusGlyph settled={settled} />
          <div className="report-status-copy">
            <span className="report-status-title">{statusTitle}</span>
            <p className="report-status-sub">{subtitle}</p>
          </div>
          <ActionIcon
            component="span"
            className="report-status-info"
            variant="subtle"
            radius="xl"
            size="md"
            aria-hidden
          >
            <InfoIcon />
          </ActionIcon>
        </div>
      </section>

      <Modal
        opened={open}
        onClose={() => setOpen(false)}
        title={<span className="wizard-title-name">{t('settlement.detailTitle')}</span>}
        centered
        size="lg"
        classNames={{
          content: 'wizard-modal-content settle-modal',
          header: 'wizard-modal-header',
          body: 'wizard-modal-body settle-modal-body',
        }}
      >
        {!view ? (
          <Err e={e} />
        ) : (
          <div className="settle-detail">
            {historical && (
              <Alert color="yellow" variant="light" mb="sm">
                {t('settlement.historical', { version: viewV })}
              </Alert>
            )}

            <div className={`settle-hero is-${tone}`}>
              <StatusGlyph settled={settled} />
              <div className="settle-hero-copy">
                <span className={`net-chip is-${settled ? 'settled' : 'owe'}`}>
                  {settled ? t('net.settledUp') : t('settlement.needsAction')}
                </span>
                <p className="settle-hero-sub">{subtitle}</p>
              </div>
            </div>

            <section className="settle-block">
              <h4 className="settle-block-title">{t('settlement.netBalances')}</h4>
              {balanceRows.length === 0 ? (
                <p className="settle-empty">{t('settlement.noNets')}</p>
              ) : (
                <ul className="settle-balance-list">
                  {balanceRows.map((row) => {
                    const toneNet = row.cents === 0 ? 'settled' : row.cents < 0 ? 'owe' : 'owed';
                    return (
                      <li key={row.id} className="settle-balance-row">
                        <span className="settle-balance-name">{row.name}</span>
                        <span className={`settle-balance-amt is-${toneNet}`}>
                          {row.cents === 0 ? t('common.settled') : fmt(row.cents, currency)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="settle-block">
              <h4 className="settle-block-title">{t('settlement.finalTransfers')}</h4>
              {transfers.length === 0 ? (
                <p className="settle-empty">{t('settlement.allSettledHint')}</p>
              ) : (
                <ul className="settle-xfer-list">
                  {transfers.map((xfer, i) => (
                    <li key={i} className="settle-xfer-row">
                      <div className="settle-xfer-main">
                        <span className="settle-xfer-people">
                          {displayNameOf(members, xfer.from_user_id)}
                          <span className="settle-xfer-arrow" aria-hidden>→</span>
                          {displayNameOf(members, xfer.to_user_id)}
                        </span>
                        <span className="settle-xfer-amt">{fmt(xfer.amount_cents, currency)}</span>
                      </div>
                      {!historical && onPay && (
                        <Button
                          size="compact-xs"
                          variant="filled"
                          color="teal"
                          className="settle-xfer-pay"
                          onClick={() => { onPay(xfer); setOpen(false); }}
                        >
                          {t('groupDetail.pay')}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="settle-block">
              <h4 className="settle-block-title">
                {t('settlement.completed', { count: payments.length })}
              </h4>
              {payments.length === 0 ? (
                <p className="settle-empty">{t('settlement.noTransfers')}</p>
              ) : (
                <ul className="settle-pay-list">
                  {payments.map((p) => (
                    <li key={p.id} className="settle-pay-row">
                      <div className="settle-pay-main">
                        <span className="settle-pay-people">
                          {p.from_name || displayNameOf(members, p.from_user_id)}
                          <span className="settle-xfer-arrow" aria-hidden>→</span>
                          {p.to_name || displayNameOf(members, p.to_user_id)}
                        </span>
                        <span className="settle-pay-amt">{fmt(p.amount_cents, currency)}</span>
                      </div>
                      <div className="settle-pay-meta">
                        <span>{formatWhen(p.created_at)}</span>
                        {p.reversed && <span className="settle-pay-tag is-rev">{t('settlement.reversed')}</span>}
                        {!p.reversed && String(p.status).toUpperCase() === 'LOCKED' && (
                          <span className="settle-pay-tag is-ok">{t('common.settled')}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {(ex.steps || []).length > 0 && (
              <Spoiler
                className="settle-spoiler"
                maxHeight={0}
                showLabel={t('settlement.steps')}
                hideLabel={t('settlement.hide')}
              >
                <ol className="settle-steps">
                  {(ex.steps || []).map((step, i) => <li key={i}>{step}</li>)}
                </ol>
              </Spoiler>
            )}

            <Spoiler
              className="settle-spoiler"
              maxHeight={0}
              showLabel={t('settlement.viewRaw')}
              hideLabel={t('settlement.hide')}
            >
              <Text size="sm" c="dimmed">
                {t('settlement.rawHint', {
                  raw: ex.raw_debts ?? '—',
                  n: transfers.length,
                })}
              </Text>
            </Spoiler>

            <div className="settle-footer">
              <Group gap="xs">
                <Button size="xs" variant="default" radius="xl" onClick={loadHist}>
                  {t('settlement.history')}
                </Button>
                <Button size="xs" variant="default" radius="xl" onClick={load}>
                  {t('common.refresh')}
                </Button>
                {hist.length > 0 && (
                  <Select
                    size="xs"
                    placeholder={t('settlement.current')}
                    clearable
                    value={viewV ? String(viewV) : null}
                    onChange={(v) => setViewV(v ? Number(v) : null)}
                    data={hist.map((h) => ({
                      value: String(h.version),
                      label: `v${h.version} · ${formatWhen(h.computed_at)}`,
                    }))}
                  />
                )}
              </Group>
              <Text size="xs" c="dimmed" className="settle-version">
                v{view.version} · {formatWhen(view.computed_at)}
              </Text>
            </div>
            <Err e={e} />
          </div>
        )}
      </Modal>
    </>
  );
}
