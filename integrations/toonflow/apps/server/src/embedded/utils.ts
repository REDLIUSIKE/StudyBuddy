import * as assets from "@/utils/assets";
import * as browser from "@/utils/browser";
import * as desktop from "@/utils/desktop";
import * as providerDebug from "@/utils/media/debug";
import * as mediaGeneration from "@/utils/media/generation";
import * as mediaProvider from "@/utils/media/provider";
import * as ffmpeg from "@/utils/ffmpeg";
import * as pluginInstall from "@/utils/plugins/install";
import conf, { removeLegacySettings } from "@/utils/conf";
import * as ai from "@/utils/ai";
import * as plugins from "@/utils/plugins/tools";
import * as nodePlugins from "@/utils/plugins/nodes";
import * as extPlugins from "@/utils/plugins/ext";
import * as workspace from "@/utils/workspace";
import * as workspaceFile from "@/utils/workspace/files";
import * as chatImages from "@/utils/workspace/chatImages";
import * as skillFile from "@/utils/skills/files";
import * as mcpControl from "@/utils/mcp/control";
import * as personalization from "@/utils/personalization";
import * as singleAgent from "@/utils/singleAgent";
import * as mentionFiles from "@/agent/mentionFiles";
// The embedded profile has no public standalone MCP listener to restart.
const mcpRuntime = { reloadMcpRuntime: async () => {} };
export default { assets, browser, desktop, providerDebug, mediaGeneration, mediaProvider, ffmpeg, pluginInstall, mentionFiles,
  conf, removeLegacySettings, ai, plugins, nodePlugins, extPlugins, workspace, workspaceFile, chatImages, skillFile, mcpControl, mcpRuntime, personalization, singleAgent };
