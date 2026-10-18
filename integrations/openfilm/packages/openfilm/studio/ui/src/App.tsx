/**
 * Studio is one place: a project (/projects/<id>). The projects are a popover inside it; `/` goes to the project
 * opened last. Explicitly leaving goes to /projects and shows the library without reopening that project. If none
 * is left, the Projects window appears on its own, with "New
 * project" in it: no folder is made that the person did not ask for. The address is the state, so the agent's
 * `openfilm open` (which sends the page to a project) and the browser's back button both work.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { api, listen, studioConnection } from './api';
import { useT } from './i18n';
import { ProjectView } from './components/ProjectView';
import { BrandLoadingScreen } from './components/BrandLoadingScreen';
import { ProjectsPopover } from './components/ProjectsLibrary';
import { studioHost } from './lib/host';
import { WhatsNew } from './components/WhatsNew';

/**
 * `to` with this page's key in its address (the server puts it there): the address bar is what a person copies, and
 * with the key a copied address opens Studio in any browser on this machine, or in an agent's preview.
 */
const keepKey = (to: string) => {
  const key = new URLSearchParams(location.search).get('key');
  if (!key) return to;
  const at = new URL(to, location.origin);
  at.searchParams.set('key', key);
  return at.pathname + at.search;
};

const projectIn = (path: string) => /^\/projects\/([\w-]+)/.exec(path)?.[1] ?? null;

export function App() {
  const t=useT();
  const [path, setPath] = useState(location.pathname);
  const [admissionAttempt,setAdmissionAttempt]=useState(0);
  const go = (to: string, replace = false) => {
    if(to===location.pathname&&projectIn(to))setAdmissionAttempt(value=>value+1);
    if (to !== location.pathname) (replace ? history.replaceState : history.pushState).call(history, null, '', keepKey(to));
    setPath(to);
  };

  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    window.addEventListener('popstate', onPop);
    /* `openfilm open` while this page is open: show the project it opened */
    const stop = listen('events', (event) => { if (event.type === 'open') go(event.to); }, { watch: true });
    return () => { window.removeEventListener('popstate', onPop); stop(); };
  }, []);

  const id = projectIn(path);
  const library = path === '/projects';
  const [admitted,setAdmitted]=useState<string|null>(null);
  const [admissionError,setAdmissionError]=useState<string|null>(null);
  const [admissionPending,setAdmissionPending]=useState(Boolean(studioHost?.onProject));
  useEffect(()=>{let active=true;setAdmitted(null);setAdmissionError(null);setAdmissionPending(true);void Promise.resolve().then(()=>studioHost?.onProject?.(id)).then(()=>{if(active){setAdmitted(id);setAdmissionPending(false);}},error=>{if(active){setAdmissionError(error instanceof Error?error.message:'VIDEO_PROJECT_UNAVAILABLE');setAdmissionPending(false);}});return()=>{active=false;};},[id,admissionAttempt]);
  /* no project in the address: the one opened last that is still there, else the Projects window (`none`) */
  const [none, setNone] = useState(false);
  useEffect(() => {
    if (id || library) return;
    let alive = true;
    void api.projects().then((projects) => {
      if (!alive) return;
      const last = projects.find((p) => !p.missing);
      if (last) go(`/projects/${last.id}`, true);
      else setNone(true);
    });
    return () => { alive = false; setNone(false); };
  }, [id, library]);

  const page = studioHost?.onProject&&(admissionPending||admitted!==id||admissionError!==null) ? admissionError?<div className="workspace-shell bg-[var(--dock-shell)]"><ProjectsPopover open currentProjectId="" onOpen={next=>go(`/projects/${next}`)} onCurrentRemoved={()=>{}} /><p role="alert" className="fixed bottom-4 left-4 z-[10060] rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-[var(--text)]">{t(id?'projects.openFailed':'project.exitFailed')}</p></div>:<BrandLoadingScreen labelKey={id?'projects.opening':'project.exiting'} />
    : id ? <ProjectView key={id} projectId={id} onProject={(next) => go(`/projects/${next}`)} onLeave={() => go('/projects', true)} />
    : !none && !library ? <BrandLoadingScreen labelKey="projects.opening" />
      : (
        <div className="workspace-shell bg-[var(--dock-shell)]">
          <ProjectsPopover open currentProjectId="" onOpen={(next) => go(`/projects/${next}`)} onCurrentRemoved={() => {}} />
        </div>
      );
  return <>{page}<ConnectionNotice />{!studioHost?.managedServices && <WhatsNew />}</>;
}

/**
 * Studio answers, but not this browser: it was opened at Studio's address without the key (pasted, typed, an agent's
 * browser given the bare address). Nothing to wait for: the page is covered and says which address lets it in.
 */
function LockedNotice() {
  const t = useT();
  return (
    <div role="alert" className="fixed inset-0 z-[10050] flex items-center justify-center bg-[var(--dock-shell)] p-6">
      <div className="w-full max-w-[460px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-lg)]">
        <p className="text-[16px] font-semibold text-[var(--text)]">{t('connection.lockedTitle')}</p>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-muted)]">{t('connection.lockedBody')}</p>
      </div>
    </div>
  );
}

/**
 * Studio stopped (an update, a crash, the computer slept): a bar across the top while it is away, so nothing seems to
 * hang for no reason. Reconnecting is tried all along; once it has been away a while the page is covered (an export or
 * an edit made now would go nowhere) and the bar says how to start it again: this page reconnects by itself.
 */
function ConnectionNotice() {
  const t = useT();
  const state = useSyncExternalStore(studioConnection.subscribe, studioConnection.get);
  if (state === 'up') return null;
  if (state === 'locked') return <LockedNotice />;
  const gone = state === 'gone';
  return (
    <>
      {gone ? <div aria-hidden className="fixed inset-0 z-[10049] bg-black/40 backdrop-blur-[1.5px]" /> : null}
      <div role="alert" className={`fixed inset-x-0 top-0 z-[10050] flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-4 py-2.5 text-[13px] font-medium text-white shadow-lg ${gone ? 'bg-[#b42318]' : 'bg-[#b54708]'}`}>
        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full bg-white ${gone ? '' : 'animate-pulse'}`} />
        <span>{t(gone ? (studioHost ? 'connection.goneApp' : 'connection.gone') : 'connection.lost')}</span>
      </div>
    </>
  );
}
