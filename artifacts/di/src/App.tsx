import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Layout from "@/components/layout";
import AskPage from "@/pages/ask";
import BriefingsPage from "@/pages/briefings";
import WhatChangedPage from "@/pages/what-changed";
import DatasetsPage from "@/pages/datasets";
import { DatasetProvider } from "@/hooks/use-dataset";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={AskPage} />
        <Route path="/datasets" component={DatasetsPage} />
        <Route path="/briefings" component={BriefingsPage} />
        <Route path="/what-changed" component={WhatChangedPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  // Use exact base path resolution based on standard Replit Vite setup
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <DatasetProvider>
          <WouterRouter base={base}>
            <Router />
          </WouterRouter>
        </DatasetProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
