import { CourseVersion, usePublishAuthoredCourse, getListAuthoredCoursesQueryKey, getPreviewAuthoredCourseQueryKey, useValidateAuthoredCourse, useListAuthoredCourseVersions, useListCourseAuthoringAudit, getListAuthoredCourseVersionsQueryKey, getListCourseAuthoringAuditQueryKey, getValidateAuthoredCourseQueryKey } from "@workspace/api-client-react";
import { AlertCircle, CheckCircle2, AlertTriangle, Send, Clock, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { QueryKey } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import React, { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";

interface ValidationPanelProps {
  courseId: string;
}

interface PublishAndRefreshDependencies {
  courseId: string;
  publish: (input: { courseId: string }) => Promise<CourseVersion>;
  invalidateQueries: (queryKey: QueryKey) => Promise<unknown>;
}

interface PublishAndRefreshResult {
  version: CourseVersion;
  historyRefreshFailed: boolean;
}

export async function publishAuthoredCourseAndRefresh({
  courseId,
  publish,
  invalidateQueries,
}: PublishAndRefreshDependencies): Promise<PublishAndRefreshResult> {
  const version = await publish({ courseId });

  const refreshResults = await Promise.allSettled([
    invalidateQueries(getListAuthoredCoursesQueryKey()),
    invalidateQueries(getPreviewAuthoredCourseQueryKey(courseId)),
    invalidateQueries(getListAuthoredCourseVersionsQueryKey(courseId)),
    invalidateQueries(getListCourseAuthoringAuditQueryKey(courseId)),
  ]);

  return {
    version,
    historyRefreshFailed:
      refreshResults[2].status === "rejected" ||
      refreshResults[3].status === "rejected",
  };
}

export function PublishSuccessMessage({ version }: { version: CourseVersion }) {
  return <>Authoring revision {version.authoringRevision} was published as immutable version {version.version}.</>;
}

export function HistoryRefreshWarning() {
  return (
    <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-left" role="alert" data-testid="alert-history-refresh-failed">
      <p className="text-sm font-semibold text-amber-500">Course published, but History could not be refreshed.</p>
      <p className="mt-1 text-xs text-muted-foreground">Open History and try reloading it to see the latest version and audit activity.</p>
    </div>
  );
}

export function PublishedVersionHistory({ versions }: { versions: CourseVersion[] | undefined }) {
  return (
    <div className="space-y-2">
      {versions?.length === 0 && <p className="text-xs text-muted-foreground font-mono">No published versions yet.</p>}
      {versions?.map((version) => (
        <div key={version.id} className="bg-black/20 border border-border/50 rounded-md p-2 flex justify-between items-center" data-testid={`version-item-${version.id}`}>
          <div>
            <p className="text-xs font-bold text-foreground font-mono">v{version.version}</p>
            <p className="text-[10px] text-muted-foreground font-mono">{format(new Date(version.publishedAt), "MMM dd, yyyy HH:mm")}</p>
            <p className="text-[10px] text-muted-foreground font-mono" data-testid={`text-authoring-revision-${version.id}`}>
              {version.authoringRevision === 0 ? "Authoring revision: Legacy version" : `Authoring revision: ${version.authoringRevision}`}
            </p>
          </div>
          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">{version.lifecycle}</span>
        </div>
      ))}
    </div>
  );
}

export function ValidationPanel({ courseId }: ValidationPanelProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const publishMutation = usePublishAuthoredCourse();
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [publishedVersion, setPublishedVersion] = useState<CourseVersion | null>(null);
  const [historyRefreshFailed, setHistoryRefreshFailed] = useState(false);

  const { data: validation } = useValidateAuthoredCourse(courseId, { query: { enabled: !!courseId, queryKey: getValidateAuthoredCourseQueryKey(courseId) } });
  const { data: versions } = useListAuthoredCourseVersions(courseId, { query: { enabled: !!courseId, queryKey: getListAuthoredCourseVersionsQueryKey(courseId) } });
  const { data: auditEvents } = useListCourseAuthoringAudit(courseId, { query: { enabled: !!courseId, queryKey: getListCourseAuthoringAuditQueryKey(courseId) } });

  const handlePublish = async () => {
    try {
      const result = await publishAuthoredCourseAndRefresh({
        courseId,
        publish: publishMutation.mutateAsync,
        invalidateQueries: (queryKey) => queryClient.invalidateQueries(
          { queryKey },
          { throwOnError: true },
        ),
      });
      setPublishedVersion(result.version);
      setHistoryRefreshFailed(result.historyRefreshFailed);
      toast({
        title: "Course Published",
        description: result.historyRefreshFailed
          ? `Version ${result.version.version} is published. History could not be refreshed; open History and try reloading it.`
          : `Authoring revision ${result.version.authoringRevision} was published as version ${result.version.version}.`,
      });
    } catch (err: any) {
      toast({ title: "Publish failed", description: err?.response?.data?.message || err.message, variant: "destructive" });
    }
  };

  const isPublishable = validation?.valid;

  return (
    <div className="h-full flex flex-col">
      <Tabs defaultValue="validation" className="w-full h-full flex flex-col">
        <TabsList className="grid w-full grid-cols-2 mb-4 bg-black/40 border border-border/50 shrink-0">
          <TabsTrigger value="validation" className="font-mono text-[10px] tracking-wider uppercase data-[state=active]:bg-primary/20 data-[state=active]:text-primary" data-testid="tab-validation">
            Validation
          </TabsTrigger>
          <TabsTrigger value="history" className="font-mono text-[10px] tracking-wider uppercase data-[state=active]:bg-primary/20 data-[state=active]:text-primary" data-testid="tab-history">
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="validation" className="mt-0 flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar min-h-0">
            {!validation ? (
              <div className="text-center text-xs text-muted-foreground font-mono mt-10">Running validation checks...</div>
            ) : (
              <>
                <div className="mb-4">
                  <div className="flex items-center gap-2" aria-live="polite">
                    <span className="flex h-2 w-2 rounded-full relative">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${validation.valid ? "bg-green-500" : "bg-destructive"}`}></span>
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${validation.valid ? "bg-green-500" : "bg-destructive"}`}></span>
                    </span>
                    <span className={`text-xs font-mono font-bold tracking-wider ${validation.valid ? "text-green-500" : "text-destructive"}`} data-testid="text-validation-status">
                      {validation.valid ? "READY FOR PUBLISH" : "VALIDATION FAILED"}
                    </span>
                  </div>
                </div>

                {/* Errors Block */}
                {validation.errors.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-mono font-bold text-destructive uppercase tracking-wider flex items-center gap-2">
                      <AlertCircle className="w-3.5 h-3.5" /> BLOCKERS ({validation.errors.length})
                    </h4>
                    <div className="space-y-2">
                      {validation.errors.map((err, i) => (
                        <div key={i} className="bg-destructive/10 border border-destructive/20 rounded-md p-3" data-testid={`validation-error-${i}`}>
                          <p className="text-sm font-semibold text-destructive/90">{err.message}</p>
                          {err.entityId && <p className="text-[10px] font-mono mt-1 text-destructive/60">Entity: {err.entityId}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Warnings Block */}
                {validation.warnings.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-mono font-bold text-amber-500 uppercase tracking-wider flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5" /> WARNINGS ({validation.warnings.length})
                    </h4>
                    <div className="space-y-2">
                      {validation.warnings.map((warn, i) => (
                        <div key={i} className="bg-amber-500/5 border border-amber-500/20 rounded-md p-3" data-testid={`validation-warning-${i}`}>
                          <p className="text-sm text-amber-500/90">{warn.message}</p>
                          {warn.entityId && <p className="text-[10px] font-mono mt-1 text-amber-500/60">Entity: {warn.entityId}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {validation.errors.length === 0 && validation.warnings.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 text-center border border-dashed border-border/50 rounded-lg bg-black/20" data-testid="validation-success">
                    <CheckCircle2 className="w-8 h-8 text-green-500 mb-2 opacity-80" />
                    <p className="text-sm font-bold text-foreground">All checks passed</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">Course structure is complete and ready for deployment.</p>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="pt-4 border-t border-border/50 mt-4 shrink-0">
            <Button 
              className="w-full font-bold tracking-widest uppercase bg-green-600 hover:bg-green-500 text-white disabled:opacity-50" 
              disabled={!isPublishable || publishMutation.isPending}
              onClick={() => {
                setPublishedVersion(null);
                setHistoryRefreshFailed(false);
                setConfirmPublish(true);
              }}
              data-testid="button-publish-course"
            >
              <Send className="w-4 h-4 mr-2" />
              PUBLISH COURSE
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-0 flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar min-h-0">
            
            <div className="space-y-2">
              <h4 className="text-[10px] font-mono font-bold text-primary uppercase tracking-widest flex items-center gap-2 border-b border-border/50 pb-2">
                <History className="w-3.5 h-3.5" /> PUBLISHED VERSIONS
              </h4>
              <PublishedVersionHistory versions={versions} />
            </div>

            <div className="space-y-2 pt-4">
              <h4 className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2 border-b border-border/50 pb-2">
                <Clock className="w-3.5 h-3.5" /> AUTHORING AUDIT LOG
              </h4>
              <div className="space-y-2 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border/50 before:to-transparent">
                {auditEvents?.length === 0 && <p className="text-xs text-muted-foreground font-mono text-center pt-2">No audit events found.</p>}
                {auditEvents?.map((event) => (
                  <div key={event.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group" data-testid={`audit-event-${event.id}`}>
                    <div className="flex items-center justify-center w-4 h-4 rounded-full border border-border bg-card shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 shadow-[0_0_10px_rgba(0,0,0,0.5)]">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/70"></div>
                    </div>
                    <div className="w-[calc(100%-2.5rem)] md:w-[calc(50%-1.25rem)] p-2 rounded border border-border/50 bg-black/20 text-left">
                      <p className="text-[10px] font-mono text-primary font-bold">{event.action}</p>
                      <p className="text-[9px] text-muted-foreground mt-0.5">{new Date(event.createdAt).toLocaleString()}</p>
                      {event.versionId && <p className="text-[9px] text-muted-foreground font-mono mt-0.5 opacity-70">Version: {event.versionId}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={confirmPublish} onOpenChange={setConfirmPublish}>
        <DialogContent className="border-border bg-background sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{publishedVersion ? "Course Published" : "Confirm Publish"}</DialogTitle>
            <DialogDescription>
              {publishedVersion
                ? <PublishSuccessMessage version={publishedVersion} />
                : "This will create a new immutable published version of the course. It will become instantly available to all enrolled learners on this pathway."}
            </DialogDescription>
            {publishedVersion && historyRefreshFailed && <HistoryRefreshWarning />}
          </DialogHeader>
          <DialogFooter className="mt-4">
            {publishedVersion ? (
              <Button onClick={() => setConfirmPublish(false)} data-testid="button-close-publish-confirmation">CLOSE</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setConfirmPublish(false)}>CANCEL</Button>
                <Button className="bg-green-600 hover:bg-green-500 text-white font-bold" onClick={handlePublish} disabled={publishMutation.isPending} data-testid="button-confirm-publish">
                  {publishMutation.isPending ? "PUBLISHING..." : "CONFIRM PUBLISH"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
