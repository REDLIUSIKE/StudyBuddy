import { createRoot } from "react-dom/client";
import { EmbeddedWorkspace } from "@/components/embedded-workspace";
import { OfficeWorkspace } from "@/components/office-workspace";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ApiTokenGate } from "@/components/api-token-gate";
import { ProjectProvider } from "@/lib/use-projects";
import { embeddedRoute } from "@/lib/embedded-route";
import { researchText } from "@/lib/research-i18n";
import "./assets/fonts/fonts.css";
import "./app/globals.css";

const route = embeddedRoute(window.location);
const page = route.kind === "workspace" ? <EmbeddedWorkspace />
  : route.kind === "office" ? <OfficeWorkspace key={`${route.projectId}:${route.path}`} path={route.path} projectId={route.projectId} />
  : <p className="p-8">{route.kind === "invalid-office"
    ? researchText("Open a Word document, spreadsheet or presentation from the Kady file browser.")
    : "Page not found"}</p>;
const container = document.getElementById("root");
if (!container) throw new Error("RESEARCH_EMBEDDED_ROOT_MISSING");

createRoot(container).render(
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <ProjectProvider>
      <TooltipProvider delayDuration={350}>{page}</TooltipProvider>
    </ProjectProvider>
    <Toaster />
    <ApiTokenGate />
  </ThemeProvider>,
);
