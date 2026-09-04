import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { AuthoringSelection } from "./types";
import { useApplyCourseAuthoringCommand, getPreviewAuthoredCourseQueryKey, useRequestManagedResourceUploadUrl, getValidateAuthoredCourseQueryKey, getListAuthoredCourseVersionsQueryKey, getListCourseAuthoringAuditQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { UploadCloud } from "lucide-react";

interface AuthoringEditorProps {
  courseId: string;
  selected: AuthoringSelection | null;
}

export function AuthoringEditor({ courseId, selected }: AuthoringEditorProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const applyCommand = useApplyCourseAuthoringCommand();
  const getUploadUrl = useRequestManagedResourceUploadUrl();
  const form = useForm({ defaultValues: selected?.item || {} });
  const [uploading, setUploading] = useState(false);

  // Reset form when selection changes
  useEffect(() => {
    if (selected) {
      form.reset(selected.item);
    }
  }, [selected, form]);

  if (!selected) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground font-mono text-sm uppercase">
        Select an item in the tree to edit
      </div>
    );
  }

  const onSubmit = async (data: Record<string, any>) => {
    try {
      // Data cleanup
      if (entity === "RESOURCE") {
        if (!data.uri || data.uri.trim() === "") data.uri = null;
      }
      if (entity === "ACTIVITY" && data.metadata?.practiceTaskId === "") {
        data.metadata.practiceTaskId = null;
      }
      
      await applyCommand.mutateAsync({
        data: {
          action: "UPDATE",
          entity: selected.entity,
          courseId,
          id: selected.id,
          data
        }
      });
      queryClient.invalidateQueries({ queryKey: getPreviewAuthoredCourseQueryKey(courseId) });
      queryClient.invalidateQueries({ queryKey: getValidateAuthoredCourseQueryKey(courseId) });
      queryClient.invalidateQueries({ queryKey: getListAuthoredCourseVersionsQueryKey(courseId) });
      queryClient.invalidateQueries({ queryKey: getListCourseAuthoringAuditQueryKey(courseId) });

      toast({ title: "Saved", description: `${selected.entity} updated successfully.` });
    } catch (err: any) {
      toast({ title: "Failed to save", description: err?.response?.data?.message || err.message, variant: "destructive" });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const { uploadURL, objectPath } = await getUploadUrl.mutateAsync({
        data: {
          name: file.name.replace(/[^a-zA-Z0-9.-]/g, '_'),
          size: file.size,
          contentType: file.type as any
        }
      });

      const res = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type
        }
      });

      if (!res.ok) throw new Error("Failed to upload file to storage");

      await applyCommand.mutateAsync({
        data: {
          action: "UPDATE",
          entity: "RESOURCE",
          courseId,
          id: selected.id,
          data: { objectPath, mimeType: file.type }
        }
      });

      form.setValue("objectPath", objectPath);
      form.setValue("mimeType", file.type);
      queryClient.invalidateQueries({ queryKey: getPreviewAuthoredCourseQueryKey(courseId) });
      toast({ title: "Upload successful", description: "File attached to resource." });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message || "Could not complete upload", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const { entity } = selected;
  const isPending = applyCommand.isPending;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="border-b border-border/50 pb-4 mb-4 shrink-0">
        <h3 className="text-lg font-bold font-mono tracking-tight text-foreground uppercase" data-testid={`editor-title-${entity}`}>{entity} CONFIGURATION</h3>
        <p className="text-xs text-muted-foreground font-mono mt-1" data-testid="editor-id">ID: {selected.id}</p>
      </div>
      
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar min-h-0">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            
            {/* STATUS FIELD FOR MOST ENTITIES */}
            {['COURSE', 'COURSE_MODULE', 'LESSON', 'ACTIVITY'].includes(entity) && (
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem><FormLabel className="font-mono text-xs text-primary">STATUS</FormLabel>
                  <Select value={field.value || 'DRAFT'} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger className="bg-black/20 font-mono text-xs w-48" data-testid="select-status"><SelectValue placeholder="Status" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {["DRAFT", "ACTIVE", "ARCHIVED"].map(t => (
                        <SelectItem key={t} value={t} className="font-mono text-xs" data-testid={`item-status-${t}`}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                <FormMessage /></FormItem>
              )} />
            )}

            {/* COURSE FIELDS */}
            {entity === "COURSE" && (
              <>
                <FormField control={form.control} name="title" render={({ field }) => (
                  <FormItem><FormLabel className="font-mono text-xs text-primary">TITLE</FormLabel><FormControl><Input {...field} className="bg-black/20" data-testid="input-course-title" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem><FormLabel className="font-mono text-xs text-primary">DESCRIPTION</FormLabel><FormControl><Textarea {...field} className="h-32 bg-black/20" data-testid="input-course-description" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="programId" render={({ field }) => (
                  <FormItem><FormLabel className="font-mono text-xs text-primary">PROGRAM ID</FormLabel><FormControl><Input {...field} className="bg-black/20 font-mono text-xs" data-testid="input-course-program" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="pathwayId" render={({ field }) => (
                  <FormItem><FormLabel className="font-mono text-xs text-primary">PATHWAY ID</FormLabel><FormControl><Input {...field} className="bg-black/20 font-mono text-xs" data-testid="input-course-pathway" /></FormControl><FormMessage /></FormItem>
                )} />
              </>
            )}

            {/* MODULE FIELDS */}
            {entity === "COURSE_MODULE" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="moduleCode" render={({ field }) => (
                    <FormItem><FormLabel className="font-mono text-xs text-primary">MODULE CODE</FormLabel><FormControl><Input {...field} className="bg-black/20 uppercase font-mono" data-testid="input-module-code" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="moduleId" render={({ field }) => (
                    <FormItem><FormLabel className="font-mono text-xs text-primary">REFERENCE MODULE ID</FormLabel><FormControl><Input {...field} className="bg-black/20 font-mono text-xs" data-testid="input-module-ref" /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="moduleName" render={({ field }) => (
                  <FormItem><FormLabel className="font-mono text-xs text-primary">MODULE NAME</FormLabel><FormControl><Input {...field} className="bg-black/20" data-testid="input-module-name" /></FormControl><FormMessage /></FormItem>
                )} />
              </>
            )}

            {/* LESSON FIELDS */}
            {entity === "LESSON" && (
              <>
                <FormField control={form.control} name="title" render={({ field }) => (
                  <FormItem><FormLabel className="font-mono text-xs text-primary">TITLE</FormLabel><FormControl><Input {...field} className="bg-black/20" data-testid="input-lesson-title" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem><FormLabel className="font-mono text-xs text-primary">DESCRIPTION</FormLabel><FormControl><Textarea {...field} className="h-24 bg-black/20" data-testid="input-lesson-desc" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="estimatedDurationMinutes" render={({ field }) => (
                  <FormItem><FormLabel className="font-mono text-xs text-primary">DURATION (MINUTES)</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} className="bg-black/20 w-32" data-testid="input-lesson-duration" /></FormControl><FormMessage /></FormItem>
                )} />
              </>
            )}

            {/* ACTIVITY FIELDS */}
            {entity === "ACTIVITY" && (
              <>
                <FormField control={form.control} name="type" render={({ field }) => (
                  <FormItem><FormLabel className="font-mono text-xs text-primary">ACTIVITY TYPE</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger className="bg-black/20 font-mono text-xs" data-testid="select-activity-type"><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {["READING", "VIDEO", "AUDIO", "INTERACTIVE", "QUIZ", "ASSIGNMENT", "DISCUSSION", "LIVE_SESSION", "WORKSHOP", "REFLECTION", "PRACTICE_PREPARATION"].map(t => (
                          <SelectItem key={t} value={t} className="font-mono text-xs" data-testid={`item-activity-type-${t}`}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  <FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="title" render={({ field }) => (
                  <FormItem><FormLabel className="font-mono text-xs text-primary">TITLE</FormLabel><FormControl><Input {...field} className="bg-black/20" data-testid="input-activity-title" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem><FormLabel className="font-mono text-xs text-primary">DESCRIPTION</FormLabel><FormControl><Textarea {...field} className="h-24 bg-black/20" data-testid="input-activity-desc" /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="estimatedDurationMinutes" render={({ field }) => (
                    <FormItem><FormLabel className="font-mono text-xs text-primary">DURATION (MINUTES)</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} className="bg-black/20" data-testid="input-activity-duration" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="required" render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border border-border/50 p-4 bg-black/10">
                      <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} data-testid="checkbox-activity-required" /></FormControl>
                      <FormLabel className="font-mono text-xs leading-none">REQUIRED FOR GATE</FormLabel>
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="metadata.practiceTaskId" render={({ field }) => (
                  <FormItem><FormLabel className="font-mono text-xs text-primary">PRACTICE TASK ID (OPTIONAL)</FormLabel><FormControl><Input {...field} value={field.value || ''} className="bg-black/20 font-mono text-xs" data-testid="input-activity-practice-id" /></FormControl><FormMessage /></FormItem>
                )} />
              </>
            )}

            {/* RESOURCE FIELDS */}
            {entity === "RESOURCE" && (
              <>
                <FormField control={form.control} name="type" render={({ field }) => (
                  <FormItem><FormLabel className="font-mono text-xs text-primary">RESOURCE TYPE</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger className="bg-black/20 font-mono text-xs" data-testid="select-resource-type"><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {["PDF", "VIDEO", "AUDIO", "DOCUMENT", "LINK", "IMAGE", "TEXT"].map(t => (
                          <SelectItem key={t} value={t} className="font-mono text-xs" data-testid={`item-resource-type-${t}`}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  <FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="title" render={({ field }) => (
                  <FormItem><FormLabel className="font-mono text-xs text-primary">TITLE</FormLabel><FormControl><Input {...field} className="bg-black/20" data-testid="input-resource-title" /></FormControl><FormMessage /></FormItem>
                )} />
                
                {form.watch("type") === "TEXT" ? (
                  <FormField control={form.control} name="content" render={({ field }) => (
                    <FormItem><FormLabel className="font-mono text-xs text-primary">CONTENT</FormLabel><FormControl><Textarea {...field} className="h-48 bg-black/20 font-mono text-sm" data-testid="input-resource-content" /></FormControl><FormMessage /></FormItem>
                  )} />
                ) : form.watch("type") === "LINK" ? (
                  <FormField control={form.control} name="uri" render={({ field }) => (
                    <FormItem><FormLabel className="font-mono text-xs text-primary">EXTERNAL URI</FormLabel><FormControl><Input {...field} value={field.value || ''} className="bg-black/20" placeholder="https://..." data-testid="input-resource-uri" /></FormControl><FormMessage /></FormItem>
                  )} />
                ) : (
                  <div className="rounded-md border border-border/50 p-4 bg-black/10 space-y-3">
                    <FormLabel className="font-mono text-xs text-primary block">MANAGED FILE</FormLabel>
                    <div className="flex items-center gap-3">
                      <Input type="file" accept={form.watch("type") === "PDF" ? "application/pdf" : form.watch("type") === "IMAGE" ? "image/*" : form.watch("type") === "VIDEO" ? "video/*" : form.watch("type") === "AUDIO" ? "audio/*" : undefined} onChange={handleFileUpload} disabled={uploading} className="bg-black/20 flex-1 text-xs" data-testid="input-resource-file" />
                      {uploading && <span className="text-xs font-mono text-primary animate-pulse flex items-center gap-1"><UploadCloud className="w-3 h-3" /> UPLOADING...</span>}
                    </div>
                    <FormField control={form.control} name="objectPath" render={({ field }) => (
                      <div className="text-[10px] font-mono text-muted-foreground truncate" data-testid="text-resource-path">{field.value ? `Path: ${field.value}` : 'No file attached'}</div>
                    )} />
                  </div>
                )}
              </>
            )}

            {/* OUTCOME FIELDS */}
            {entity === "OUTCOME" && (
              <>
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem><FormLabel className="font-mono text-xs text-primary">OUTCOME DESCRIPTION</FormLabel><FormControl><Textarea {...field} className="h-24 bg-black/20" data-testid="input-outcome-desc" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="capabilityModuleId" render={({ field }) => (
                  <FormItem><FormLabel className="font-mono text-xs text-primary">CAPABILITY MODULE ID (OPTIONAL)</FormLabel><FormControl><Input {...field} value={field.value || ''} className="bg-black/20 font-mono text-xs" data-testid="input-outcome-capability" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="verificationMethod" render={({ field }) => (
                  <FormItem><FormLabel className="font-mono text-xs text-primary">VERIFICATION METHOD</FormLabel><FormControl><Input {...field} className="bg-black/20" data-testid="input-outcome-verification" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="required" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border border-border/50 p-4 bg-black/10">
                    <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} data-testid="checkbox-outcome-required" /></FormControl>
                    <FormLabel className="font-mono text-xs leading-none">REQUIRED</FormLabel>
                  </FormItem>
                )} />
              </>
            )}

            <Button type="submit" disabled={isPending || uploading} className="w-full font-bold tracking-wider shrink-0 mt-6" data-testid={`button-save-${entity}`}>
              {isPending ? "SAVING..." : "SAVE CONFIGURATION"}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
