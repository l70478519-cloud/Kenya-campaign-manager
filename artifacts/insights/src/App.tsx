import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import PollsList from "@/pages/polls-list";
import PollBuilder from "@/pages/poll-builder";
import ResultsDashboard from "@/pages/results-dashboard";
import PublicPoll from "@/pages/public-poll";
import VolunteerRegister from "@/pages/volunteer-register";
import InsightsHub from "@/pages/insights-hub";
import { BarChart2, ClipboardList, Brain } from "lucide-react";
import { cn } from "@/lib/utils";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30000 },
  },
});

function Sidebar() {
  const [location] = useLocation();
  const navItems = [
    { href: "/", label: "Polls", icon: ClipboardList },
    { href: "/insights-hub", label: "AI Insights", icon: Brain },
  ];

  return (
    <aside className="w-56 shrink-0 border-r bg-sidebar h-full flex flex-col">
      <div className="px-4 py-4 border-b">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <BarChart2 className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-sidebar-foreground leading-none">ACL AI OS</p>
            <p className="text-xs text-muted-foreground">INSIGHTS</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const active = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <span
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors",
                  active
                    ? "bg-indigo-50 text-indigo-700 font-medium"
                    : "text-sidebar-foreground hover:bg-muted/50",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen flex flex-col">
      <header className="h-12 border-b bg-background flex items-center px-4 shrink-0">
        <p className="text-sm font-semibold text-foreground">ACL AI OS · INSIGHTS</p>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6 bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}

function InnerRouter() {
  return (
    <Switch>
      <Route path="/p/:shareToken" component={PublicPoll} />
      <Route path="/volunteer" component={VolunteerRegister} />
      <Route>
        <AppLayout>
          <Switch>
            <Route path="/" component={PollsList} />
            <Route path="/insights-hub" component={InsightsHub} />
            <Route path="/polls/:id/build" component={PollBuilder} />
            <Route path="/polls/:id/results" component={ResultsDashboard} />
            <Route component={NotFound} />
          </Switch>
        </AppLayout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <InnerRouter />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
