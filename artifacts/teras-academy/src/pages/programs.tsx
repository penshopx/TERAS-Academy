import { useListPrograms } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, Book, Users, Layers } from "lucide-react";
import { Link } from "wouter";

export default function Programs() {
  const { data: programs, isLoading, error } = useListPrograms();

  if (isLoading) {
    return <div className="h-full flex items-center justify-center"><Activity className="w-8 h-8 text-primary animate-pulse" /></div>;
  }

  if (error || !programs) {
    return <div className="text-destructive">Failed to load programs.</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Capability Catalogue</h1>
        <p className="text-muted-foreground mt-1 text-sm">Available training domains and programs</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {programs.map((program) => (
          <Card key={program.id} className="flex flex-col h-full hover-elevate">
            <CardHeader>
              <div className="flex justify-between items-start mb-2">
                <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground border-border uppercase">
                  {program.domain}
                </Badge>
                <Badge variant={program.status === "ACTIVE" ? "default" : "secondary"} className="text-[10px] uppercase">
                  {program.status}
                </Badge>
              </div>
              <CardTitle className="text-xl leading-tight">{program.name}</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <p className="text-sm text-muted-foreground mb-6 line-clamp-3">
                {program.description}
              </p>
              
              <div className="mt-auto space-y-4">
                <div className="flex gap-4 border-t border-border pt-4">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                    <Layers className="w-4 h-4 text-primary" />
                    <span>{program.moduleCount} MODS</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                    <Users className="w-4 h-4 text-primary" />
                    <span>{program.learnerCount} USERS</span>
                  </div>
                </div>
                
                <Link href={`/programs/${program.id}`} className="block">
                  <Button variant="outline" className="w-full">
                    View Details
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
