"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { EmptyState, ErrorState, Skeleton } from "@/components/shared";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { createAdminUser, deactivateAdminUser, fetchAdminTeam, fetchRuleThresholds, reassignAdminCase, saveRuleThresholds, type CreateUserInput } from "@/lib/api/admin";
import { fetchRecords } from "@/lib/api/records";
import { INSPECTION_REGIONS } from "@/lib/mock/reference";
import { mockUserName } from "@/lib/mock/users";
import { useAuth, usePermission } from "@/lib/hooks";
import type { ComplianceRecord, ManagedUser, RuleThresholds, Role } from "@/types";
import { ROLES } from "@/types/vocabulary";

const NEW_USER_DEFAULTS: CreateUserInput = {
  email: "", username: "", fullName: "", password: "", role: "Enforcement Officer",
  department: "Department of Consumer Affairs", region: "Delhi",
  jurisdictionLevel: "State", jurisdictionName: "Delhi",
};

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
  const [newUser, setNewUser] = useState<CreateUserInput>(NEW_USER_DEFAULTS);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  function load() {
    if (!user) return;
    Promise.all([fetchAdminTeam(user.id), fetchRuleThresholds(user.id)])
      .then(([team, rules]) => { setUsers(team.users); setThresholds(rules); setError(null); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : t("loadError")));
    fetchRecords({ categories: [], complianceStatuses: [], regions: [], manufacturers: [], sources: [], violationCategoryIds: [], batchIds: [] }, "newest", 1, 100)
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
  async function submitNewUser() {
    if (!user) return;
    setCreateError(null);
    setCreateSuccess(null);
    setSaving(true);
    try {
      const created = await createAdminUser(user.id, newUser);
      setCreateSuccess(t("team.createSuccess", { name: created.fullName, role: created.role }));
      setNewUser(NEW_USER_DEFAULTS);
      load();
    } catch (reason) {
      setCreateError(reason instanceof Error ? reason.message : t("loadError"));
    }
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
    {tab === "team" ? <section className="ux4g-card ux4g-card-outline"><div className="ux4g-card-body"><h2 className="ux4g-title-m-strong">{t("team.heading")}</h2><p className="ux4g-body-s-default ux4g-text-neutral-secondary">{t("team.scopeNote")}</p><table className="ux4g-table"><thead><tr><th>{t("team.name")}</th><th>{t("team.role")}</th><th>{t("team.jurisdiction")}</th><th>{t("team.caseLoad")}</th><th>{t("team.status")}</th><th>{t("team.action")}</th></tr></thead><tbody>{users.map((person) => <tr key={person.id}><td>{person.fullName}</td><td>{person.role}</td><td>{person.jurisdictionName}</td><td>{person.caseLoad}</td><td>{person.active ? t("team.active") : t("team.deactivated")}</td><td>{person.active ? <button type="button" className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm" disabled={saving || person.id === user?.id} onClick={() => deactivate(person)}>{t("team.deactivate")}</button> : "—"}</td></tr>)}</tbody></table>
      <h3 className="ux4g-title-s-strong">{t("team.createHeading")}</h3>
      {createError ? <p role="alert" className="ux4g-text-error">{createError}</p> : null}
      {createSuccess ? <p role="status" className="ux4g-text-success">{createSuccess}</p> : null}
      <form onSubmit={(event) => { event.preventDefault(); void submitNewUser(); }} className="lmcs-page-section-block">
        <TextField id="create-user-email" label={t("team.createEmail")} required type="email" value={newUser.email} onChange={(event) => setNewUser({ ...newUser, email: event.target.value })} />
        <TextField id="create-user-username" label={t("team.createUsername")} required value={newUser.username} onChange={(event) => setNewUser({ ...newUser, username: event.target.value })} />
        <TextField id="create-user-fullname" label={t("team.createFullName")} required value={newUser.fullName} onChange={(event) => setNewUser({ ...newUser, fullName: event.target.value })} />
        <TextField id="create-user-password" label={t("team.createPassword")} required minLength={6} type="password" value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} />
        <Select id="create-user-role" label={t("team.createRole")} value={newUser.role} options={ROLES.map((role) => ({ label: role, value: role }))} onChange={(event) => setNewUser({ ...newUser, role: event.target.value as Role })} />
        <Select id="create-user-region" label={t("team.createRegion")} value={newUser.region} options={INSPECTION_REGIONS.map((region) => ({ label: region, value: region }))} onChange={(event) => setNewUser({ ...newUser, region: event.target.value, jurisdictionName: newUser.jurisdictionLevel === "State" ? event.target.value : newUser.jurisdictionName })} />
        <Select id="create-user-jurisdiction-level" label={t("team.createJurisdictionLevel")} value={newUser.jurisdictionLevel} options={[{ label: t("team.createJurisdictionState"), value: "State" }, { label: t("team.createJurisdictionNational"), value: "National" }]} onChange={(event) => { const level = event.target.value as "State" | "National"; setNewUser({ ...newUser, jurisdictionLevel: level, jurisdictionName: level === "National" ? "National" : newUser.region }); }} />
        <p className="ux4g-body-s-default ux4g-text-neutral-secondary">{t("team.createJurisdictionName")}: {newUser.jurisdictionName}</p>
        <button type="submit" className="ux4g-btn ux4g-btn-primary" disabled={saving}>{t("team.createSubmit")}</button>
      </form>
      <h3 className="ux4g-title-s-strong">{t("team.reassignHeading")}</h3><p className="ux4g-body-s-default ux4g-text-neutral-secondary">{t("team.outsideTeamNote")}</p><Select id="reassign-case" label={t("team.caseLabel")} value={recordId} placeholder={t("team.selectCase")} options={records.map((record) => ({ label: `${record.productName} — ${record.assignedOfficerUserId ?? t("team.unassigned")}`, value: record.id }))} onChange={(event) => setRecordId(event.target.value)} /><Select id="reassign-officer" label={t("team.officerLabel")} value={officerId} placeholder={t("team.selectOfficer")} options={users.filter((person) => person.role === "Enforcement Officer" && person.active).map((person) => ({ label: person.fullName, value: person.id }))} onChange={(event) => setOfficerId(event.target.value)} /><button type="button" className="ux4g-btn ux4g-btn-primary" disabled={saving || !recordId || !officerId} onClick={reassign}>{t("team.reassign")}</button><p className="ux4g-body-s-default ux4g-text-neutral-secondary">{t("team.sessionNote")}</p></div></section> : null}
    {tab === "thresholds" ? <section className="ux4g-card ux4g-card-outline"><div className="ux4g-card-body lmcs-page-section-block"><h2 className="ux4g-title-m-strong">{t("thresholds.heading")}</h2><p className="ux4g-body-s-default ux4g-text-neutral-secondary">{t("thresholds.freezeNote")}</p>{(["repeatViolationCount", "repeatViolationDays", "ocrConfidenceThreshold", "excellentMinimum", "goodMinimum", "poorMinimum"] as const).map((key) => <TextField key={key} id={`threshold-${key}`} label={t(`thresholds.${key}`)} type="number" value={thresholds[key]} onChange={(event) => setNumber(key, event.target.value)} />)}<button type="button" className="ux4g-btn ux4g-btn-primary" disabled={saving} onClick={save}>{t("thresholds.save")}</button></div></section> : null}
    {tab === "system" ? <section className="ux4g-card ux4g-card-outline"><div className="ux4g-card-body"><h2 className="ux4g-title-m-strong">{t("system.heading")}</h2><p>{t("system.locales")}</p><p>{t("system.upload")}</p><p className="ux4g-body-s-default ux4g-text-neutral-secondary">{t("system.readOnly")}</p></div></section> : null}
  </div>;
}
