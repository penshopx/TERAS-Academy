import { useListAuthoredCourses, getListAuthoredCoursesQueryKey, useApplyCourseAuthoringCommand } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Plus, Settings, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function CourseSelector({ selectedId, onSelect }: { selectedId?: string; onSelect: (id: string | undefined) => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useListAuthoredCourses();
  const applyCommand = useApplyCourseAuthoringCommand();
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newProgramId, setNewProgramId] = useState("");
  const [newPathwayId, setNewPathwayId] = useState("");
  const [newSequence, setNewSequence] = useState("");
  const [apiError, setApiError] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);

  const handleCreate = async () => {
    setApiError("");
    try {
      const res = await applyCommand.mutateAsync({
        data: {
          action: "CREATE",
          entity: "COURSE",
          courseId: "new",
          data: { 
            title: newTitle.trim(),
            description: newDescription.trim(),
            programId: newProgramId.trim(),
            pathwayId: newPathwayId.trim(),
            sequence: newSequence ? Number(newSequence) : undefined
          }
        }
      });
      queryClient.invalidateQueries({ queryKey: getListAuthoredCoursesQueryKey() });
      toast({ title: "Course Created", description: "New course created successfully." });
      setCreateOpen(false);
      setNewTitle("");
      setNewDescription("");
      setNewProgramId("");
      setNewPathwayId("");
      setNewSequence("");
      if (res.id) onSelect(res.id);
    } catch (err: any) {
      setApiError(err?.response?.data?.message || err.message);
      toast({ title: "Failed to create", description: err?.response?.data?.message || err.message, variant: "destructive" });
    }
  };

  const handleDuplicate = async () => {
    if (!selectedId) return;
    try {
      const res = await applyCommand.mutateAsync({
        data: {
          action: "DUPLICATE",
          entity: "COURSE",
          courseId: selectedId,
          id: selectedId,
        }
      });
      queryClient.invalidateQueries({ queryKey: getListAuthoredCoursesQueryKey() });
      toast({ title: "Course Duplicated", description: "Course duplicated successfully." });
      if (res.id) onSelect(res.id);
    } catch (err: any) {
      toast({ title: "Failed to duplicate", description: err?.response?.data?.message || err.message, variant: "destructive" });
    }
  };

  const handleArchive = async () => {
    if (!selectedId) return;
    try {
      await applyCommand.mutateAsync({
        data: {
          action: "ARCHIVE",
          entity: "COURSE",
          courseId: selectedId,
          id: selectedId,
        }
      });
      queryClient.invalidateQueries({ queryKey: getListAuthoredCoursesQueryKey() });
      toast({ title: "Course Archived", description: "Course archived successfully." });
      onSelect(undefined);
      setArchiveOpen(false);
    } catch (err: any) {
      toast({ title: "Failed to archive", description: err?.response?.data?.message || err.message, variant: "destructive" });
    }
  };

  return (
    <div className="flex items-center gap-2">
      {isLoading ? (
        <Activity className="w-4 h-4 animate-pulse text-primary" data-testid="status-loading-courses" />
      ) : (
        <Select value={selectedId || ""} onValueChange={onSelect}>
          <SelectTrigger data-testid="select-course" className="w-[300px] md:w-[350px] font-mono text-xs bg-black/40 border-primary/30 text-primary uppercase tracking-wider focus:ring-primary/50">
            <SelectValue placeholder="SELECT COURSE TO AUTHOR" />
          </SelectTrigger>
          <SelectContent>
            {data?.map(c => (
              <SelectItem key={c.id} value={c.id} className={`font-mono text-xs uppercase ${c.status === "ARCHIVED" ? "text-muted-foreground line-through opacity-70" : ""}`} data-testid={`item-course-${c.id}`}>
                {c.status === "ARCHIVED" ? "[ARCHIVED] " : ""}{c.title || c.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Button size="icon" variant="outline" className="border-primary/30 bg-black/40 text-primary hover:bg-primary/20 hover:text-primary" onClick={() => setCreateOpen(true)} data-testid="button-create-course-dialog">
        <Plus className="w-4 h-4" />
      </Button>

      {selectedId && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="outline" className="border-primary/30 bg-black/40 text-primary hover:bg-primary/20 hover:text-primary" data-testid="button-course-actions">
              <Settings className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleDuplicate} data-testid="button-duplicate-course">
              <Copy className="w-4 h-4 mr-2" /> Duplicate Course
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setArchiveOpen(true)} className="text-destructive" data-testid="button-archive-course">
              <Trash2 className="w-4 h-4 mr-2" /> Archive Course
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Course</DialogTitle>
            <DialogDescription>Define the required catalog mapping attributes to scaffold the course.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {apiError && (
              <Alert variant="destructive" className="py-2">
                <AlertDescription data-testid="error-course-create">{apiError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <label className="text-xs font-mono text-primary uppercase tracking-wider" htmlFor="input-new-course-program">Program ID *</label>
              <Input id="input-new-course-program" placeholder="e.g. PRG-2024" value={newProgramId} onChange={e => setNewProgramId(e.target.value)} className="font-mono text-sm" data-testid="input-new-course-program" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-mono text-primary uppercase tracking-wider" htmlFor="input-new-course-pathway">Pathway ID *</label>
              <Input id="input-new-course-pathway" placeholder="e.g. PTH-101" value={newPathwayId} onChange={e => setNewPathwayId(e.target.value)} className="font-mono text-sm" data-testid="input-new-course-pathway" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-mono text-primary uppercase tracking-wider" htmlFor="input-new-course-title">Title *</label>
              <Input id="input-new-course-title" placeholder="Course Title" value={newTitle} onChange={e => setNewTitle(e.target.value)} className="font-mono text-sm" data-testid="input-new-course-title" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-mono text-primary uppercase tracking-wider" htmlFor="input-new-course-desc">Description *</label>
              <Textarea id="input-new-course-desc" placeholder="Course Description" value={newDescription} onChange={e => setNewDescription(e.target.value)} className="font-mono text-sm min-h-[80px]" data-testid="input-new-course-desc" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-mono text-primary uppercase tracking-wider" htmlFor="input-new-course-sequence">Sequence *</label>
              <Input id="input-new-course-sequence" type="number" placeholder="e.g. 1" value={newSequence} onChange={e => setNewSequence(e.target.value)} className="font-mono text-sm" data-testid="input-new-course-sequence" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newTitle.trim() || !newDescription.trim() || !newProgramId.trim() || !newPathwayId.trim() || !newSequence.trim() || applyCommand.isPending} data-testid="button-submit-new-course">
              {applyCommand.isPending ? "Creating..." : "Create Course"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will archive the current working draft. If a previous version is already published, it will remain unaffected and visible to learners.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-archive-course">
              {applyCommand.isPending ? "Archiving..." : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
