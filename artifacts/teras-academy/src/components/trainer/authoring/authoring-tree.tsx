import { ChevronRight, ChevronDown, Plus, GripVertical, FileText, Layout, BookOpen, PenTool, ArrowUp, ArrowDown, Copy, Trash2, Link, Target } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { AuthoringSelection, AuthoringEntityType } from "./types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { 
  useApplyCourseAuthoringCommand, 
  getPreviewAuthoredCourseQueryKey, 
  getListAuthoredCoursesQueryKey,
  getValidateAuthoredCourseQueryKey,
  getListAuthoredCourseVersionsQueryKey,
  getListCourseAuthoringAuditQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { LearningCourse, LearningCourseModule, LearningLesson, LearningActivity, LearningResource, LearningOutcome } from "@workspace/api-client-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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

interface AuthoringTreeProps {
  course: LearningCourse;
  selected: AuthoringSelection | null;
  onSelect: (sel: AuthoringSelection) => void;
}

export function AuthoringTree({ course, selected, onSelect }: AuthoringTreeProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const applyCommand = useApplyCourseAuthoringCommand();
  const [archiveTarget, setArchiveTarget] = useState<{entity: AuthoringEntityType, id: string} | null>(null);
  const [addModuleTarget, setAddModuleTarget] = useState<{ courseId: string } | null>(null);
  const [newModuleId, setNewModuleId] = useState("");
  const [newModuleSequence, setNewModuleSequence] = useState("");

  const invalidateAll = (courseId: string) => {
    queryClient.invalidateQueries({ queryKey: getPreviewAuthoredCourseQueryKey(courseId) });
    queryClient.invalidateQueries({ queryKey: getValidateAuthoredCourseQueryKey(courseId) });
    queryClient.invalidateQueries({ queryKey: getListAuthoredCourseVersionsQueryKey(courseId) });
    queryClient.invalidateQueries({ queryKey: getListCourseAuthoringAuditQueryKey(courseId) });
  };

  const handleAction = async (action: 'CREATE' | 'REORDER' | 'DUPLICATE' | 'ARCHIVE', entity: AuthoringEntityType, id: string | undefined, data: any) => {
    try {
      const res = await applyCommand.mutateAsync({
        data: {
          action,
          entity,
          courseId: course.id,
          id,
          data
        }
      });
      invalidateAll(course.id);
      if (action === 'CREATE' && entity === 'COURSE') {
        queryClient.invalidateQueries({ queryKey: getListAuthoredCoursesQueryKey() });
      }
      
      toast({ title: "Command applied", description: `${action} ${entity} successful` });
      
      if (action === 'CREATE' && res.id) {
        // We cannot immediately provide full item, but we can set ID to select it.
        // It will be loaded correctly via previewData since it is invalidated.
        onSelect({ entity, id: res.id, parentId: id, item: {} });
      }
      
    } catch (err: any) {
      toast({ title: "Command failed", description: err?.response?.data?.message || err.message, variant: "destructive" });
    }
  };

  const handleAddModule = async () => {
    if (!addModuleTarget) return;
    try {
      const res = await applyCommand.mutateAsync({
        data: {
          action: 'CREATE',
          entity: 'COURSE_MODULE',
          courseId: course.id,
          id: undefined,
          data: {
            moduleId: newModuleId.trim(),
            sequence: newModuleSequence ? Number(newModuleSequence) : undefined
          }
        }
      });
      invalidateAll(course.id);
      toast({ title: "Module Created", description: "Course module added successfully." });
      if (res.id) {
        onSelect({ entity: 'COURSE_MODULE', id: res.id, parentId: course.id, item: {} });
      }
      setAddModuleTarget(null);
      setNewModuleId("");
      setNewModuleSequence("");
    } catch (err: any) {
      toast({ title: "Command failed", description: err?.response?.data?.message || err.message, variant: "destructive" });
    }
  };

  const handleArchiveConfirm = async () => {
    if (!archiveTarget) return;
    await handleAction('ARCHIVE', archiveTarget.entity, archiveTarget.id, {});
    setArchiveTarget(null);
  };

  const TreeNode = ({ entity, id, parentId, label, icon: Icon, children, item, isCourse = false, isArchived = false }: any) => {
    const [expanded, setExpanded] = useState(true);
    const isSelected = selected?.id === id && selected?.entity === entity;
    
    return (
      <div className="w-full">
        <div 
          className={cn(
            "flex items-center gap-2 py-1.5 px-2 rounded-md group cursor-pointer text-sm font-medium transition-colors",
            isSelected ? "bg-primary/20 text-primary" : "hover:bg-white/5 text-muted-foreground hover:text-foreground",
            isArchived && !isSelected ? "opacity-50" : ""
          )}
          onClick={(e) => { e.stopPropagation(); onSelect({ entity, id, parentId, item }); }}
          data-testid={`tree-node-${entity}-${id}`}
        >
          <div className="w-4 h-4 flex items-center justify-center shrink-0 text-muted-foreground/50">
            {children && children.length > 0 && (
              <div onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
                {expanded ? <ChevronDown className="w-4 h-4 hover:text-primary transition-colors" /> : <ChevronRight className="w-4 h-4 hover:text-primary transition-colors" />}
              </div>
            )}
          </div>
          <Icon className={cn("w-4 h-4 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
          <span className={cn("truncate flex-1 font-mono text-xs", isArchived ? "line-through text-muted-foreground" : "")}>
            {isArchived ? "[ARCHIVED] " : ""}{label || `Untitled ${entity}`}
          </span>
          
          <div className="hidden group-focus-within:flex group-hover:flex items-center gap-1 shrink-0 bg-background/80 backdrop-blur-sm rounded-sm px-1">
            {!isCourse && (
              <>
                <button title="Move Up" className="p-1 hover:text-primary transition-colors focus:outline-none focus:ring-1 focus:ring-primary" onClick={(e) => { e.stopPropagation(); handleAction('REORDER', entity, id, { direction: 'UP' }); }} data-testid={`button-up-${id}`}><ArrowUp className="w-3 h-3" /></button>
                <button title="Move Down" className="p-1 hover:text-primary transition-colors focus:outline-none focus:ring-1 focus:ring-primary" onClick={(e) => { e.stopPropagation(); handleAction('REORDER', entity, id, { direction: 'DOWN' }); }} data-testid={`button-down-${id}`}><ArrowDown className="w-3 h-3" /></button>
              </>
            )}
            
            {entity === 'ACTIVITY' ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button title="Add Child" className="p-1 hover:text-primary transition-colors focus:outline-none focus:ring-1 focus:ring-primary" onClick={e => e.stopPropagation()} data-testid={`button-add-child-${id}`}>
                    <Plus className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleAction('CREATE', 'RESOURCE', undefined, { parentId: id }); }} data-testid={`button-add-resource-${id}`}>Add Resource</DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleAction('CREATE', 'OUTCOME', undefined, { parentId: id }); }} data-testid={`button-add-outcome-${id}`}>Add Outcome</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : entity !== 'RESOURCE' && entity !== 'OUTCOME' ? (
              <button title="Add Child" className="p-1 hover:text-primary transition-colors focus:outline-none focus:ring-1 focus:ring-primary" onClick={(e) => { 
                e.stopPropagation(); 
                if (entity === 'COURSE') {
                  setAddModuleTarget({ courseId: id });
                } else {
                  const childEntity = entity === 'COURSE_MODULE' ? 'LESSON' : entity === 'LESSON' ? 'ACTIVITY' : null;
                  if (childEntity) {
                    handleAction('CREATE', childEntity as AuthoringEntityType, undefined, { parentId: id });
                  }
                }
              }} data-testid={`button-add-child-${id}`}>
                <Plus className="w-3 h-3" />
              </button>
            ) : null}

            {!isCourse && (
              <>
                <button title="Duplicate" className="p-1 hover:text-primary transition-colors focus:outline-none focus:ring-1 focus:ring-primary" onClick={(e) => { e.stopPropagation(); handleAction('DUPLICATE', entity, id, {}); }} data-testid={`button-duplicate-${id}`}><Copy className="w-3 h-3" /></button>
                <button title="Archive" className="p-1 hover:text-destructive transition-colors focus:outline-none focus:ring-1 focus:ring-destructive" onClick={(e) => { 
                  e.stopPropagation(); 
                  setArchiveTarget({ entity, id });
                }} data-testid={`button-archive-${id}`}><Trash2 className="w-3 h-3" /></button>
              </>
            )}
          </div>
        </div>
        {expanded && children && children.length > 0 && (
          <div className="pl-6 border-l border-border/50 ml-4 mt-1 space-y-0.5">
            {children}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-1 py-2 overflow-y-auto max-h-[calc(100vh-200px)] pr-2 custom-scrollbar">
      <TreeNode entity="COURSE" id={course.id} label={course.title} icon={BookOpen} item={course} isCourse isArchived={course.status === "ARCHIVED"}>
        {course.modules?.map((mod: LearningCourseModule) => (
          <TreeNode key={mod.id} entity="COURSE_MODULE" id={mod.id} parentId={course.id} label={mod.moduleName} icon={Layout} item={mod}>
            {mod.lessons?.map((les: LearningLesson) => (
              <TreeNode key={les.id} entity="LESSON" id={les.id} parentId={mod.id} label={les.title} icon={FileText} item={les} isArchived={les.status === "ARCHIVED"}>
                {les.activities?.map((act: LearningActivity) => (
                  <TreeNode key={act.id} entity="ACTIVITY" id={act.id} parentId={les.id} label={act.title} icon={PenTool} item={act} isArchived={act.status === "ARCHIVED"}>
                    {act.resources?.map((res: LearningResource) => (
                      <TreeNode key={res.id} entity="RESOURCE" id={res.id} parentId={act.id} label={res.title} icon={Link} item={res} />
                    ))}
                    {act.outcomes?.map((out: LearningOutcome) => (
                      <TreeNode key={out.id} entity="OUTCOME" id={out.id} parentId={act.id} label={out.description.substring(0, 30)} icon={Target} item={out} />
                    ))}
                  </TreeNode>
                ))}
              </TreeNode>
            ))}
          </TreeNode>
        ))}
      </TreeNode>

      <AlertDialog open={!!archiveTarget} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Entity?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive this entity? This will mark the current draft entity as archived. Published versions remain unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchiveConfirm} className="bg-destructive hover:bg-destructive/90 text-white" data-testid="button-confirm-archive-entity">Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!addModuleTarget} onOpenChange={(open) => {
        if (!open) {
          setAddModuleTarget(null);
          setNewModuleId("");
          setNewModuleSequence("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Course Module</DialogTitle>
            <DialogDescription>
              Provide the canonical Module ID from the capability pathway catalog. This binds the course content to the capability requirements.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-mono text-primary uppercase tracking-wider">Module ID *</label>
              <Input 
                placeholder="e.g. MOD-01" 
                value={newModuleId} 
                onChange={e => setNewModuleId(e.target.value)} 
                className="font-mono text-sm"
                data-testid="input-new-module-id"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-mono text-primary uppercase tracking-wider">Sequence (Optional)</label>
              <Input 
                type="number"
                placeholder="e.g. 1" 
                value={newModuleSequence} 
                onChange={e => setNewModuleSequence(e.target.value)} 
                className="font-mono text-sm"
                data-testid="input-new-module-sequence"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddModuleTarget(null)}>Cancel</Button>
            <Button onClick={handleAddModule} disabled={!newModuleId.trim() || applyCommand.isPending} data-testid="button-submit-new-module">
              {applyCommand.isPending ? "Adding..." : "Add Module"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
