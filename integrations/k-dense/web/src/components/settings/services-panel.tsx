"use client";
import { researchError } from "@/lib/research-i18n";

import { researchText } from "@/lib/research-i18n";


import { useCallback, useEffect, useState } from "react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  LoaderCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { SettingsLink } from "@/components/settings-link";
import { apiFetch } from "@/lib/projects";
import {
  connectPaperclipConnector,
  getPaperclipConnector,
  type PaperclipConnectorStatus,
} from "@/lib/mcp";
import { notifyModalCredentialsChanged } from "@/lib/modal-jobs";
import { useProjects } from "@/lib/use-projects";
import { cn } from "@/lib/utils";
import { GetKeyLink, KeyRow, useCredentialStatus, type CredentialStatus, type KeyDef } from "./key-row";
import { SettingsCard, SettingsError, SettingsHeader } from "./primitives";
import { runtimeProfile } from '@/lib/runtime-profile';
import {IndependentServiceChoices,OfficialServiceLink} from './independent-service-choices';
import {AutoDLJobsCard} from './autodl-jobs-card';

const SEARCH_KEY_DEFS: KeyDef[] = [
  {
    id: "exa",
    bodyField: "exaApiKey",
    label: researchText("Exa API key"),
    placeholder: "exa-…",
    keysUrl: "https://dashboard.exa.ai/api-keys",
    hint: researchText("Direct Exa web + code search. Without it, web search still works via a free Exa fallback."),
  },
  {
    id: "perplexity",
    bodyField: "perplexityApiKey",
    label: researchText("Perplexity API key"),
    placeholder: "pplx-…",
    keysUrl: "https://www.perplexity.ai/settings/api",
    hint: researchText("Synthesized web answers with citations as an alternative search provider."),
  },
  {
    id: "gemini",
    bodyField: "geminiApiKey",
    label: researchText("Gemini API key"),
    placeholder: "AIza…",
    keysUrl: "https://aistudio.google.com/apikey",
    hint: researchText("Search fallback plus YouTube and video understanding for fetched links. It is the same GEMINI_API_KEY that unlocks Google Gemini models under Providers."),
    notifyProviders: true,
  },
];

const PAPERCLIP_KEY_DEF: KeyDef = {
  id: "paperclip",
  bodyField: "paperclipApiKey",
  label: researchText("Paperclip API key"),
  placeholder: "gxl_…",
  keysUrl: "https://paperclip.gxl.ai/keys",
  hint: researchText("Checked with Paperclip before it is saved. The connector reads the key from .env by name, so it is never copied into the connector settings."),
  savedNote: researchText("Saved. New chat tabs can search Paperclip — no restart needed."),
};

/**
 * Paperclip literature search: saving the key adds a global MCP connector
 * that sends it (server agent/paperclip.ts); this card also reports and
 * repairs that connector, e.g. for a key set in .env by hand.
 */
function PaperclipCard({
  status,
  onStatus,
}: {
  status: CredentialStatus | null;
  onStatus: (status: CredentialStatus) => void;
}) {
  const [connector, setConnector] = useState<PaperclipConnectorStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setConnector(await getPaperclipConnector());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : researchText("Could not load the Paperclip connector"));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      await connectPaperclipConnector();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : researchText("Could not turn on the Paperclip connector"));
    } finally {
      setBusy(false);
    }
  };

  const keySet = connector?.keySet ?? Boolean(status?.paperclip?.set);
  const ready = Boolean(connector?.name && connector.usesKey && connector.enabled);
  const signsInWithoutKey = Boolean(connector?.name && connector.enabled && !connector.usesKey);
  const name = <code className="font-mono">{connector?.name}</code>;

  return (
    <SettingsCard
      id="paperclip"
      title={researchText("Paperclip literature search")}
      description={researchText("Lets the agent search and read papers, preprints, clinical trials, FDA documents and patents. Saving a key adds a Paperclip connector shared by every project.")}
    >
      <KeyRow
        def={runtimeProfile()==='studybuddy'?{...PAPERCLIP_KEY_DEF,officialUrl:'https://paperclip.gxl.ai/',hint:'凭据按当前 StudyBuddy 账号保存在本机，保留 Paperclip 原有检索与全文工具能力。'}:PAPERCLIP_KEY_DEF}
        current={status?.paperclip}
        onStatus={(next) => {
          onStatus(next);
          void load();
        }}
      />
      <SettingsError className="mt-3">{researchError(error ?? connector?.error ?? null)}</SettingsError>
      {connector && !connector.error && (keySet || signsInWithoutKey) ? (
        <div
          role="status"
          className={cn(
            "mt-3 flex items-center gap-2 rounded-md border px-2.5 py-2 text-[11px]",
            ready || (!keySet && signsInWithoutKey)
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
              : "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300",
          )}
        >
          {ready || (!keySet && signsInWithoutKey) ? (
            <CheckCircle2Icon className="size-3.5 shrink-0" />
          ) : (
            <AlertCircleIcon className="size-3.5 shrink-0" />
          )}
          <span className="min-w-0 flex-1">
            {ready ? (
              <>{researchText("Connector")}{" "}{name} {" "}{researchText("is on for every project.")}</>
            ) : !keySet ? (
              <>{researchText("Connector")}{" "}{name} {" "}{researchText("signs in to Paperclip without a key.")}</>
            ) : !connector.name ? (
              researchText("Your key is saved, but there is no Paperclip connector.")
            ) : !connector.usesKey ? (
              <>{researchText("Connector")}{" "}{name} {" "}{researchText("signs in another way and does not use this key.")}</>
            ) : (
              <>{researchText("Connector")}{" "}{name} {" "}{researchText("is turned off.")}</>
            )}
          </span>
          {keySet && !ready ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 text-[11px]"
              disabled={busy}
              onClick={() => void connect()}
            >
              {busy ? researchText("Turning on…") : connector.usesKey || !connector.name ? researchText("Turn on") : researchText("Use this key")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {connector && !keySet && !signsInWithoutKey ? (
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          {researchText("No key? Add")}{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[10px]">{connector.url}</code> {" "}{researchText("under")}{" "}
          <SettingsLink tab="connectors">{researchText("Connectors")}</SettingsLink> {" "}{researchText("and sign in with your Paperclip account instead.")}</p>
      ) : null}
    </SettingsCard>
  );
}

type ModalConnectionState = "idle" | "testing" | "connected" | "error";

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function errorDetail(value: unknown): string | null {
  const record = recordValue(value);
  if (!record) return typeof value === "string" ? value : null;
  for (const candidate of [record.detail, record.error, record.message, record.reason]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    const nested = recordValue(candidate);
    if (nested) {
      const message = nested.message ?? nested.detail;
      if (typeof message === "string" && message.trim()) return message;
    }
  }
  return null;
}

function credentialStatusFromResponse(value: unknown): CredentialStatus | null {
  const record = recordValue(value);
  if (!record) return null;
  const credentials = recordValue(record.credentials) ?? record;
  return recordValue(credentials.modalTokenId) || recordValue(credentials.modalTokenSecret)
    ? (credentials as CredentialStatus)
    : null;
}

function modalConnectionFromResponse(value: unknown): {
  status: string | null;
  detail: string | null;
} {
  const record = recordValue(value);
  if (!record) return { status: null, detail: null };
  const connection =
    recordValue(record.modal) ?? recordValue(record.modalConnection) ?? recordValue(record.validation);
  const status =
    (typeof connection?.status === "string" ? connection.status : null) ??
    (typeof record.modalStatus === "string" ? record.modalStatus : null) ??
    (record.modalConfigured === true ? "connected" : null);
  return {
    status,
    detail: errorDetail(connection) ?? errorDetail(record),
  };
}

function ModalCredentialPair({
  status,
  onStatus,
}: {
  status: CredentialStatus | null;
  onStatus: (status: CredentialStatus) => void;
}) {
  const tokenIdStatus = status?.modalTokenId;
  const tokenSecretStatus = status?.modalTokenSecret;
  const existingConnected = Boolean(tokenIdStatus?.set && tokenSecretStatus?.set);
  const existingPartial = Boolean(tokenIdStatus?.set) !== Boolean(tokenSecretStatus?.set);
  const [tokenId, setTokenId] = useState("");
  const [tokenSecret, setTokenSecret] = useState("");
  const [connectionState, setConnectionState] = useState<ModalConnectionState>(
    existingConnected ? "connected" : existingPartial ? "error" : "idle",
  );
  const [error, setError] = useState<string | null>(
    existingPartial ? "Both Modal token fields must be set together." : null,
  );
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    if (tokenIdStatus?.set && tokenSecretStatus?.set) {
      setConnectionState("connected");
      setError(null);
    } else if (Boolean(tokenIdStatus?.set) !== Boolean(tokenSecretStatus?.set)) {
      setConnectionState("error");
      setError(researchText("Both Modal token fields must be set together."));
    }
  }, [tokenIdStatus?.set, tokenSecretStatus?.set]);

  const savePair = useCallback(
    async (clear = false) => {
      if (!clear && (!tokenId.trim() || !tokenSecret.trim())) {
        setConnectionState("error");
        setError(researchText("Enter both the Modal token ID and token secret."));
        return;
      }
      setConnectionState("testing");
      setError(null);
      try {
        const response = await apiFetch("/credentials", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modalTokenId: clear ? null : tokenId.trim(),
            modalTokenSecret: clear ? null : tokenSecret.trim(),
          }),
        });
        const body = await response.json().catch(() => null);
        const connection = modalConnectionFromResponse(body);
        if (
          !response.ok ||
          connection.status === "error" ||
          connection.status === "invalid" ||
          connection.status === "disconnected"
        ) {
          throw new Error(
            connection.detail ??
              errorDetail(body) ??
              (response.ok ? "Modal rejected this token pair." : `Modal connection failed (${response.status})`),
          );
        }
        const nextStatus = credentialStatusFromResponse(body);
        if (nextStatus) onStatus(nextStatus);
        setTokenId("");
        setTokenSecret("");
        setConnectionState(clear ? "idle" : "connected");
        notifyModalCredentialsChanged();
      } catch (cause) {
        setConnectionState("error");
        setError(cause instanceof Error ? cause.message : researchText("Modal connection failed"));
      }
    },
    [onStatus, tokenId, tokenSecret],
  );

  const clearPair = async () => {
    const ok = await confirm({
      title: researchText("Disconnect Modal?"),
      description:
        researchText("New remote jobs will be refused until you connect a token pair again. Jobs already running keep their records."),
      confirmLabel: researchText("Disconnect"),
      destructive: true,
    });
    if (ok) await savePair(true);
  };

  return (
    <SettingsCard
      id="modal"
      title={researchText("Modal compute")}
      description={runtimeProfile()==='studybuddy'?'成对保存并验证 Token ID 与 Secret，保留 Modal CPU／GPU 科研计算能力；任务费用在您自己的 Modal 账户结算。':researchText("Save and validate the token ID and secret as one pair. The pair enables durable CPU and GPU jobs without restarting Kady; pick a target per chat with the compute chip.")}
    >
      {dialog}
      <div
        role={connectionState === "error" ? "alert" : "status"}
        className={cn(
          "mb-3 flex items-center gap-2 rounded-md border px-2.5 py-2 text-[11px]",
          connectionState === "testing" && "border-blue-500/30 bg-blue-500/5 text-blue-700 dark:text-blue-300",
          connectionState === "connected" &&
            "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
          connectionState === "error" && "border-destructive/30 bg-destructive/5 text-destructive",
          connectionState === "idle" && "bg-muted/20 text-muted-foreground",
        )}
      >
        {connectionState === "testing" ? (
          <LoaderCircleIcon className="size-3.5 animate-spin" />
        ) : connectionState === "connected" ? (
          <CheckCircle2Icon className="size-3.5" />
        ) : connectionState === "error" ? (
          <AlertCircleIcon className="size-3.5" />
        ) : (
          <span className="size-2 rounded-full bg-muted-foreground/40" />
        )}
        <span className="min-w-0 flex-1">
          {connectionState === "testing"
            ? researchText("Testing Modal connection…")
            : connectionState === "connected"
              ? researchText("Connected — Modal compute is ready.")
              : connectionState === "error"
                ? (error ?? researchText("Modal connection failed."))
                : researchText("Not connected")}
        </span>
        {(tokenIdStatus?.set || tokenSecretStatus?.set) && connectionState !== "testing" ? (
          <span className="hidden shrink-0 font-mono text-[10px] sm:inline">
            {tokenIdStatus?.masked ?? researchText("ID missing")} · {tokenSecretStatus?.masked ?? researchText("secret missing")}
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-[11px] font-medium">
          <span>{researchText("Token ID")}</span>
          <Input
            type="password"
            value={tokenId}
            autoComplete="off"
            placeholder={tokenIdStatus?.set ? researchText("Replace ak-…") : "ak-…"}
            className="h-8 font-mono text-xs"
            onChange={(event) => {
              setTokenId(event.target.value);
              if (connectionState === "error") {
                setConnectionState(existingConnected ? "connected" : "idle");
                setError(null);
              }
            }}
          />
        </label>
        <label className="space-y-1.5 text-[11px] font-medium">
          <span>{researchText("Token Secret")}</span>
          <Input
            type="password"
            value={tokenSecret}
            autoComplete="off"
            placeholder={tokenSecretStatus?.set ? researchText("Replace as-…") : "as-…"}
            className="h-8 font-mono text-xs"
            onChange={(event) => {
              setTokenSecret(event.target.value);
              if (connectionState === "error") {
                setConnectionState(existingConnected ? "connected" : "idle");
                setError(null);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && tokenId.trim() && tokenSecret.trim()) {
                void savePair();
              }
            }}
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {runtimeProfile()==='studybuddy'&&<OfficialServiceLink href="https://modal.com/" service="Modal"/>}
        <GetKeyLink
          href="https://modal.com/settings/tokens"
          service="Modal token pair"
          label={researchText("Get a token")}
          className="mr-auto"
        />
        {tokenIdStatus?.set || tokenSecretStatus?.set ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={connectionState === "testing"}
            onClick={() => void clearPair()}
            className="text-xs text-destructive hover:text-destructive"
          >
            {researchText("Clear pair")}</Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          disabled={connectionState === "testing" || !tokenId.trim() || !tokenSecret.trim()}
          onClick={() => void savePair()}
          className="text-xs"
        >
          {connectionState === "testing" ? researchText("Testing…") : researchText("Save & test")}
        </Button>
      </div>
    </SettingsCard>
  );
}

interface ModalCacheInfo {
  cache: { volumeName: string; updatedAt?: string } | null;
}

/** The project's optional Modal Volume cache (cache-only; the local sandbox stays canonical). */
function ModalCacheCard({ connected }: { connected: boolean }) {
  const { activeProject, activeProjectId } = useProjects();
  const [info, setInfo] = useState<ModalCacheInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/modal/cache");
      if (!res.ok) throw new Error(`Failed to load the cache (${res.status})`);
      setInfo((await res.json()) as ModalCacheInfo);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : researchText("Failed to load the cache"));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, activeProjectId]);

  const clear = async () => {
    const ok = await confirm({
      title: researchText("Clear the remote cache?"),
      description:
        researchText("Deletes this project's Modal Volume. Files in the project sandbox are not touched; the next job that uses the cache starts cold."),
      confirmLabel: researchText("Clear cache"),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await apiFetch("/modal/cache", { method: "DELETE" });
      const body = (await res.json().catch(() => null)) as { detail?: string } | null;
      if (!res.ok) throw new Error(body?.detail || `Clear failed (${res.status})`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : researchText("Clear failed"));
    } finally {
      setBusy(false);
    }
  };

  const projectName = activeProject?.name ?? activeProjectId;
  return (
    <SettingsCard
      id="modal-cache"
      title={researchText("Remote cache")}
      description={researchText("Optional Modal Volume that speeds up repeat jobs for the current project ({0}). It is a cache only — results always land in the local sandbox.", [projectName])}
    >
      {dialog}
      <SettingsError className="mb-2">{researchError(error)}</SettingsError>
      <div className="flex items-center gap-3 text-xs">
        <span className="min-w-0 flex-1 text-muted-foreground">
          {info === null
            ? researchText("Loading…")
            : info.cache
              ? <>{researchText("Volume")}{" "}<code className="font-mono">{info.cache.volumeName}</code></>
              : researchText("No cache yet — it is created by the first job that asks for one.")}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="text-xs"
          disabled={!info?.cache || busy || !connected}
          title={connected ? undefined : researchText("Connect Modal first")}
          onClick={() => void clear()}
        >
          {busy ? researchText("Clearing…") : researchText("Clear cache")}
        </Button>
      </div>
    </SettingsCard>
  );
}

export function ServicesPanel() {
  const native = runtimeProfile() === 'studybuddy';
  const { activeProject } = useProjects();
  const { status, setStatus, loading, error } = useCredentialStatus();
  const modalConnected = Boolean(status?.modalTokenId?.set && status?.modalTokenSecret?.set);

  return (
    <div className="flex flex-col gap-4">
      <SettingsHeader
        title={researchText("Services")}
        description={
          native ? <>研究工具的独立服务凭据按 StudyBuddy 账号保存在本机。文本、图片、视频及其他模型配置使用 StudyBuddy 原生网关设置。</> : <>
            {researchText("Keys for the tools Kady uses besides models. They stay on this machine (saved to")}{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">.env</code>{researchText(") — nothing is sent to K-Dense.")}</>
        }
        appliesTo="immediately"
      />

      <SettingsError>{researchError(error)}</SettingsError>

      {loading ? (
        <p className="text-xs text-muted-foreground">{researchText("Loading…")}</p>
      ) : (
        <>
          {native&&<IndependentServiceChoices/>}
          <SettingsCard
            id="web-search"
            title={researchText("Web search")}
            description={native?'使用所选服务获取标题、链接、摘要及来源；请分别保存凭据。':researchText("All optional: web search, page fetching, and GitHub reading work without any of them.")}
          >
            <div className="flex flex-col gap-5">
              {SEARCH_KEY_DEFS.filter(def => !native || def.id === 'exa').map((def) => (
                <KeyRow key={def.id} def={native?{...def,officialUrl:'https://exa.ai/',hint:'所选 Exa 使用您自己的 API Key；未配置时明确提示。'}:def} current={status?.[def.id]} onStatus={setStatus} />
              ))}
              {native&&<KeyRow def={{id:'bocha',bodyField:'bochaApiKey',label:'博查 API Key',placeholder:researchText("API Key"),service:'博查',officialUrl:'https://open.bochaai.com/',hint:'博查 Web Search API，费用由您的博查账户结算。'}} current={status?.bocha} onStatus={setStatus}/>}
            </div>
          </SettingsCard>
          {native && <p className="text-xs text-muted-foreground">Perplexity 与 Gemini 的模型调用需由网关提供对应能力，现有配置入口与独立运行模式保留。</p>}
          <PaperclipCard status={status} onStatus={setStatus} />
          {native&&<SettingsCard id="metaso" title="秘塔学术检索" description="Search API 使用 scholar 范围，向现有大模型返回文献结果和来源；不默认提供 Paperclip 的全部全文能力。"><KeyRow def={{id:'metaso',bodyField:'metasoApiKey',label:'秘塔 API Key',placeholder:'mk-…',service:'秘塔',officialUrl:'https://metaso.cn/',hint:'使用您自己的秘塔 API Key，费用由秘塔账户结算。'}} current={status?.metaso} onStatus={setStatus}/></SettingsCard>}
          <ModalCredentialPair status={status} onStatus={setStatus} />
          {native&&<SettingsCard id="autodl" title="AutoDL GPU 科研计算" description="GPU 实例、代码与数据上传、执行、日志、结果、取消及结束后关机。"><KeyRow def={{id:'autodl',bodyField:'autodlToken',label:'AutoDL 开发者 Token',placeholder:'开发者 Token',service:'AutoDL',officialUrl:'https://www.autodl.com/',hint:'请先完成 AutoDL 要求的认证与充值，使用您自己的开发者 Token。关机保留实例数据，释放另行操作。'}} current={status?.autodl} onStatus={setStatus}/></SettingsCard>}
          {(!native || activeProject) && <ModalCacheCard connected={modalConnected} />}
          {native && activeProject && <AutoDLJobsCard/>}
          {native && !activeProject && <p className="text-xs text-muted-foreground">打开研究项目后，可查看该项目的计算任务和远程缓存。</p>}
        </>
      )}

      {!native && <p className="text-[11px] leading-relaxed text-muted-foreground">
        {researchText("A few knobs are read from")}{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-[10px]">.env</code> {" "}{researchText("at startup only — e.g.")}{" "}<code className="rounded bg-muted px-1 py-0.5 text-[10px]">GITHUB_TOKEN</code> {" "}{researchText("(update checks) and")}{" "}<code className="rounded bg-muted px-1 py-0.5 text-[10px]">HTTPS_PROXY</code>{" "}
        {researchText("(outbound proxy). Restart Kady after changing them.")}</p>}
    </div>
  );
}
