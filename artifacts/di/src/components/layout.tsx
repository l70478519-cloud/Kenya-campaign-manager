import React from "react";
import { Link, useLocation } from "wouter";
import { useOverview, useDatasets } from "@/hooks/use-di-api";
import { useDataset } from "@/hooks/use-dataset";
import { 
  Activity, 
  BarChart2, 
  FileText, 
  Cpu, 
  Database,
  MessageSquare,
  Layers,
  ChevronDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@radix-ui/react-scroll-area";

function StatItem({ icon: Icon, label, value, isLoading }: { icon: any, label: string, value: React.ReactNode, isLoading: boolean }) {
  return (
    <div className="flex flex-col space-y-1">
      <div className="flex items-center text-muted-foreground text-xs font-mono uppercase tracking-wider">
        <Icon className="w-3 h-3 mr-1.5 opacity-70" />
        {label}
      </div>
      <div className="text-lg font-medium text-foreground tracking-tight">
        {isLoading ? <div className="h-6 w-16 bg-muted/30 animate-pulse rounded" /> : value}
      </div>
    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: overview, isLoading } = useOverview();
  const { data: datasets } = useDatasets();
  const { selectedDatasetId, setSelectedDatasetId } = useDataset();

  const selectedDataset = datasets?.find(d => d.id === selectedDatasetId);

  const navItems = [
    { href: "/", icon: MessageSquare, label: "Ask Intelligence" },
    { href: "/datasets", icon: Database, label: "Data Sources" },
    { href: "/briefings", icon: FileText, label: "Briefings Library" },
    { href: "/what-changed", icon: Activity, label: "What Changed" },
  ];

  return (
    <div className="flex min-h-[100dvh] w-full bg-background text-foreground overflow-hidden selection:bg-primary/30 font-sans">
      {/* Sidebar */}
      <aside className="w-72 border-r border-border/50 bg-card/30 backdrop-blur-xl flex flex-col flex-shrink-0 z-20 relative">
        <div className="absolute inset-0 pointer-events-none opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+')] mix-blend-overlay"></div>
        
        <div className="p-6 pb-4 border-b border-border/50 relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-primary/20 p-2 rounded-lg text-primary border border-primary/30 shadow-[0_0_15px_rgba(var(--primary),0.4)]">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight tracking-tight uppercase">ACL AI <span className="text-primary font-mono font-light">DI OS</span></h1>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Decision Intelligence</p>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono mb-1">Active Context</div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-full flex items-center justify-between bg-black/40 hover:bg-black/60 border border-border/50 rounded-md px-3 py-2 text-sm text-left transition-colors">
                  <div className="flex items-center gap-2 truncate">
                    <Database className="w-4 h-4 text-primary shrink-0" />
                    <span className="truncate font-medium">{selectedDataset?.name || "Select Dataset..."}</span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[240px]" align="start">
                <DropdownMenuLabel className="text-xs uppercase font-mono tracking-widest text-muted-foreground">Available Datasets</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <ScrollArea className="max-h-[300px]">
                  {datasets?.map(dataset => (
                    <DropdownMenuItem 
                      key={dataset.id}
                      onClick={() => setSelectedDatasetId(dataset.id)}
                      className="flex flex-col items-start gap-1 py-2 cursor-pointer"
                    >
                      <div className="flex items-center w-full justify-between">
                        <span className="font-medium truncate">{dataset.name}</span>
                        {dataset.sourceType === "builtin" && (
                          <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded uppercase tracking-wider font-mono">Built-in</span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground truncate w-full">{dataset.sector}</span>
                    </DropdownMenuItem>
                  ))}
                </ScrollArea>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <nav className="flex-1 py-6 px-4 space-y-2 relative z-10">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} className="block">
                <div className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-all duration-200 group relative overflow-hidden",
                  isActive 
                    ? "bg-primary/10 text-primary font-medium" 
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}>
                  {isActive && (
                    <motion.div 
                      layoutId="active-nav"
                      className="absolute left-0 top-0 bottom-0 w-1 bg-primary shadow-[0_0_10px_rgba(var(--primary),0.8)]" 
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  <item.icon className={cn("w-4 h-4", isActive ? "text-primary" : "opacity-70 group-hover:opacity-100")} />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-6 border-t border-border/50 bg-black/20 relative z-10">
          <div className="flex items-center gap-2 mb-4 text-xs font-mono uppercase tracking-widest text-muted-foreground">
            <Activity className="w-3 h-3 text-primary" />
            System Telemetry
          </div>
          <div className="grid grid-cols-2 gap-4">
            <StatItem 
              icon={Database} 
              label="Datasets" 
              value={overview?.datasets?.toLocaleString() || "0"} 
              isLoading={isLoading} 
            />
            <StatItem 
              icon={Layers} 
              label="Data Rows" 
              value={overview?.datasetRows?.toLocaleString() || "0"} 
              isLoading={isLoading} 
            />
            <StatItem 
              icon={MessageSquare} 
              label="Queries" 
              value={overview?.questionsAnswered?.toLocaleString() || "0"} 
              isLoading={isLoading} 
            />
            <StatItem 
              icon={FileText} 
              label="Briefs" 
              value={overview?.briefings?.toLocaleString() || "0"} 
              isLoading={isLoading} 
            />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0 z-10 bg-background/95">
        <div className="absolute inset-0 pointer-events-none z-[-1] overflow-hidden">
          <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-20%] left-[-10%] w-[40%] h-[50%] bg-cyan-900/10 rounded-full blur-[100px]" />
        </div>
        
        <header className="h-16 border-b border-border/30 flex items-center px-8 justify-between flex-shrink-0 bg-background/50 backdrop-blur-sm z-10">
          <div className="flex items-center">
             <div className="h-2 w-2 rounded-full bg-primary mr-2 shadow-[0_0_8px_rgba(var(--primary),0.8)] animate-pulse"></div>
             <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">System Online • Ready</span>
          </div>
          <div className="text-xs font-mono text-muted-foreground/50">
            {new Date().toISOString().split('T')[0]} / {new Date().toTimeString().split(' ')[0]}
          </div>
        </header>
        
        <div className="flex-1 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={location}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full flex flex-col"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
