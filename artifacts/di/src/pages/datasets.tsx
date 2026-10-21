import React, { useState } from "react";
import { Activity } from "lucide-react";
import { useDatasets, useDatasetDetail, useUploadDataset, useDeleteDataset } from "@/hooks/use-di-api";
import { useDataset } from "@/hooks/use-dataset";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Database, Upload, Trash2, FileSpreadsheet, AlertTriangle, Layers, Calendar, ChevronRight, CheckCircle2, Loader2, Table as TableIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function DatasetsPage() {
  const { data: datasets, isLoading } = useDatasets();
  const { selectedDatasetId, setSelectedDatasetId } = useDataset();
  const deleteDataset = useDeleteDataset();
  const uploadDataset = useUploadDataset();
  const { toast } = useToast();

  const [activeTabId, setActiveTabId] = useState<number | null>(selectedDatasetId);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  React.useEffect(() => {
    if (!activeTabId && selectedDatasetId) {
      setActiveTabId(selectedDatasetId);
    }
  }, [selectedDatasetId, activeTabId]);

  const handleSelectDataset = (id: number) => {
    setActiveTabId(id);
    setSelectedDatasetId(id);
  };

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteDataset.mutate(id, {
      onSuccess: () => {
        toast({
          title: "Dataset deleted",
          description: "The dataset has been permanently removed.",
        });
        if (selectedDatasetId === id) {
          const builtin = datasets?.find(d => d.sourceType === 'builtin');
          if (builtin) setSelectedDatasetId(builtin.id);
        }
        if (activeTabId === id) {
          const builtin = datasets?.find(d => d.sourceType === 'builtin');
          if (builtin) setActiveTabId(builtin.id);
        }
      }
    });
  };

  const activeDataset = datasets?.find(d => d.id === activeTabId);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar List */}
      <div className="w-80 border-r border-border/50 bg-card/30 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <h2 className="font-medium text-sm uppercase tracking-wider font-mono">Data Sources</h2>
          <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="default" className="h-8 gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                Upload
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <UploadDatasetForm onSuccess={() => setIsUploadOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>

        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 bg-muted/40 animate-pulse rounded-lg border border-border/50"></div>
              ))}
            </div>
          ) : datasets?.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
              <Database className="w-8 h-8 mb-3 opacity-20" />
              <p className="text-sm">No datasets available.</p>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              <AnimatePresence>
                {datasets?.map(dataset => (
                  <motion.div
                    key={dataset.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className={cn(
                      "cursor-pointer border rounded-lg p-3 transition-all duration-200 group relative",
                      activeTabId === dataset.id 
                        ? "bg-primary/10 border-primary/30 shadow-[0_0_10px_rgba(var(--primary),0.1)]" 
                        : "bg-card/50 border-border/50 hover:bg-muted/50 hover:border-border"
                    )}
                    onClick={() => handleSelectDataset(dataset.id)}
                  >
                    {activeTabId === dataset.id && (
                       <motion.div 
                        layoutId="active-ds"
                        className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l-lg"
                      />
                    )}
                    
                    <div className="flex justify-between items-start mb-2 pl-2">
                      <div className="flex flex-col gap-1 overflow-hidden">
                        <h3 className={cn("text-sm font-medium truncate", activeTabId === dataset.id ? "text-primary" : "text-foreground")}>
                          {dataset.name}
                        </h3>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground truncate">{dataset.sector}</span>
                          {dataset.sourceType === "builtin" && (
                            <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded uppercase tracking-wider font-mono">Built-in</span>
                          )}
                        </div>
                      </div>
                      
                      {dataset.sourceType !== "builtin" && (
                        <button 
                          onClick={(e) => handleDelete(dataset.id, e)}
                          className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-colors p-1"
                          aria-label="Delete dataset"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Main View */}
      <div className="flex-1 bg-background relative flex flex-col min-w-0">
        {!activeDataset ? (
           <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/50">
             <Database className="w-16 h-16 mb-4 opacity-20" />
             <p>Select a dataset to view details</p>
           </div>
        ) : (
          <DatasetDetailView dataset={activeDataset} />
        )}
      </div>
    </div>
  );
}

function UploadDatasetForm({ onSuccess }: { onSuccess: () => void }) {
  const uploadDataset = useUploadDataset();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !name || !sector) return;
    
    uploadDataset.mutate({ file, name, sector, description }, {
      onSuccess: () => {
        onSuccess();
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
      <DialogHeader>
        <DialogTitle>Upload Dataset</DialogTitle>
      </DialogHeader>
      
      {uploadDataset.error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>{(uploadDataset.error as any).message || "Upload failed."}</p>
        </div>
      )}
      
      <div className="space-y-2">
        <Label htmlFor="file">CSV or Excel File</Label>
        <Input 
          id="file" 
          type="file" 
          accept=".csv,.xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          required
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="name">Dataset Name</Label>
        <Input 
          id="name" 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          placeholder="e.g., Q3 Sales Data" 
          required 
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="sector">Sector / Domain</Label>
        <Input 
          id="sector" 
          value={sector} 
          onChange={(e) => setSector(e.target.value)} 
          placeholder="e.g., Retail, Healthcare, Education" 
          required 
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="description">Description (Optional)</Label>
        <Textarea 
          id="description" 
          value={description} 
          onChange={(e) => setDescription(e.target.value)} 
          placeholder="Briefly describe what this data represents..." 
          className="resize-none"
          rows={3}
        />
      </div>
      
      <DialogFooter className="pt-4">
        <Button type="submit" disabled={!file || !name || !sector || uploadDataset.isPending} className="w-full gap-2">
          {uploadDataset.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          {uploadDataset.isPending ? "Uploading & Analyzing..." : "Upload & Analyze"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function DatasetDetailView({ dataset }: { dataset: any }) {
  const { data: detail, isLoading } = useDatasetDetail(dataset.id);
  const { setSelectedDatasetId } = useDataset();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground/30" />
      </div>
    );
  }

  const isBuiltin = dataset.sourceType === "builtin";

  return (
    <ScrollArea className="flex-1 h-full">
      <div className="max-w-5xl mx-auto px-8 py-10">
        <div className="flex items-start justify-between mb-8 pb-6 border-b border-border">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-mono uppercase tracking-widest bg-primary/20 text-primary px-2 py-1 rounded border border-primary/30">
                {isBuiltin ? "Live Telemetry" : "Static Dataset"}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono px-2 py-1 rounded bg-muted/50 border border-border">
                {dataset.sector}
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{dataset.name}</h1>
            {dataset.description && (
              <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">{dataset.description}</p>
            )}
            <div className="flex items-center gap-4 mt-4 text-xs font-mono text-muted-foreground">
              <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Added {formatDistanceToNow(new Date(dataset.createdAt), { addSuffix: true })}</span>
              <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> {dataset.rowCount.toLocaleString()} Rows</span>
            </div>
          </div>
          
          <div className="flex flex-col gap-2 items-end">
            <Button 
              variant="default" 
              className="gap-2"
              onClick={() => setSelectedDatasetId(dataset.id)}
            >
              <CheckCircle2 className="w-4 h-4" /> Set as Active Context
            </Button>
          </div>
        </div>

        {isBuiltin ? (
          <div className="bg-card/50 border border-primary/20 rounded-xl p-8 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mb-4 shadow-[0_0_15px_rgba(var(--primary),0.2)]">
               <Activity className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">Live Campaign Telemetry</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              This dataset is directly wired to live campaign operations. It automatically synchronizes with voter registration, field operations, and social sentiment.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 w-full max-w-3xl">
               <div className="bg-background border border-border/50 rounded-lg p-4 text-left">
                  <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">Voters</div>
                  <div className="text-xl text-foreground">Live Feed</div>
               </div>
               <div className="bg-background border border-border/50 rounded-lg p-4 text-left">
                  <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">Wards</div>
                  <div className="text-xl text-foreground">Live Feed</div>
               </div>
               <div className="bg-background border border-border/50 rounded-lg p-4 text-left">
                  <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">Polling</div>
                  <div className="text-xl text-foreground">Live Feed</div>
               </div>
               <div className="bg-background border border-border/50 rounded-lg p-4 text-left">
                  <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">Sentiment</div>
                  <div className="text-xl text-foreground">Live Feed</div>
               </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-medium flex items-center gap-2 mb-4">
                <TableIcon className="w-5 h-5 text-muted-foreground" />
                Data Schema
              </h3>
              <div className="bg-card/50 border border-border/50 rounded-xl overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow className="border-border/50">
                      <TableHead className="w-1/3">Column Name</TableHead>
                      <TableHead className="w-1/3">Key</TableHead>
                      <TableHead>Data Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail?.columns.map(col => (
                      <TableRow key={col.key} className="border-border/50">
                        <TableCell className="font-medium text-sm">{col.label}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{col.key}</TableCell>
                        <TableCell>
                          <span className={cn(
                            "text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded",
                            col.type === 'number' ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" :
                            col.type === 'date' ? "bg-green-500/10 text-green-400 border border-green-500/20" :
                            "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                          )}>
                            {col.type}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {detail?.preview && detail.preview.length > 0 && (
              <div>
                <h3 className="text-lg font-medium flex items-center gap-2 mb-4">
                  <FileSpreadsheet className="w-5 h-5 text-muted-foreground" />
                  Data Preview (First {detail.preview.length} Rows)
                </h3>
                <div className="bg-card/50 border border-border/50 rounded-xl overflow-hidden overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow className="border-border/50">
                        {detail.columns.map(col => (
                          <TableHead key={col.key} className="whitespace-nowrap font-mono text-xs uppercase tracking-wider">{col.label}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.preview.map((row, i) => (
                        <TableRow key={i} className="border-border/50 hover:bg-muted/10">
                          {detail.columns.map(col => (
                            <TableCell key={col.key} className="text-sm whitespace-nowrap">
                              {row[col.key] !== undefined && row[col.key] !== null ? row[col.key].toString() : <span className="text-muted-foreground opacity-50">-</span>}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
