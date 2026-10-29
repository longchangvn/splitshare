// Group settings (spec 005 tasks 2.1, 2.8) — rename, access (open/locked/closed
// with the close-blocked hint), share link, leave and delete. Every destructive
// action confirms with the web's consequence text.
import React, { useCallback, useState } from 'react';
import { Alert, Share, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { api } from '../api/client';
import { colors } from '../theme';
import { Card, Chip, ErrorBanner, SkeletonCard, SpinButton, uiStyles } from '../ui';
import { useT } from '../prefs';
import { errorText } from '../lib/errors';

const STATUSES = ['opening', 'locked', 'closed'];

export default function GroupSettings({ route, navigation }) {
  const { id } = route.params || {};
  const t = useT();
  const [group, setGroup] = useState(null);
  const [name, setName] = useState('');
  const [shareLink, setShareLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const g = await api.get(`/api/v1/groups/${id}`);
      const detail = g.group || g;
      setGroup(detail);
      setName(detail.name || '');
      setError(null);
    } catch (err) { setError(err); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!group) {
    return (
      <View style={s.wrap}>
        <SkeletonCard />
        <ErrorBanner error={error} onRetry={load} />
      </View>
    );
  }

  const isOwner = group.my_role === 'owner';

  const rename = async () => {
    const next = name.trim();
    if (next.length < 3 || next.length > 50) {
      setError({ status: 422, code: 'VALIDATION', message: t('wizard.groupName') });
      return;
    }
    setBusy(true);
    try {
      await api.patch(`/api/v1/groups/${id}`, { name: next });
      await load();
      Alert.alert(t('groupDetail.groupRenamed'), '');
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const setStatus = (next) => {
    if (next === group.status) return;
    Alert.alert(
      t('groupStatus.confirmTitle'),
      t('groupStatus.confirmBody', { from: t(`groupStatus.${group.status || 'opening'}`), to: t(`groupStatus.${next}`) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('groupStatus.confirmAction'),
          onPress: async () => {
            setBusy(true);
            setError(null);
            try {
              await api.patch(`/api/v1/groups/${id}/status`, { status: next });
              await load();
            } catch (err) {
              if (err.code === 'HAS_OPEN_BALANCE') {
                setError({ status: 422, code: 'HAS_OPEN_BALANCE', message: t('groupStatus.closeUnsettled') });
              } else setError(err);
            } finally { setBusy(false); }
          },
        },
      ],
    );
  };

  const createShareLink = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post(`/api/v1/groups/${id}/share-link`, {});
      setShareLink(res.invite_link || res.share_link || '');
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const leave = () => {
    Alert.alert(t('groupDetail.leaveGroup'), t('groupDetail.leaveBody', { name: group.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('groupDetail.leave'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await api.post(`/api/v1/groups/${id}/leave`, {});
            navigation.navigate('Main', { screen: 'Groups' });
          } catch (err) {
            setError(err.code === 'HAS_OPEN_BALANCE'
              ? { ...err, message: t('m.errors.openBalance') }
              : err);
          } finally { setBusy(false); }
        },
      },
    ]);
  };

  const remove = () => {
    Alert.alert(t('groupDetail.deleteGroup'), t('groupDetail.deleteBody', { name: group.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('groupDetail.delete'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await api.del(`/api/v1/groups/${id}`);
            navigation.navigate('Main', { screen: 'Groups' });
          } catch (err) { setError(err); } finally { setBusy(false); }
        },
      },
    ]);
  };

  return (
    <ScrollView style={s.wrap} keyboardShouldPersistTaps="handled">
      <Card>
        <Text style={uiStyles.h}>{t('groupDetail.rename')}</Text>
        <TextInput style={s.input} value={name} onChangeText={setName} maxLength={50} accessibilityLabel={t('wizard.groupName')} />
        <SpinButton title={t('common.saveChanges')} busy={busy} onPress={rename} />
        <Text style={uiStyles.muted}>{group.currency} · {t('wizard.currency')} </Text>
      </Card>

      <Card>
        <Text style={uiStyles.h}>{t('groupStatus.label')}</Text>
        <View style={s.chips}>
          {STATUSES.map((st) => (
            <Chip key={st} label={t(`groupStatus.${st}`)} selected={group.status === st} onPress={() => setStatus(st)} />
          ))}
        </View>
        <Text style={uiStyles.muted}>{t(`groupStatus.${group.status || 'opening'}Hint`)}</Text>
      </Card>

      {isOwner && (
        <Card>
          <Text style={uiStyles.h}>{t('share.readOnly')}</Text>
          <Text style={uiStyles.muted}>{t('invite.linkHint')}</Text>
          <SpinButton title={t('share.whoPaysWhom')} variant="ghost" busy={busy} onPress={createShareLink} />
          {!!shareLink && (
            <>
              <Text style={s.link} selectable>{shareLink}</Text>
              <SpinButton
                title={t('invite.copyLink')}
                onPress={async () => {
                  await Clipboard.setStringAsync(shareLink);
                  Alert.alert(t('invite.linkCopied'), '');
                }}
              />
              <SpinButton title={t('invite.share')} variant="ghost" onPress={() => Share.share({ message: shareLink, url: shareLink }).catch(() => {})} />
            </>
          )}
        </Card>
      )}

      <Card>
        <Text style={uiStyles.h}>{t('profile.tabDanger')}</Text>
        <SpinButton title={t('groupDetail.leaveGroup')} variant="ghost" busy={busy} onPress={leave} />
        {isOwner && <SpinButton title={t('groupDetail.deleteGroup')} variant="danger" busy={busy} onPress={remove} />}
      </Card>

      <ErrorBanner error={error} />
      <Text style={uiStyles.muted}>{error ? errorText(error, t) : ''}</Text>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14 },
  input: {
    backgroundColor: '#fff', borderColor: colors.inputBorder, borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 11, marginTop: 8, minHeight: 44, fontSize: 14,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  link: { fontSize: 11, color: colors.darkTealText, backgroundColor: colors.paleTealBg, borderRadius: 10, padding: 10, marginTop: 10 },
});
