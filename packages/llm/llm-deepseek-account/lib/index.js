import { ACCOUNT_QUOTA_EXCEEDED_CODE, LlmError, QUOTA_EXCEEDED_CODE } from "@deepseek-ai/dsh-llm";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import { Config as Config$1, catalogModelInfo, plainOptions, registerDeepSeekProvider, resolveAdapterOptions } from "@deepseek-ai/dsh-llm-deepseek";
//#region lib/types/config.js
/** Account providers expose protocol settings without an API-key reference. */
const Config = Config$1;
//#endregion
//#region lib/types/index.js
const name = "llm-deepseek-account";
const inject = ["llm"];
const PROVIDER = "deepseek-account";
function apply(ctx, config) {
	const options = () => resolveAdapterOptions(plainOptions(config), launchEnvironmentOf(ctx));
	options();
	const resolveAuth = async (connection) => {
		const account = ctx.get("deepseekAccount");
		const token = await account?.resolveToken(connection.baseURL);
		if (token === void 0) throw new LlmError("Sign in to DeepSeek to use the account provider. The request destination must allow account authentication.", "ACCOUNT_SIGN_IN_REQUIRED");
		return {
			headers: { "x-dsh-auth-token": token },
			onRequestError: async (error) => {
				if (!(error instanceof LlmError)) return error;
				if (error.code === QUOTA_EXCEEDED_CODE) return new LlmError(error.message, ACCOUNT_QUOTA_EXCEEDED_CODE, {
					...error.failure,
					cause: error
				});
				if (error.failure.status !== 401) return error;
				const rejected = new LlmError(error.message, "ACCOUNT_TOKEN_INVALID", {
					...error.failure,
					cause: error
				});
				try {
					await account?.rejectToken(token);
				} catch (_credentialRemovalFailed) {}
				return rejected;
			}
		};
	};
	ctx.llm.registerConfigurableProviders([{
		provider: PROVIDER,
		displayName: "DeepSeek Account",
		settingsNs: ctx.fiber.entry?.options.id ?? "llm-deepseek-account",
		settingsPath: []
	}]);
	registerDeepSeekProvider(ctx, PROVIDER, {
		options,
		resolveAuth,
		providerName: "DeepSeek Account",
		discoverModels: async (provider) => {
			const connection = options();
			try {
				await resolveAuth(connection);
			} catch (error) {
				if (error instanceof LlmError && error.code === "ACCOUNT_SIGN_IN_REQUIRED") return [];
				throw error;
			}
			return connection.models.map((model) => catalogModelInfo(provider, model));
		}
	});
}
//#endregion
export { Config, apply, inject, name };
