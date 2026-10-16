// Push stub (Frame 8: invite/expense/payment/settlement + un-settle alert,
// per-group opt-out, badge for total owed). REQ §10 NFR.
// V1 scope per approval: scaffold + stub; wire expo-notifications next.
export async function registerPush() {
  return { status: 'stub', note: 'expo-notifications wiring is TODO(V1-next)' };
}
export async function setGroupOptOut(_groupId, _muted) {
  return { status: 'stub' };
}
