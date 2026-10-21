import React from "react";
import { useChanges, useScanChanges } from "@/hooks/use-di-api";
import { useDataset } from "@/hooks/use-dataset";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, Zap, ArrowUpRight, ArrowDownRight, Minus, AlertTriangle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const SeverityBadge = ({ severity }: { severity: string }) => {
  const config = {
    high: { color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/20", icon: AlertTriangle },
    medium: { color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/20", icon: Activity },
    low: { color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/20", icon: Minus },
  }[severity] || { color: "text-muted-foreground", bg: "bg-muted", border: "border-border", icon: Minus };

  const Icon = config.icon;

  return (
    <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest border", config.bg, config.color, config.border)}>
      <Icon className="w-3 h-3" />
      {severity}
    </div>
  );
};

export default function WhatChangedPage() {
  const { selectedDatasetId } = useDataset();
  const { data, isLoading } = useChanges(selectedDatasetId);
  const scanMutation = useScanChanges();

  const handleScan = () => {
    if (selectedDatasetId === null) return;
    scanMutation.mutate({ datasetId: selectedDatasetId });
  };

  const scans = data?.scans || [];

  return (
    <div className="flex flex-col h-full overflow-hidden max-w-5xl mx-auto w-full px-6 py-8">
      <div className="mb-8 flex items-end justify-between flex-shrink-0">
        <div>
          <h1 className="text-3xl font-light tracking-tight mb-2">What Changed</h1>
          <p className="text-muted-foreground max-w-2xl">
            Detect narrative shifts, anomalies, and momentum changes since the last telemetry scan.
          </p>
        </div>
        <Button 
          onClick={handleScan}
          disabled={scanMutation.isPending || selectedDatasetId === null}
          className="gap-2 relative overflow-hidden group"
          size="lg"
        >
          <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
          {scanMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin relative z-10" />
          ) : (
            <Zap className="w-4 h-4 relative z-10" />
          )}
          <span className="relative z-10">Run Scan Now</span>
        </Button>
      </div>

      {scanMutation.error && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm flex items-center gap-3 flex-shrink-0">
          <AlertTriangle className="w-5 h-5" />
          <div>
            <p className="font-semibold">Scan Failed</p>
            <p className="opacity-90">{(scanMutation.error as any).message || "Could not complete the telemetry scan."}</p>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 relative border border-border/50 rounded-xl bg-card/30 overflow-hidden flex flex-col">
        {/* Header Bar */}
        <div className="h-12 border-b border-border/50 bg-muted/20 flex items-center justify-between px-6 flex-shrink-0">
          <div className="text-xs font-mono text-muted-foreground">
            {isLoading ? "Loading history..." : `History: ${scans.length} scans`}
          </div>
          <div className="text-xs font-mono flex items-center gap-2">
            <span className="text-muted-foreground">Last baseline:</span>
            <span className="text-foreground">{data?.lastSnapshotAt ? new Date(data.lastSnapshotAt).toLocaleString() : "None"}</span>
          </div>
        </div>

        <ScrollArea className="flex-1 p-6">
          {isLoading ? (
             <div className="flex justify-center items-center h-40">
               <Loader2 className="w-8 h-8 animate-spin text-muted-foreground/30" />
             </div>
          ) : scans.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Activity className="w-12 h-12 mb-4 text-muted-foreground/30" />
              <h3 className="text-lg font-medium text-foreground mb-1">No Scans Yet</h3>
              <p className="text-sm text-muted-foreground">Run a scan to detect changes in the active dataset.</p>
            </div>
          ) : (
            <div className="space-y-12 pb-10">
              <AnimatePresence>
                {scans.map((scan, i) => (
                  <motion.div 
                    key={scan.snapshotId}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="relative pl-8"
                  >
                    {/* Timeline Line */}
                    <div className="absolute left-[11px] top-8 bottom-[-48px] w-px bg-border/50"></div>
                    
                    {/* Timeline Dot */}
                    <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full bg-background border-2 border-primary flex items-center justify-center z-10 shadow-[0_0_10px_rgba(var(--primary),0.3)]">
                      <div className="w-2 h-2 rounded-full bg-primary"></div>
                    </div>

                    <div className="mb-6 flex items-center gap-3">
                      <h3 className="text-sm font-mono uppercase tracking-widest text-primary">Scan {scan.snapshotId}</h3>
                      <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
                        {formatDistanceToNow(new Date(scan.createdAt), { addSuffix: true })}
                      </span>
                    </div>

                    {scan.noNewData ? (
                      <div className="bg-card/50 border border-border/50 rounded-lg p-5 flex items-center gap-4 text-muted-foreground">
                        <CheckCircle2 className="w-5 h-5 text-green-500/70" />
                        <p className="text-sm">No significant data changes detected since previous snapshot. Baseline maintained.</p>
                      </div>
                    ) : (
                      <div className="grid gap-4">
                        {scan.changes.map((change) => (
                          <div key={change.id} className="bg-card border border-border/50 rounded-xl p-5 hover:border-primary/30 transition-colors group">
                            <div className="flex justify-between items-start mb-4">
                              <div className="flex items-center gap-3">
                                <SeverityBadge severity={change.severity} />
                                <h4 className="font-medium text-foreground">{change.label}</h4>
                              </div>
                              
                              <div className="flex items-center gap-3 font-mono text-sm">
                                <span className="text-muted-foreground">{change.previous.toLocaleString()}</span>
                                <span className="text-muted-foreground">→</span>
                                <span className="text-foreground font-bold">{change.current.toLocaleString()}</span>
                                
                                <div className={cn(
                                  "flex items-center px-2 py-0.5 rounded ml-2",
                                  change.delta > 0 ? "bg-green-500/10 text-green-500" : "bg-destructive/10 text-destructive"
                                )}>
                                  {change.delta > 0 ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                                  {Math.abs(change.delta).toLocaleString()}
                                </div>
                              </div>
                            </div>
                            
                            <p className="text-sm text-muted-foreground/80 leading-relaxed border-l-2 border-primary/30 pl-4 py-1">
                              {change.explanation}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
