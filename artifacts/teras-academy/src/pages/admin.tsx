import { type FormEvent, type ReactNode, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  type AdminOperationalSummary,
  getGetAdminOperationalSummaryQueryKey, getListAdminAuditEventsQueryKey, getListAdminCohortsQueryKey, getListAdminEnrollmentsQueryKey,
  getListAdminPathwaysQueryKey, getListAdminProgramsQueryKey, getListAdminUsersQueryKey,
  useCreateAdminCohort, useCreateAdminEnrollment, useCreateAdminPathway, useCreateAdminProgram,
  useCreateAdminUser, useGetAdminOperationalSummary, useListAdminAuditEvents, useListAdminCohorts, useListAdminEnrollments,
  useListAdminPathways, useListAdminPrograms, useListAdminUsers, useReplaceAdminUserRoles,
  useUpdateAdminCohort, useUpdateAdminEnrollment, useUpdateAdminPathway, useUpdateAdminProgram,
  useUpdateAdminUser,
  getListAdminKnowledgeArticlesQueryKey, useCreateAdminKnowledgeArticle, useListAdminKnowledgeArticles, usePublishAdminKnowledgeArticle, useUpdateAdminKnowledgeArticle,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Archive, ArrowRight, ClipboardCheck, Loader2, Plus, RefreshCw, UsersRound } from "lucide-react";

const roles = ["admin", "trainer", "assessor", "learner"] as const;
const userSchema = z.object({ name: z.string().min(1, "Nama wajib diisi"), email: z.string().email("Email tidak valid").or(z.literal("")), organization: z.string(), clerkUserId: z.string(), roles: z.array(z.enum(roles)).min(1, "Pilih minimal satu peran") });
type UserForm = z.infer<typeof userSchema>;
const queryOptions = { staleTime: 30_000, refetchOnMount: "always" as const };

export function adminErrorMessage(error: unknown) {
  const candidate = error as { status?: number; data?: { error?: string }; message?: string };
  return candidate?.status === 403 ? "Anda tidak memiliki akses admin." : candidate?.status === 409 ? "Konflik: data sudah ada atau berubah. Muat ulang lalu coba lagi." : candidate?.data?.error || candidate?.message || "Operasi tidak dapat diselesaikan.";
}
export function isAdminForbidden(error: unknown) {
  return (error as { status?: number } | undefined)?.status === 403;
}

const auditEntityLabels: Record<string, string> = {
  user: "pengguna",
  program: "program",
  pathway: "pathway",
  cohort: "cohort",
  enrollment: "enrollment",
  knowledge: "artikel knowledge",
};

function auditDescription(action: string, entityType: string) {
  const entity = auditEntityLabels[entityType] ?? "data";
  if (action === "create") return `${entity[0].toUpperCase()}${entity.slice(1)} baru dibuat`;
  if (action === "update") return `Informasi ${entity} diperbarui`;
  if (action === "replace_roles") return "Peran dan hak akses pengguna diperbarui";
  if (action === "publish") return `${entity[0].toUpperCase()}${entity.slice(1)} dipublikasikan`;
  return `Perubahan pada ${entity}`;
}

function auditTime(value: string | Date) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}
function State({ loading, error, empty, children }: { loading: boolean; error: unknown; empty: boolean; children: ReactNode }) {
  if (loading) return <div className="flex min-h-32 items-center gap-2 text-muted-foreground" role="status" aria-live="polite"><Loader2 className="h-4 w-4 animate-spin" /> Memuat data operasional…</div>;
  if (error) return <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive" role="alert">{adminErrorMessage(error)}</div>;
  if (empty) return <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">Belum ada data. Tambahkan catatan pertama di atas.</div>;
  return <>{children}</>;
}

export default function Admin() {
  const client = useQueryClient(); const { toast } = useToast();
  const [tab, setTab] = useState<"summary" | "users" | "programs" | "pathways" | "cohorts" | "enrollments" | "knowledge" | "audit">("summary");
  const [confirm, setConfirm] = useState<{ kind: "user" | "program" | "pathway" | "cohort" | "enrollment"; id: string; label: string } | null>(null);
  const [editing, setEditing] = useState<{ kind: "user" | "program" | "pathway" | "cohort" | "enrollment" | "knowledge"; item: Record<string, unknown> } | null>(null);
  const users = useListAdminUsers({ query: { ...queryOptions, queryKey: getListAdminUsersQueryKey() } });
  const programs = useListAdminPrograms({ query: { ...queryOptions, queryKey: getListAdminProgramsQueryKey() } });
  const pathways = useListAdminPathways({ query: { ...queryOptions, queryKey: getListAdminPathwaysQueryKey() } });
  const cohorts = useListAdminCohorts({ query: { ...queryOptions, queryKey: getListAdminCohortsQueryKey() } });
  const enrollments = useListAdminEnrollments({ query: { ...queryOptions, queryKey: getListAdminEnrollmentsQueryKey() } });
  const audit = useListAdminAuditEvents({ query: { ...queryOptions, queryKey: getListAdminAuditEventsQueryKey() } });
  const knowledge = useListAdminKnowledgeArticles({ query: { ...queryOptions, queryKey: getListAdminKnowledgeArticlesQueryKey() } });
  const summary = useGetAdminOperationalSummary<AdminOperationalSummary>({ query: { ...queryOptions, queryKey: getGetAdminOperationalSummaryQueryKey() } });
  const createUser = useCreateAdminUser(); const rolesMutation = useReplaceAdminUserRoles(); const updateUser = useUpdateAdminUser();
  const createProgram = useCreateAdminProgram(); const updateProgram = useUpdateAdminProgram();
  const createPathway = useCreateAdminPathway(); const updatePathway = useUpdateAdminPathway();
  const createCohort = useCreateAdminCohort(); const updateCohort = useUpdateAdminCohort();
  const createEnrollment = useCreateAdminEnrollment(); const updateEnrollment = useUpdateAdminEnrollment();
  const createKnowledge = useCreateAdminKnowledgeArticle(); const publishKnowledge = usePublishAdminKnowledgeArticle();
  const updateKnowledge = useUpdateAdminKnowledgeArticle();
  const invalidate = (...keys: ReadonlyArray<readonly unknown[]>) => Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));
  const saved = (message: string) => toast({ title: "Tersimpan", description: message });
  const form = useForm<UserForm>({ resolver: zodResolver(userSchema), defaultValues: { name: "", email: "", organization: "", clerkUserId: "", roles: ["learner"] } });
  const submitUser = (v: UserForm) => createUser.mutate({ data: { id: crypto.randomUUID(), name: v.name, initials: v.name.split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase(), email: v.email || null, organization: v.organization || null, clerkUserId: v.clerkUserId || null, status: "active", roles: v.roles } }, {
    onSuccess: async (user) => { await rolesMutation.mutateAsync({ personId: user.id, data: { roles: v.roles } }); await invalidate(getListAdminUsersQueryKey(), getListAdminAuditEventsQueryKey()); form.reset(); saved("Pengguna dan peran diperbarui."); },
    onError: e => toast({ variant: "destructive", title: "Gagal membuat pengguna", description: adminErrorMessage(e) }),
  });
  const archive = () => {
    if (!confirm) return; const c = confirm;
    const finish = () => { setConfirm(null); saved(`${c.label} diperbarui.`); invalidate(getListAdminUsersQueryKey(), getListAdminProgramsQueryKey(), getListAdminPathwaysQueryKey(), getListAdminCohortsQueryKey(), getListAdminAuditEventsQueryKey()); };
    if (c.kind === "user") updateUser.mutate({ personId: c.id, data: { status: "inactive" } }, { onSuccess: finish, onError: e => toast({ variant: "destructive", title: "Gagal menonaktifkan", description: adminErrorMessage(e) }) });
    else if (c.kind === "program") updateProgram.mutate({ programId: c.id, data: { status: "archived" } }, { onSuccess: finish, onError: e => toast({ variant: "destructive", title: "Gagal mengarsipkan", description: adminErrorMessage(e) }) });
    else if (c.kind === "pathway") updatePathway.mutate({ pathwayId: c.id, data: { status: "archived" } }, { onSuccess: finish, onError: e => toast({ variant: "destructive", title: "Gagal mengarsipkan", description: adminErrorMessage(e) }) });
    else if (c.kind === "cohort") updateCohort.mutate({ cohortId: c.id, data: { status: "archived" } }, { onSuccess: finish, onError: e => toast({ variant: "destructive", title: "Gagal mengarsipkan", description: adminErrorMessage(e) }) });
    else updateEnrollment.mutate({ enrollmentId: c.id, data: { status: "inactive" } }, { onSuccess: finish, onError: e => toast({ variant: "destructive", title: "Gagal menonaktifkan", description: adminErrorMessage(e) }) });
  };
  const quickCreate = (event: React.FormEvent<HTMLFormElement>, kind: string) => {
    event.preventDefault(); const target = event.currentTarget; const v = Object.fromEntries(new FormData(target)); const id = crypto.randomUUID();
    const ok = () => { target.reset(); saved(`${kind} ditambahkan.`); invalidate(getListAdminProgramsQueryKey(), getListAdminPathwaysQueryKey(), getListAdminCohortsQueryKey(), getListAdminEnrollmentsQueryKey(), getListAdminAuditEventsQueryKey()); };
    const fail = (e: unknown) => toast({ variant: "destructive", title: `Gagal menambah ${kind}`, description: adminErrorMessage(e) });
    if (kind === "program") createProgram.mutate({ data: { id, name: String(v.name), domain: String(v.domain), description: String(v.description), status: "active" } }, { onSuccess: ok, onError: fail });
    if (kind === "pathway") createPathway.mutate({ data: { id, programId: String(v.programId), name: String(v.name), type: String(v.type), outcome: String(v.outcome), status: "active" } }, { onSuccess: ok, onError: fail });
    if (kind === "cohort") createCohort.mutate({ data: { id, programId: String(v.programId), name: String(v.name), startsOn: String(v.startsOn) || null, endsOn: String(v.endsOn) || null, status: "active" } }, { onSuccess: ok, onError: fail });
    if (kind === "enrollment") createEnrollment.mutate({ data: { id, learnerId: String(v.learnerId), programId: String(v.programId), pathwayId: String(v.pathwayId), trainerId: String(v.trainerId) || null, assessorId: String(v.assessorId) || null, cohortId: String(v.cohortId) || null, status: "active" } }, { onSuccess: ok, onError: fail });
  };
  const value = (name: string) => String(editing?.item[name] ?? "");
  const saveEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    const target = event.currentTarget;
    const values = new FormData(target);
    const id = value("id");
    const done = () => { setEditing(null); saved("Perubahan diperbarui."); invalidate(getListAdminUsersQueryKey(), getListAdminProgramsQueryKey(), getListAdminPathwaysQueryKey(), getListAdminCohortsQueryKey(), getListAdminEnrollmentsQueryKey(), getListAdminAuditEventsQueryKey()); };
    const failed = (error: unknown) => toast({ variant: "destructive", title: "Gagal menyimpan perubahan", description: adminErrorMessage(error) });
    if (editing.kind === "user") {
      const selectedRoles = values.getAll("roles") as Array<"admin" | "trainer" | "assessor" | "learner">;
      if (!selectedRoles.length) { toast({ variant: "destructive", title: "Peran diperlukan", description: "Pilih minimal satu peran." }); return; }
      updateUser.mutate({ personId: id, data: { name: String(values.get("name")), initials: String(values.get("name")).split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase(), email: String(values.get("email")) || null, organization: String(values.get("organization")) || null, clerkUserId: String(values.get("clerkUserId")) || null, status: values.get("status") as "active" | "inactive" } }, { onSuccess: async () => { await rolesMutation.mutateAsync({ personId: id, data: { roles: selectedRoles } }); done(); }, onError: failed });
    } else if (editing.kind === "program") updateProgram.mutate({ programId: id, data: { name: String(values.get("name")), domain: String(values.get("domain")), description: String(values.get("description")), status: values.get("status") as "active" | "archived" } }, { onSuccess: done, onError: failed });
    else if (editing.kind === "pathway") updatePathway.mutate({ pathwayId: id, data: { name: String(values.get("name")), type: String(values.get("type")), outcome: String(values.get("outcome")), status: values.get("status") as "active" | "archived" } }, { onSuccess: done, onError: failed });
    else if (editing.kind === "cohort") updateCohort.mutate({ cohortId: id, data: { name: String(values.get("name")), startsOn: String(values.get("startsOn")) || null, endsOn: String(values.get("endsOn")) || null, status: values.get("status") as "active" | "archived" } }, { onSuccess: done, onError: failed });
    else if (editing.kind === "knowledge") {
      const audience = values.getAll("audience") as Array<"learner" | "trainer" | "assessor" | "admin">;
      if (!audience.length) { toast({ variant: "destructive", title: "Audiens diperlukan", description: "Pilih minimal satu peran yang dapat melihat artikel." }); return; }
      updateKnowledge.mutate({ articleId: id, data: { title: String(values.get("title")), body: String(values.get("body")), category: values.get("category") as "help" | "energy", audience } }, { onSuccess: () => { invalidate(getListAdminKnowledgeArticlesQueryKey(), getListAdminAuditEventsQueryKey()); done(); }, onError: failed });
    }
    else updateEnrollment.mutate({ enrollmentId: id, data: { pathwayId: String(values.get("pathwayId")), trainerId: String(values.get("trainerId")) || null, assessorId: String(values.get("assessorId")) || null, cohortId: String(values.get("cohortId")) || null, status: values.get("status") as "active" | "inactive" | "completed" } }, { onSuccess: done, onError: failed });
  };
  const createArticle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const audience = values.getAll("audience") as Array<"learner" | "trainer" | "assessor" | "admin">;
    if (!audience.length) {
      toast({ variant: "destructive", title: "Audiens diperlukan", description: "Pilih minimal satu peran yang dapat melihat artikel." });
      return;
    }
    createKnowledge.mutate({ data: { id: crypto.randomUUID(), category: values.get("category") as "help" | "energy", title: String(values.get("title")), body: String(values.get("body")), audience } }, { onSuccess: () => { form.reset(); invalidate(getListAdminKnowledgeArticlesQueryKey(), getListAdminAuditEventsQueryKey()); saved("Artikel disimpan sebagai draft."); }, onError: error => toast({ variant: "destructive", title: "Gagal menyimpan artikel", description: adminErrorMessage(error) }) });
  };
  const tabs = [["summary", "Ringkasan"], ["users", "Pengguna"], ["programs", "Program"], ["pathways", "Pathway"], ["cohorts", "Cohort"], ["enrollments", "Enrollment"], ["knowledge", "Knowledge"], ["audit", "Audit"]] as const;
  const field = (name: string, placeholder: string, required = true) => <Input name={name} required={required} placeholder={placeholder} data-testid={`input-admin-${name}`} />;
  const adminDenied = [summary.error, users.error, programs.error, pathways.error, cohorts.error, enrollments.error, knowledge.error, audit.error].some(isAdminForbidden);
  if (adminDenied) return <div className="flex min-h-48 items-center justify-center" role="alert" aria-live="assertive" data-testid="admin-access-denied"><Card className="max-w-md border-destructive/40"><CardContent className="p-6 text-center"><h1 className="font-semibold">Anda tidak memiliki akses admin</h1><p className="mt-2 text-sm text-muted-foreground">Akses dashboard ini ditentukan oleh server. Hubungi administrator jika Anda memerlukan peran admin.</p></CardContent></Card></div>;
  return <div className="space-y-6" aria-labelledby="admin-title">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-xs font-bold tracking-widest text-primary">OPERATIONS · SERVER-AUTHORIZED</p><h1 id="admin-title" className="mt-2 text-3xl font-bold">Admin Control Room</h1><p className="mt-1 text-sm text-muted-foreground">Visibilitas UI bukan otorisasi; setiap aksi diverifikasi oleh server.</p></div><Button variant="outline" onClick={() => client.invalidateQueries()} data-testid="button-refresh-admin"><RefreshCw className="mr-2 h-4 w-4" />Muat ulang</Button></header>
    <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Bagian administrasi">{tabs.map(([id, label]) => <Button key={id} role="tab" aria-selected={tab === id} variant={tab === id ? "default" : "outline"} onClick={() => setTab(id)} data-testid={`button-admin-tab-${id}`}>{label}</Button>)}</div>
    {tab === "summary" && <OperationalSummary summary={summary} onOpenTab={setTab} />}
    {tab === "users" && <><Card><CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-4 w-4" />Tambah pengguna</CardTitle></CardHeader><CardContent><Form {...form}><form onSubmit={form.handleSubmit(submitUser)} className="grid gap-4 md:grid-cols-5"><FormField control={form.control} name="name" render={({ field }) => <FormItem><FormLabel>Nama</FormLabel><FormControl><Input {...field} data-testid="input-admin-user-name" /></FormControl><FormMessage /></FormItem>} /><FormField control={form.control} name="email" render={({ field }) => <FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} type="email" data-testid="input-admin-user-email" /></FormControl><FormMessage /></FormItem>} /><FormField control={form.control} name="organization" render={({ field }) => <FormItem><FormLabel>Organisasi</FormLabel><FormControl><Input {...field} data-testid="input-admin-user-organization" /></FormControl><FormMessage /></FormItem>} /><FormField control={form.control} name="clerkUserId" render={({ field }) => <FormItem><FormLabel>Clerk user ID</FormLabel><FormControl><Input {...field} data-testid="input-admin-user-clerk-id" /></FormControl><p className="text-xs text-muted-foreground">ID Clerk untuk binding identitas, bukan credential.</p><FormMessage /></FormItem>} /><div><label className="text-sm font-medium">Peran</label><div className="mt-2 flex flex-wrap gap-3">{roles.map(role => <FormField key={role} control={form.control} name="roles" render={({ field }) => <label className="flex items-center gap-1 text-sm"><Checkbox checked={field.value.includes(role)} onCheckedChange={checked => field.onChange(checked ? [...field.value, role] : field.value.filter(x => x !== role))} data-testid={`checkbox-role-${role}`} />{role}</label>} />)}</div>{form.formState.errors.roles?.message && <p className="mt-1 text-sm text-destructive" role="alert">{form.formState.errors.roles.message}</p>}</div><Button type="submit" disabled={createUser.isPending || rolesMutation.isPending} data-testid="button-create-user">{createUser.isPending ? <Loader2 className="animate-spin" /> : "Simpan pengguna"}</Button></form></Form></CardContent></Card><State loading={users.isLoading} error={users.error} empty={!users.data?.length}><div className="grid gap-3">{users.data?.map(u => <Card key={u.id} data-testid={`row-admin-user-${u.id}`}><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><div><strong>{u.name}</strong><p className="text-sm text-muted-foreground">{u.email || "Tanpa email"} · {u.organization || "—"}</p></div><div className="flex items-center gap-2"><Badge variant={u.status === "active" ? "default" : "secondary"}>{u.status}</Badge>{u.roles.map(r => <Badge key={r} variant="outline">{r}</Badge>)}<Button size="sm" variant="outline" onClick={() => setEditing({ kind: "user", item: { ...u } })} data-testid={`button-edit-user-${u.id}`}>Edit</Button><Button size="sm" variant="outline" disabled={u.status === "inactive"} onClick={() => setConfirm({ kind: "user", id: u.id, label: u.name })} data-testid={`button-deactivate-user-${u.id}`}>Nonaktifkan</Button></div></CardContent></Card>)}</div></State></>}
    {tab === "programs" && <EntitySection title="Program baru" onSubmit={e => quickCreate(e, "program")} fields={[field("name", "Nama program"), field("domain", "Domain"), field("description", "Deskripsi")]} loading={programs.isLoading} error={programs.error} items={programs.data?.map(x => ({ ...x, detail: `${x.domain} · ${x.description}`, kind: "program" as const }))} onEdit={x => setEditing({ kind: "program", item: x })} onArchive={x => setConfirm({ kind: "program", id: x.id, label: x.name })} />}
    {tab === "pathways" && <EntitySection title="Pathway baru" onSubmit={e => quickCreate(e, "pathway")} fields={[field("programId", "ID program"), field("name", "Nama"), field("type", "Tipe"), field("outcome", "Outcome")]} loading={pathways.isLoading} error={pathways.error} items={pathways.data?.map(x => ({ ...x, detail: `${x.type} · ${x.outcome}`, kind: "pathway" as const }))} onEdit={x => setEditing({ kind: "pathway", item: x })} onArchive={x => setConfirm({ kind: "pathway", id: x.id, label: x.name })} />}
    {tab === "cohorts" && <EntitySection title="Cohort baru" onSubmit={e => quickCreate(e, "cohort")} fields={[field("programId", "ID program"), field("name", "Nama cohort"), <Input key="startsOn" name="startsOn" type="date" data-testid="input-admin-startsOn" />, <Input key="endsOn" name="endsOn" type="date" data-testid="input-admin-endsOn" />]} loading={cohorts.isLoading} error={cohorts.error} items={cohorts.data?.map(x => ({ ...x, detail: `${x.startsOn || "—"} sampai ${x.endsOn || "—"}`, kind: "cohort" as const }))} onEdit={x => setEditing({ kind: "cohort", item: x })} onArchive={x => setConfirm({ kind: "cohort", id: x.id, label: x.name })} />}
    {tab === "enrollments" && <><EntitySection title="Enrollment baru" onSubmit={e => quickCreate(e, "enrollment")} fields={["learnerId", "programId", "pathwayId", "trainerId", "assessorId", "cohortId"].map(n => field(n, `ID ${n.replace("Id", "")}`, ["trainerId", "assessorId", "cohortId"].includes(n) === false))} loading={enrollments.isLoading} error={enrollments.error} items={enrollments.data?.map(x => ({ ...x, name: x.learnerId, detail: `Program ${x.programId} · Pathway ${x.pathwayId}`, kind: "enrollment" as const }))} onEdit={x => setEditing({ kind: "enrollment", item: x })} onArchive={x => setConfirm({ kind: "enrollment", id: x.id, label: x.name })} /></>}
    {tab === "knowledge" && <><Card><CardHeader><CardTitle>Artikel knowledge baru</CardTitle></CardHeader><CardContent><form onSubmit={createArticle} className="grid gap-3"><select name="category" className="h-10 rounded-md border bg-background px-3" defaultValue="help"><option value="help">Help Desk</option><option value="energy">TERAS & Energi</option></select><Input name="title" required placeholder="Judul artikel" /><textarea name="body" required placeholder="Isi panduan terkurasi" className="min-h-28 rounded-md border bg-background p-3 text-sm" /><AudienceSelector /><Button type="submit" disabled={createKnowledge.isPending}>Simpan draft</Button></form></CardContent></Card><State loading={knowledge.isLoading} error={knowledge.error} empty={!knowledge.data?.length}><div className="grid gap-3">{knowledge.data?.map(article => <Card key={article.id}><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><div><strong>{article.title}</strong><p className="text-sm text-muted-foreground">{article.category} · v{article.version} · {article.status} · {article.audience.join(", ")}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" disabled={article.status === "archived"} onClick={() => setEditing({ kind: "knowledge", item: { ...article } })}>Edit</Button><Button size="sm" disabled={article.status !== "draft" || publishKnowledge.isPending} onClick={() => publishKnowledge.mutate({ articleId: article.id }, { onSuccess: () => { invalidate(getListAdminKnowledgeArticlesQueryKey(), getListAdminAuditEventsQueryKey()); saved("Artikel diterbitkan."); }, onError: error => toast({ variant: "destructive", title: "Gagal menerbitkan", description: adminErrorMessage(error) }) })}>Terbitkan</Button></div></CardContent></Card>)}</div></State></>}
    {tab === "audit" && <State loading={audit.isLoading} error={audit.error} empty={!audit.data?.length}><div className="space-y-2">{audit.data?.map(event => <Card key={event.id} data-testid={`row-audit-${event.id}`}><CardContent className="p-4"><p className="font-medium">{auditDescription(event.action, event.entityType)}</p><p className="mt-1 text-sm text-muted-foreground">Dilakukan oleh administrator · {auditTime(event.createdAt)}</p></CardContent></Card>)}</div></State>}
    <div aria-live="polite" className="sr-only">{createUser.isPending ? "Menyimpan perubahan" : ""}</div>
    <AlertDialog open={!!confirm} onOpenChange={open => !open && setConfirm(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Konfirmasi perubahan status</AlertDialogTitle><AlertDialogDescription>Anda akan menonaktifkan atau mengarsipkan {confirm?.label}. Aksi ini tercatat dalam audit dan dapat memengaruhi akses aktif.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel data-testid="button-cancel-admin-confirm">Batal</AlertDialogCancel><AlertDialogAction onClick={archive} data-testid="button-confirm-admin-status">Lanjutkan</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <Dialog open={!!editing} onOpenChange={open => !open && setEditing(null)}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Edit {editing?.kind}</DialogTitle><DialogDescription>Perubahan diperiksa server dan dicatat pada audit.</DialogDescription></DialogHeader>{editing && <form onSubmit={saveEdit} className="grid gap-4" aria-label={`Edit ${editing.kind}`}>
      {editing.kind === "user" && <><Input name="name" defaultValue={value("name")} aria-label="Nama pengguna" required data-testid="input-edit-user-name" /><Input name="email" type="email" defaultValue={value("email")} aria-label="Email pengguna" data-testid="input-edit-user-email" /><Input name="organization" defaultValue={value("organization")} aria-label="Organisasi pengguna" data-testid="input-edit-user-organization" /><label className="grid gap-1 text-sm">Clerk user ID<Input name="clerkUserId" defaultValue={value("clerkUserId")} aria-label="Clerk user ID" data-testid="input-edit-user-clerk-id" /><span className="text-xs text-muted-foreground">ID Clerk untuk binding identitas, bukan credential.</span></label><div role="group" aria-label="Peran pengguna" className="flex flex-wrap gap-3">{roles.map(role => <label key={role} className="flex items-center gap-2 text-sm"><input name="roles" type="checkbox" value={role} defaultChecked={Array.isArray(editing.item.roles) && editing.item.roles.includes(role)} />{role}</label>)}</div></>}
      {editing.kind === "program" && <><Input name="name" defaultValue={value("name")} aria-label="Nama program" required /><Input name="domain" defaultValue={value("domain")} aria-label="Domain program" required /><Input name="description" defaultValue={value("description")} aria-label="Deskripsi program" required /></>}
      {editing.kind === "pathway" && <><Input name="name" defaultValue={value("name")} aria-label="Nama pathway" required /><Input name="type" defaultValue={value("type")} aria-label="Tipe pathway" required /><Input name="outcome" defaultValue={value("outcome")} aria-label="Outcome pathway" required /></>}
      {editing.kind === "cohort" && <><Input name="name" defaultValue={value("name")} aria-label="Nama cohort" required /><Input name="startsOn" type="date" defaultValue={value("startsOn")} aria-label="Tanggal mulai cohort" /><Input name="endsOn" type="date" defaultValue={value("endsOn")} aria-label="Tanggal selesai cohort" /></>}
      {editing.kind === "enrollment" && <><label className="grid gap-1 text-sm">Pathway<select name="pathwayId" defaultValue={value("pathwayId")} className="h-10 rounded-md border bg-background px-3">{pathways.data?.map(pathway => <option key={pathway.id} value={pathway.id}>{pathway.name}</option>)}</select></label><label className="grid gap-1 text-sm">Trainer<select name="trainerId" defaultValue={value("trainerId")} className="h-10 rounded-md border bg-background px-3"><option value="">Tidak ditugaskan</option>{users.data?.filter(user => user.roles.includes("trainer")).map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label><label className="grid gap-1 text-sm">Assessor<select name="assessorId" defaultValue={value("assessorId")} className="h-10 rounded-md border bg-background px-3"><option value="">Tidak ditugaskan</option>{users.data?.filter(user => user.roles.includes("assessor")).map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label><label className="grid gap-1 text-sm">Cohort<select name="cohortId" defaultValue={value("cohortId")} className="h-10 rounded-md border bg-background px-3"><option value="">Tanpa cohort</option>{cohorts.data?.map(cohort => <option key={cohort.id} value={cohort.id}>{cohort.name}</option>)}</select></label></>}
      {editing.kind === "knowledge" && <><select name="category" defaultValue={value("category")} className="h-10 rounded-md border bg-background px-3"><option value="help">Help Desk</option><option value="energy">TERAS & Energi</option></select><Input name="title" defaultValue={value("title")} required aria-label="Judul artikel" /><textarea name="body" defaultValue={value("body")} required className="min-h-32 rounded-md border bg-background p-3 text-sm" aria-label="Isi artikel" /><AudienceSelector selected={Array.isArray(editing.item.audience) ? editing.item.audience as string[] : []} /></>}
      {editing.kind === "knowledge" ? <p className="text-sm text-muted-foreground">Status saat ini: {value("status")}. Mengedit artikel terbit membuat versi draft baru; versi lama tetap terlihat sampai draft diterbitkan.</p> : <label className="grid gap-1 text-sm">Status<select name="status" defaultValue={value("status")} className="h-10 rounded-md border bg-background px-3" data-testid="select-edit-status">{(editing.kind === "user" || editing.kind === "enrollment" ? ["active", "inactive", ...(editing.kind === "enrollment" ? ["completed"] : [])] : ["active", "archived"]).map(status => <option key={status} value={status}>{status}</option>)}</select></label>}
      <DialogFooter><Button type="submit" disabled={updateUser.isPending || updateProgram.isPending || updatePathway.isPending || updateCohort.isPending || updateEnrollment.isPending || updateKnowledge.isPending || rolesMutation.isPending} data-testid="button-save-admin-edit">Simpan perubahan</Button></DialogFooter>
    </form>}</DialogContent></Dialog>
  </div>;
}

type AdminTab = "summary" | "users" | "programs" | "pathways" | "cohorts" | "enrollments" | "knowledge" | "audit";
type SummaryQuery = { data?: AdminOperationalSummary; isLoading: boolean; error: unknown };

function OperationalSummary({ summary, onOpenTab }: { summary: SummaryQuery; onOpenTab: (tab: AdminTab) => void }) {
  return <State loading={summary.isLoading} error={summary.error} empty={!summary.data}>
    {summary.data && <div className="space-y-6" data-testid="admin-operational-summary">
      <section aria-labelledby="platform-pulse-title">
        <div className="mb-3 flex items-center justify-between gap-3"><div><h2 id="platform-pulse-title" className="text-lg font-semibold">Kondisi platform</h2><p className="text-sm text-muted-foreground">Snapshot operasional dari data aktif.</p></div><span className="text-xs text-muted-foreground">Diperbarui {auditTime(summary.data.generatedAt)}</span></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{summary.data.metrics.map(metric => <Card key={metric.id}><CardContent className="p-5"><p className="text-sm font-medium text-muted-foreground">{metric.label}</p><p className="mt-2 text-3xl font-bold tabular-nums">{metric.value}</p><p className="mt-2 text-xs text-muted-foreground">{metric.description}</p></CardContent></Card>)}</div>
      </section>
      <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <Card className={summary.data.bottleneck.count > 0 ? "border-amber-500/40 bg-amber-500/5" : ""}>
          <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" />Bottleneck lifecycle</CardTitle></CardHeader>
          <CardContent><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-2xl font-bold">{summary.data.bottleneck.label}</p><p className="mt-1 max-w-xl text-sm text-muted-foreground">{summary.data.bottleneck.description}</p></div><div className="text-right"><p className="text-4xl font-bold tabular-nums">{summary.data.bottleneck.count}</p><Button className="mt-3" size="sm" onClick={() => onOpenTab(summary.data!.bottleneck.targetTab)}>Buka enrollment<ArrowRight className="ml-2 h-4 w-4" /></Button></div></div></CardContent>
        </Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><UsersRound className="h-5 w-5" />Assignment belum lengkap</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-2 gap-3"><div className="rounded-lg border p-3"><p className="text-sm text-muted-foreground">Tanpa trainer</p><p className="mt-1 text-2xl font-bold">{summary.data.incompleteAssignments.trainer}</p></div><div className="rounded-lg border p-3"><p className="text-sm text-muted-foreground">Tanpa assessor</p><p className="mt-1 text-2xl font-bold">{summary.data.incompleteAssignments.assessor}</p></div></div><Button variant="outline" className="w-full" onClick={() => onOpenTab("enrollments")}>Kelola assignment</Button></CardContent></Card>
      </div>
      <section aria-labelledby="queues-title"><h2 id="queues-title" className="mb-3 text-lg font-semibold">Antrean operasional</h2><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{summary.data.queues.map(queue => <Card key={queue.id}><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><ClipboardCheck className="h-5 w-5 text-primary" /><Badge variant={queue.count ? "default" : "secondary"}>{queue.count}</Badge></div><h3 className="mt-4 font-semibold">{queue.label}</h3><p className="mt-1 min-h-10 text-xs text-muted-foreground">{queue.description}</p><Button variant="ghost" size="sm" className="mt-3 -ml-3" onClick={() => onOpenTab(queue.targetTab)}>Tindak lanjuti<ArrowRight className="ml-2 h-4 w-4" /></Button></CardContent></Card>)}</div></section>
      <Card><CardHeader><CardTitle>Tindakan berikutnya</CardTitle></CardHeader><CardContent>{summary.data.actions.length ? <div className="divide-y">{summary.data.actions.map(action => <div key={action.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><Badge variant={action.urgency === "critical" ? "destructive" : action.urgency === "attention" ? "default" : "secondary"} className="h-fit">{action.count}</Badge><div><p className="font-medium">{action.label}</p><p className="text-sm text-muted-foreground">{action.description}</p></div></div><Button size="sm" variant="outline" onClick={() => onOpenTab(action.targetTab)}>Buka</Button></div>)}</div> : <p className="text-sm text-muted-foreground">Tidak ada tindakan mendesak. Semua assignment dan antrean lifecycle dalam kondisi bersih.</p>}</CardContent></Card>
    </div>}
  </State>;
}

function AudienceSelector({ selected = ["learner", "trainer", "assessor", "admin"] }: { selected?: string[] }) {
  return <fieldset className="flex flex-wrap gap-3"><legend className="text-sm font-medium">Audiens</legend>{roles.map(role => <label key={role} className="flex items-center gap-1 text-sm"><input name="audience" type="checkbox" value={role} defaultChecked={selected.includes(role)} />{role}</label>)}</fieldset>;
}

function EntitySection({ title, onSubmit, fields, loading, error, items, onEdit, onArchive }: { title: string; onSubmit: (e: FormEvent<HTMLFormElement>) => void; fields: ReactNode[]; loading: boolean; error: unknown; items?: Array<{ id: string; name: string; detail: string; status: string; [key: string]: unknown }>; onEdit: (item: { id: string; name: string; detail: string; status: string; [key: string]: unknown }) => void; onArchive: (item: { id: string; name: string; detail: string; status: string; [key: string]: unknown }) => void }) {
  return <><Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent><form onSubmit={onSubmit} className="flex flex-wrap gap-3">{fields}<Button type="submit" data-testid={`button-create-${title.toLowerCase().replaceAll(" ", "-")}`}><Plus className="mr-2 h-4 w-4" />Tambah</Button></form></CardContent></Card><State loading={loading} error={error} empty={!items?.length}><div className="grid gap-3">{items?.map(item => <Card key={item.id} data-testid={`row-admin-${item.id}`}><CardContent className="flex items-center justify-between gap-3 p-4"><div><strong>{item.name}</strong><p className="text-sm text-muted-foreground">{item.detail}</p></div><div className="flex items-center gap-2"><Badge variant={item.status === "active" ? "default" : "secondary"}>{item.status}</Badge><Button size="sm" variant="outline" onClick={() => onEdit(item)} data-testid={`button-edit-${item.id}`}>Edit</Button><Button size="sm" variant="outline" disabled={item.status !== "active"} onClick={() => onArchive(item)} data-testid={`button-archive-${item.id}`}><Archive className="mr-1 h-3.5 w-3.5" />Arsipkan</Button></div></CardContent></Card>)}</div></State></>;
}