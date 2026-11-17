import { Link } from 'react-router-dom';
import { Button } from '@mantine/core';
import { publicHandle } from '../../../auth.jsx';
import { GroupThumb, initialsOf, pastelFor } from '../../../components/Net.jsx';
import { ThemedIcon } from '../../../components/ThemedIcon.jsx';
import { useT } from '../../../prefs.jsx';

function Section({ icon, title, hint, tone = '', children, aside = null }) {
  return (
    <section className={`se-settings-card${tone ? ` is-${tone}` : ''}`}>
      <header className="se-settings-head">
        <span className="se-icon-tile" aria-hidden><ThemedIcon ms={icon} size={20} /></span>
        <div className="se-settings-head-copy">
          <h3>{title}</h3>
          {hint && <p>{hint}</p>}
        </div>
        {aside}
      </header>
      <div className="se-settings-body">{children}</div>
    </section>
  );
}

/**
 * Group settings page (M24 / D19) — gathers controls that already exist on the group page.
 * Every handler is GroupDetail's own (same API calls, confirms and preview modals).
 */
export function GroupSettingsView({
  groupId, detail, createdSubtitle, lifecycleLabel, groupLifecycle, lifecyclePicker,
  onRename, onInvite, onSetRole, onSetDeposit, onRemove, onLeave, onDelete, categoryManager, error,
}) {
  const t = useT();
  const members = detail.members || [];
  const isOwner = detail.my_role === 'owner';
  return (
    <div className="se-settings">
      <Link to={`/groups/${groupId}`} className="se-back-link">
        <ThemedIcon ms="arrow_back" size={18} />
        {t('seGroup.backToLedger')}
      </Link>
      <div className="se-settings-title">
        <span className="se-kicker">{detail.name}</span>
        <h1>{t('seGroup.settingsTitle')}</h1>
        <p>{t('seGroup.settingsHint')}</p>
      </div>
      {error}
      <div className="se-settings-grid">
        <div className="se-settings-col">
          <Section icon="tune" title={t('seGroup.profile')}>
            <div className="se-settings-profile">
              <GroupThumb name={detail.name} size={56} />
              <div className="se-settings-profile-copy">
                <span className="se-field-label">{t('wizard.groupName')}</span>
                <strong>{detail.name}</strong>
                {createdSubtitle && <span className="se-muted">{createdSubtitle}</span>}
              </div>
              {isOwner && (
                <Button variant="default" className="se-btn-quiet" onClick={onRename}>
                  {t('groupDetail.rename')}
                </Button>
              )}
            </div>
            <div className="se-settings-facts">
              <div>
                <span className="se-field-label">{t('seGroup.currency')}</span>
                <strong>{detail.currency}</strong>
              </div>
              <div>
                <span className="se-field-label">{t('common.members')}</span>
                <strong>{members.length}</strong>
              </div>
              {detail.mode && (
                <div>
                  <span className="se-field-label">{t('seGroup.mode')}</span>
                  <strong>{detail.mode}</strong>
                </div>
              )}
            </div>
          </Section>

          <Section
            icon="admin_panel_settings"
            title={t('seGroup.membersRoles')}
            hint={t('seGroup.membersRolesHint')}
            aside={(
              <button type="button" className="se-chip-btn" onClick={onInvite}>
                <ThemedIcon ms="person_add" size={16} />
                {t('groupDetail.inviteMembers')}
              </button>
            )}
          >
            <div className="se-member-list">
              {members.map((m) => {
                const pastel = pastelFor(m.display_name || m.username);
                const role = m.role === 'owner' ? t('common.owner') : m.role === 'treasurer' ? t('common.treasurer') : t('common.member');
                const canAct = detail.mode === 'event' || isOwner;
                return (
                  <div key={m.user_id} className="se-member-row">
                    <span className="se-avatar is-lg" style={{ '--gt-from': pastel.from, '--gt-to': pastel.to }} aria-hidden>
                      {initialsOf(m.display_name)}
                    </span>
                    <span className="se-peer-copy">
                      <span className="se-peer-name">
                        {m.display_name}
                        <span className={`se-role-tag is-${m.role || 'member'}`}>{role}</span>
                      </span>
                      {publicHandle(m.username) && <span className="se-peer-sub">@{m.username}</span>}
                    </span>
                    {canAct && (
                      <div className="se-member-actions">
                        {detail.mode === 'event' && (
                          <button type="button" className={`se-chip-btn${m.deposit_paid ? ' is-on' : ''}`} onClick={() => onSetDeposit(m.user_id, !m.deposit_paid)}>
                            {m.deposit_paid ? t('groupDetail.unmarkDeposit') : t('groupDetail.markDeposit')}
                          </button>
                        )}
                        {isOwner && m.role !== 'owner' && (
                          <button
                            type="button"
                            className={`se-chip-btn${m.role === 'treasurer' ? ' is-on' : ''}`}
                            onClick={() => onSetRole(m.user_id, m.role === 'treasurer' ? 'member' : 'treasurer')}
                          >
                            <ThemedIcon ms="star" size={16} filled={m.role === 'treasurer'} />
                            {m.role === 'treasurer' ? t('groupDetail.removeTreasurer') : t('groupDetail.makeTreasurer')}
                          </button>
                        )}
                        {isOwner && m.role !== 'owner' && (
                          <button
                            type="button"
                            className="se-chip-btn is-danger"
                            aria-label={t('groupDetail.removeNamed', { name: m.display_name })}
                            onClick={() => onRemove(m.user_id, m.display_name)}
                          >
                            <ThemedIcon ms="person_remove" size={16} />
                            {t('common.remove')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        </div>

        <div className="se-settings-col">
          <Section icon="lock_clock" title={t('seGroup.lifecycle')} hint={t(`groupStatus.${groupLifecycle}Hint`)}>
            <div className="se-settings-lifecycle">
              <span className={`se-pill is-life-${groupLifecycle}`}>{lifecycleLabel}</span>
              {lifecyclePicker || <span className="se-muted">{t('seGroup.ownerOnly')}</span>}
            </div>
          </Section>

          <Section icon="category" title={t('groupDetail.tabCategories')}>
            {categoryManager}
          </Section>

          <Section icon="warning" title={t('seGroup.danger')} hint={t('seGroup.dangerHint')} tone="danger">
            <div className="se-danger-row">
              <div>
                <strong>{t('groupDetail.leaveGroup')}</strong>
                <span className="se-muted">{t('seGroup.leaveHint')}</span>
              </div>
              <Button variant="default" className="se-btn-quiet" onClick={onLeave}>{t('groupDetail.leaveGroup')}</Button>
            </div>
            {isOwner && (
              <div className="se-danger-row is-delete">
                <div>
                  <strong>{t('groupDetail.deleteGroup')}</strong>
                  <span className="se-muted">{t('seGroup.deleteHint')}</span>
                </div>
                <Button color="red" onClick={onDelete}>{t('groupDetail.deleteGroup')}</Button>
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
