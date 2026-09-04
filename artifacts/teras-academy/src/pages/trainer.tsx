import { useGetTrainerDashboard } from "@workspace/api-client-react";
import { Activity } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReviewQueue } from "@/components/trainer/review-queue";
import { CourseAuthoring } from "@/components/trainer/authoring/course-authoring";

export default function TrainerDesk() {
  const { data: dashboard, isLoading, error } = useGetTrainerDashboard();

  if (isLoading) return <div className="h-full flex items-center justify-center"><Activity className="w-8 h-8 text-primary animate-pulse" /></div>;
  if (error || !dashboard) return <div className="text-destructive">Failed to load trainer dashboard.</div>;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Tabs defaultValue="queue" className="w-full">
        <TabsList className="grid w-[400px] grid-cols-2 mb-6 bg-black/40 border border-border/50">
          <TabsTrigger value="queue" className="font-mono text-xs tracking-wider uppercase data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            Review Queue
          </TabsTrigger>
          <TabsTrigger value="authoring" className="font-mono text-xs tracking-wider uppercase data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            Course Authoring
          </TabsTrigger>
        </TabsList>
        <TabsContent value="queue" className="mt-0">
          <ReviewQueue dashboard={dashboard} />
        </TabsContent>
        <TabsContent value="authoring" className="mt-0 h-[calc(100vh-180px)]">
          <CourseAuthoring />
        </TabsContent>
      </Tabs>
    </div>
  );
}
