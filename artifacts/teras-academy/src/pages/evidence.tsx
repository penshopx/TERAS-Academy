import { useListEvidence } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, Plus, FileText, CheckCircle, Clock, XCircle } from "lucide-react";

export default function Evidence() {
  const { data: evidenceList, isLoading, error } = useListEvidence();

  if (isLoading) {
    return <div className="h-full flex items-center justify-center"><Activity className="w-8 h-8 text-primary animate-pulse" /></div>;
  }

  if (error || !evidenceList) {
    return <div className="text-destructive">Failed to load evidence portfolio.</div>;
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'VALID': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'REVIEW': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'REVISION': return <XCircle className="w-4 h-4 text-destructive" />;
      default: return <FileText className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'VALID': return 'success';
      case 'REVIEW': return 'warning';
      case 'REVISION': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Evidence Portfolio</h1>
          <p className="text-muted-foreground mt-1 text-sm">Submitted artifacts mapped to capability criteria</p>
        </div>
        <Button className="font-mono text-xs">
          <Plus className="w-4 h-4 mr-2" /> UPLOAD EVIDENCE
        </Button>
      </div>

      <Card className="cockpit-panel border-border/50">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-background/80">
              <TableRow>
                <TableHead className="w-[300px]">Title & Module</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Quality Checks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {evidenceList.map((record) => (
                <TableRow key={record.id} className="hover:bg-muted/30">
                  <TableCell>
                    <div className="font-medium text-sm">{record.title}</div>
                    <div className="text-xs text-muted-foreground font-mono mt-1">{record.moduleName}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono text-[10px]">{record.type}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {new Date(record.submittedAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(record.status)}
                      <Badge variant={getStatusVariant(record.status) as any} className="font-mono text-[10px] uppercase">
                        {record.status}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <div title="Valid" className={`w-2 h-2 rounded-full ${record.quality.valid ? 'bg-green-500' : 'bg-muted'}`} />
                      <div title="Relevant" className={`w-2 h-2 rounded-full ${record.quality.relevant ? 'bg-green-500' : 'bg-muted'}`} />
                      <div title="Sufficient" className={`w-2 h-2 rounded-full ${record.quality.sufficient ? 'bg-green-500' : 'bg-muted'}`} />
                      <div title="Traceable" className={`w-2 h-2 rounded-full ${record.quality.traceable ? 'bg-green-500' : 'bg-muted'}`} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {evidenceList.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground font-mono text-sm">
                    NO EVIDENCE RECORDS FOUND
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
