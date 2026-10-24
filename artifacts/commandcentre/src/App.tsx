import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Loader2, ShieldAlert } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";

import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Deepfake from "@/pages/deepfake";
import WaTemplates from "@/pages/wa-templates";
import Dashboard from "@/pages/dashboard";
import Members from "@/pages/members";
import Segments from "@/pages/segments";
import Messaging from "@/pages/messaging";
import FieldOps from "@/pages/field-ops";
import Volunteers from "@/pages/volunteers";
import VolunteerRegistration from "@/pages/volunteer-registration";
import Surveys from "@/pages/surveys";
import PublicPoll from "@/pages/public-poll";
import Events from "@/pages/events";
import Intelligence from "@/pages/intelligence";
import SocialListening from "@/pages/social-listening";
import Swot from "@/pages/swot";
import CampaignPlan from "@/pages/campaign-plan";
import KOL from "@/pages/kol";
import Fundraising from "@/pages/fundraising";
import ElectionDay from "@/pages/election-day";
import Turnout from "@/pages/turnout";
import Speeches from "@/pages/speeches";
import VotersDb from "@/pages/voters-db";
import Credentials from "@/pages/credentials";
import Admin from "@/pages/admin";
import Analytics from "@/pages/analytics";
import OperationsCentre from "@/pages/operations-centre";
import Strategist from "@/pages/strategist";
import ModuleRecords from "@/pages/module-records";
import CommandCentre from "@/pages/command-centre";
import SystemHealth from "@/pages/system-health";
import FeatureCatalogue from "@/pages/feature-catalogue";
import Security from "@/pages/security";
import { ChangePasswordForm } from "@/components/account-settings";
import TenancyAdmin from "@/pages/tenancy-admin";
import MyArea from "@/pages/my-area";
import { useTenancy, LEGACY_HREFS, legacyHidden } from "@/lib/tenancy";
import { applyCampaignGeography } from "@/lib/wards";
import { Layout } from "@/components/layout";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function FullscreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-6 h-6 text-primary animate-spin" />
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <ShieldAlert className="w-8 h-8 text-primary" />
      <p className="font-mono text-sm tracking-widest">[ ACCESS_DENIED ]</p>
      <p className="font-mono text-[10px] text-muted-foreground">You do not have permission to view this module.</p>
    </div>
  );
}

function Guarded({ module, component: Component }: { module: string; component: React.ComponentType }) {
  const { can } = useAuth();
  const [location] = useLocation();
  const { data: tenancy } = useTenancy();
  if (!can(module)) return <AccessDenied />;
  if (legacyHidden(tenancy) && LEGACY_HREFS.has(location)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
        <ShieldAlert className="w-8 h-8 text-primary" />
        <p className="text-sm max-w-md">This module still holds data for the primary campaign only, so it’s hidden while you work in another campaign. Use the Executive Command Centre and the modules in the menu, or switch campaigns at the top of the page.</p>
      </div>
    );
  }
  return <Component />;
}

function ProtectedRoutes() {
  const { user, loading, mfaEnrollmentRequired, passwordChangeRequired, logout } = useAuth();
  const [, setLocation] = useLocation();
  const tenancy = useTenancy();

  useEffect(() => {
    if (!loading && !user) setLocation("/login");
  }, [loading, user, setLocation]);

  if (loading) return <FullscreenLoader />;
  if (!user) return null;

  // A temporary password (first sign-in with the root email, or one issued by
  // an administrator) must be replaced before anything else.
  if (passwordChangeRequired) {
    return (
      <div className="min-h-screen bg-background text-foreground p-4 sm:p-8 flex flex-col items-center">
        <section className="w-full max-w-md kaiti-glass rounded-2xl p-5 space-y-4">
          <header className="space-y-1">
            <h1 className="text-xl font-bold">Set your own password</h1>
            <p className="text-sm text-muted-foreground">You signed in with a temporary password. Choose a new one that only you know. You can change your sign-in email later under Account security.</p>
          </header>
          <ChangePasswordForm forced />
        </section>
        <button type="button" onClick={() => void logout().then(() => setLocation("/login"))} className="mt-6 text-xs text-muted-foreground underline">Sign out</button>
      </div>
    );
  }

  // Roles that require 2FA see only the enrolment page until it's set up.
  if (mfaEnrollmentRequired) {
    return (
      <div className="min-h-screen bg-background text-foreground p-4 sm:p-8 flex flex-col items-center">
        <div className="w-full max-w-2xl"><Security /></div>
        <button type="button" onClick={() => void logout().then(() => setLocation("/login"))} className="mt-6 text-xs text-muted-foreground underline">Sign out</button>
      </div>
    );
  }

  // Load the active campaign's wards and profile before any page renders.
  if (tenancy.isLoading && tenancy.fetchStatus !== "idle") {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading your campaign…</div>;
  }
  const active = tenancy.data?.campaigns.find(c => c.id === tenancy.data?.activeCampaignId);
  if (active && tenancy.data) applyCampaignGeography(active, tenancy.data.primaryCampaignId);

  return (
    <Layout>
      <Switch>
        <Route path="/deepfake">{() => <Guarded module="intelligence" component={Deepfake} />}</Route>
        <Route path="/wa-templates">{() => <Guarded module="messaging" component={WaTemplates} />}</Route>
        <Route path="/content-studio">{() => <Guarded module="messaging" component={() => <ModuleRecords moduleKey="content-calendar" />} />}</Route>
        <Route path="/dashboard">{() => <Guarded module="dashboard" component={Dashboard} />}</Route>
        <Route path="/my-area">{() => <Guarded module="dashboard" component={MyArea} />}</Route>
        <Route path="/strategist">{() => <Guarded module="dashboard" component={Strategist} />}</Route>
        <Route path="/members">{() => <Guarded module="voters" component={Members} />}</Route>
        <Route path="/segments">{() => <Guarded module="segmentation" component={Segments} />}</Route>
        <Route path="/messaging">{() => <Guarded module="messaging" component={Messaging} />}</Route>
        <Route path="/field-ops">{() => <Guarded module="field-ops" component={FieldOps} />}</Route>
        <Route path="/volunteers">{() => <Guarded module="volunteers" component={Volunteers} />}</Route>
        <Route path="/surveys">{() => <Guarded module="intelligence" component={Surveys} />}</Route>
        <Route path="/events">{() => <Guarded module="events" component={Events} />}</Route>
        <Route path="/operations">{() => <Guarded module="events" component={OperationsCentre} />}</Route>
        <Route path="/intelligence">{() => <Guarded module="narrative" component={Intelligence} />}</Route>
        <Route path="/narrative-response">{() => <Guarded module="narrative" component={Intelligence} />}</Route>
        {/* Open to every signed-in user. */}
        <Route path="/social-listening" component={SocialListening} />
        <Route path="/swot">{() => <Guarded module="intelligence" component={Swot} />}</Route>
        <Route path="/campaign-plan">{() => <Guarded module="campaign-plan" component={CampaignPlan} />}</Route>
        <Route path="/kol">{() => <Guarded module="kol" component={KOL} />}</Route>
        <Route path="/fundraising">{() => <Guarded module="finance" component={Fundraising} />}</Route>
        <Route path="/election-day">{() => <Guarded module="election-day" component={ElectionDay} />}</Route>
        <Route path="/turnout">{() => <Guarded module="election-day" component={Turnout} />}</Route>
        <Route path="/speeches">{() => <Guarded module="messaging" component={Speeches} />}</Route>
        <Route path="/voters-db">{() => <Guarded module="constituents" component={VotersDb} />}</Route>
        <Route path="/credentials">{() => <Guarded module="credentials" component={Credentials} />}</Route>
        <Route path="/analytics">{() => <Guarded module="dashboard" component={Analytics} />}</Route>
        <Route path="/admin">{() => <Guarded module="admin" component={Admin} />}</Route>
        <Route path="/command-centre">{() => <Guarded module="dashboard" component={Dashboard} />}</Route>
        <Route path="/system-health">{() => <Guarded module="admin" component={SystemHealth} />}</Route>
        <Route path="/features" component={FeatureCatalogue} />
        <Route path="/security" component={Security} />
        <Route path="/tenancy">{() => <Guarded module="admin" component={TenancyAdmin} />}</Route>
        {/* Registry modules: access is checked per module by the page and the API. */}
        <Route path="/m/:key">{() => <ModuleRecords />}</Route>
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/insights/volunteer" component={VolunteerRegistration} />
      <Route path="/poll/:id" component={PublicPoll} />
      <Route path="/" component={Login} />
      <Route path="/login" component={Login} />
      {/* Fallback: every other path (including nested ones like /m/budgets) is a signed-in page. */}
      <Route component={ProtectedRoutes} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
