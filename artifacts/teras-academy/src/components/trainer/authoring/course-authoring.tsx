import { useState } from "react";
import { CourseSelector } from "./course-selector";
import { usePreviewAuthoredCourse, getPreviewAuthoredCourseQueryKey } from "@workspace/api-client-react";
import { AuthoringTree } from "./authoring-tree";
import { AuthoringEditor } from "./authoring-editor";
import { ValidationPanel } from "./validation-panel";
import { AuthoringSelection } from "./types";
import { Activity } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function CourseAuthoring() {
  const [selectedCourseId, setSelectedCourseId] = useState<string | undefined>();
  const [selection, setSelection] = useState<AuthoringSelection | null>(null);

  const { data: previewData, isLoading, error } = usePreviewAuthoredCourse(
    selectedCourseId!, 
    { query: { enabled: !!selectedCourseId, queryKey: getPreviewAuthoredCourseQueryKey(selectedCourseId!) } }
  );

  return (
    <div className="flex flex-col h-full gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div className="flex items-center justify-between border border-primary/30 bg-black/60 px-5 py-4 rounded-lg shadow-[0_0_20px_rgba(0,195,255,0.15)] shrink-0 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="hidden md:flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 border border-primary/30 shadow-[0_0_10px_rgba(0,195,255,0.2)]">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold uppercase tracking-widest text-primary">Authoring Mode</h2>
            <p className="text-xs font-mono text-muted-foreground uppercase mt-0.5 tracking-wider">Construct learning topology</p>
          </div>
        </div>
        <CourseSelector selectedId={selectedCourseId} onSelect={(id) => { setSelectedCourseId(id); setSelection(null); }} />
      </div>

      {!selectedCourseId ? (
        <Card className="flex-1 border-dashed border-border/50 bg-black/40 flex flex-col items-center justify-center">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Activity className="h-8 w-8 text-primary/50" />
          </div>
          <div className="text-center text-muted-foreground font-mono text-sm uppercase tracking-widest">
            SELECT A COURSE TO BEGIN AUTHORING
          </div>
        </Card>
      ) : isLoading ? (
        <Card className="flex-1 bg-black/40 flex items-center justify-center border-border/50">
          <Activity className="w-8 h-8 text-primary animate-pulse" />
        </Card>
      ) : error || !previewData ? (
        <Card className="flex-1 bg-black/40 flex items-center justify-center border-border/50">
          <div className="text-destructive font-mono text-sm uppercase tracking-widest text-center">
            Failed to load course <br /> <span className="text-xs opacity-70">Check console or network</span>
          </div>
        </Card>
      ) : (
        <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
          
          {/* Outline Panel */}
          <Card className="w-[30%] min-w-[300px] bg-black/40 border-border/50 flex flex-col min-h-0 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-primary/50 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="p-4 border-b border-border/50 shrink-0 bg-card/50">
              <h3 className="text-xs font-bold font-mono tracking-widest text-primary uppercase">TOPOLOGY EXPLORER</h3>
            </div>
            <div className="p-2 flex-1 overflow-hidden min-h-0">
              <AuthoringTree 
                course={previewData.course} 
                selected={selection} 
                onSelect={setSelection} 
              />
            </div>
          </Card>

          {/* Editor Panel */}
          <Card className="w-[45%] bg-black/40 border-border/50 p-6 flex flex-col min-h-0 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-primary/50 opacity-0 group-hover:opacity-100 transition-opacity delay-100"></div>
            <AuthoringEditor courseId={previewData.course.id} selected={selection} />
          </Card>

          {/* Validation & Actions Panel */}
          <Card className="w-[25%] min-w-[300px] bg-black/40 border-border/50 p-6 flex flex-col min-h-0 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-primary/50 opacity-0 group-hover:opacity-100 transition-opacity delay-200"></div>
            <ValidationPanel courseId={previewData.course.id} />
          </Card>

        </div>
      )}
    </div>
  );
}
