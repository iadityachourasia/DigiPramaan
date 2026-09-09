"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { EmptyState, ErrorState, Skeleton } from "@/components/shared";
import { deactivateAdminUser, fetchAdminTeam, fetchRuleThresholds, reassignAdminCase, saveRuleThresholds } from "@/lib/api/admin";
import { fetchRecords } from "@/lib/api/records";
import { mockUserName } from "@/lib/mock/users";
import { useAuth, usePermission } from "@/lib/hooks";
import type { ComplianceRecord, ManagedUser, RuleThresholds } from "@/types";

type Tab = "team" | "thresholds" | "system";
type PendingAction =
  | { kind: "deactivate"; person: ManagedUser }
  | { kind: "reassign"; record: ComplianceRecord; officer: ManagedUser };

export function AdminConsoleView() {
  const t = useTranslations("admin");
  const { user } = useAuth();
  const permitted = usePermission("rules.manageThresholds");
  const [tab, setTab] = useState<Tab>("team");
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [thresholds, setThresholds] = useState<RuleThresholds | null>(null);
  const [records, setRecords] = useState<ComplianceRecord[]>([]);
  const [recordId, setRecordId] = useState("");
  const [officerId, setOfficerId] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    if (!user) return;
    Promise.all([fetchAdminTeam(user.id), fetchRuleThresholds(user.id)])
      .then(([team, rules]) => { setUsers(team.users); setThresholds(rules); setError(null); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : t("loadError")));
    fetchRecords({ categories: [], complianceStatuses: [], regions: [], manufacturers: [], sources: [], violationCategoryIds: [], batchIds: [] }, "newest", 1, 100, user.id)
      .then((result) => { if (result.ok) setRecords(result.data.rows); });
  }
  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!permitted) return <EmptyState icon="block" title={t("noAccessTitle")} description={t("noAccessBody")} />;
  if (error) return <ErrorState title={t("loadError")} description={error} action={<button type="button" className="ux4g-btn ux4g-btn-outline-primary" onClick={load}>{t("retry")}</button>} />;
  if (!users || !thresholds) return <Skeleton height="18rem" />;

  function deactivate(person: ManagedUser) {
    setPendingAction({ kind: "deactivate", person });
  }
  async function executeDeactivation(person: ManagedUser) {
    if (!user) return;
    setSaving(true);
    try { await deactivateAdminUser(user.id, person.id); load(); } catch (reason) { setError(reason instanceof Error ? reason.message : t("loadError")); }
    setSaving(false);
  }
  async function save() {
    if (!user) return;
    setSaving(true);
    try { if (thresholds) setThresholds(await saveRuleThresholds(user.id, thresholds)); } catch (reason) { setError(reason instanceof Error ? reason.message : t("loadError")); }
    setSaving(false);
  }
  async function reassign() {
    if (!user || !recordId || !officerId) return;
    const record = records.find((item) => item.id === recordId);
    const officer = users?.find((item) => item.id === officerId);
    if (!record || !officer) return;
    setPendingAction({ kind: "reassign", record, officer });
  }
  async function executeReassignment(record: ComplianceRecord, officer: ManagedUser) {
    if (!user) return;
    setSaving(true);
    try { await reassignAdminCase(user.id, record.id, officer.id); setRecordId(""); setOfficerId(""); load(); } catch (reason) { setError(reason instanceof Error ? reason.message : t("loadError")); }
    setSaving(false);
  }
  async function confirmPendingAction() {
    if (!pendingAction) return;
    if (pendingAction.kind === "deactivate") {
      await executeDeactivation(pendingAction.person);
    } else if (user) {
      await executeReassignment(pendingAction.record, pendingAction.officer);
    }
    setPendingAction(null);
  }
  const setNumber = (key: keyof RuleThresholds, value: string) => setThresholds({ ...thresholds, [key]: Number(value) });
  return <div className="lmcs-page-section">
    <div role="tablist" aria-label={t("tabsLabel")}>
      {(["team", "thresholds", "system"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} className={`ux4g-btn ${tab === item ? "ux4g-btn-primary" : "ux4g-btn-outline-primary"}`} onClick={() => setTab(item)}>{t(`tabs.${item}`)}</button>)}
    </div>
    {pendingAction ? <section className="ux4g-card ux4g-card-outline" aria-labelledby="admin-confirmation-heading"><div className="ux4g-card-body"><h2 id="admin-confirmation-heading" className="ux4g-title-m-strong">{pendingAction.kind === "reassign" ? t("team.confirmReassignmentHeading") : t("team.confirmDeactivationHeading")}</h2><p>{pendingAction.kind === "reassign" ? t("team.confirmReassignmentBody", { product: pendingAction.record.productName, currentOfficer: pendingAction.record.assignedOfficerUserId ? mockUserName(pendingAction.record.assignedOfficerUserId) : t("team.unassigned"), newOfficer: pendingAction.officer.fullName }) : t("deactivateConfirm", { name: pendingAction.person.fullName })}</p><button type="button" className="ux4g-btn ux4g-btn-primary" disabled={saving} onClick={confirmPendingAction}>{pendingAction.kind === "reassign" ? t("team.confirmReassignment") : t("team.deactivate")}</button><button type="button" className="ux4g-btn ux4g-btn-outline-primary" disabled={saving} onClick={() => setPendingAction(null)}>{t("team.cancel")}</button></div></section> : null}
    {tab === "team" ? <section className="ux4g-card ux4g-card-outline"><div className="ux4g-card-body"><h2 className="ux4g-title-m-strong">{t("team.heading")}</h2><p className="ux4g-body-s-default ux4g-text-neutral-secondary">{t("team.scopeNote")}</p><table className="ux4g-table"><thead><tr><th>{t("team.name")}</th><th>{t("team.role")}</th><th>{t("team.jurisdiction")}</th><th>{t("team.caseLoad")}</th><th>{t("team.status")}</th><th>{t("team.action")}</th></tr></thead><tbody>{users.map((person) => <tr key={person.id}><td>{person.fullName}</td><td>{person.role}</td><td>{person.jurisdictionName}</td><td>{person.caseLoad}</td><td>{person.active ? t("team.active") : t("team.deactivated")}</td><td>{person.active ? <button type="button" className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm" disabled={saving || person.id === user?.id} onClick={() => deactivate(person)}>{t("team.deactivate")}</button> : "—"}</td></tr>)}</tbody></table><h3 className="ux4g-title-s-strong">{t("team.reassignHeading")}</h3><p className="ux4g-body-s-default ux4g-text-neutral-secondary">{t("team.outsideTeamNote")}</p><label className="ux4g-label-m-default">{t("team.caseLabel")}<select className="ux4g-form-select" value={recordId} onChange={(event) => setRecordId(event.target.value)}><option value="">{t("team.selectCase")}</option>{records.map((record) => <option key={record.id} value={record.id}>{record.productName} — {record.assignedOfficerUserId ?? t("team.unassigned")}</option>)}</select></label><label className="ux4g-label-m-default">{t("team.officerLabel")}<select className="ux4g-form-select" value={officerId} onChange={(event) => setOfficerId(event.target.value)}><option value="">{t("team.selectOfficer")}</option>{users.filter((person) => person.role === "Enforcement Officer" && person.active).map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></label><button type="button" className="ux4g-btn ux4g-btn-primary" disabled={saving || !recordId || !officerId} onClick={reassign}>{t("team.reassign")}</button><p className="ux4g-body-s-default ux4g-text-neutral-secondary">{t("team.sessionNote")}</p></div></section> : null}
    {tab === "thresholds" ? <section className="ux4g-card ux4g-card-outline"><div className="ux4g-card-body lmcs-page-section-block"><h2 className="ux4g-title-m-strong">{t("thresholds.heading")}</h2><p className="ux4g-body-s-default ux4g-text-neutral-secondary">{t("thresholds.freezeNote")}</p>{(["repeatViolationCount", "repeatViolationDays", "ocrConfidenceThreshold", "excellentMinimum", "goodMinimum", "poorMinimum"] as const).map((key) => <label key={key} className="ux4g-label-m-default">{t(`thresholds.${key}`)}<input aria-label={t(`thresholds.${key}`)} className="ux4g-input-input" type="number" value={thresholds[key]} onChange={(event) => setNumber(key, event.target.value)} /></label>)}<button type="button" className="ux4g-btn ux4g-btn-primary" disabled={saving} onClick={save}>{t("thresholds.save")}</button></div></section> : null}
    {tab === "system" ? <section className="ux4g-card ux4g-card-outline"><div className="ux4g-card-body"><h2 className="ux4g-title-m-strong">{t("system.heading")}</h2><p>{t("system.locales")}</p><p>{t("system.upload")}</p><p className="ux4g-body-s-default ux4g-text-neutral-secondary">{t("system.readOnly")}</p></div></section> : null}
  </div>;
}
