import { Service } from "@deepseek-ai/cordis";
//#region lib/types/index.js
/**
* Exclusive named registration for the browser-use capability.
* @module @deepseek-ai/dsh-browser-use
*/
/** Owns one optional provider registration in the shared browser-use service. */
var BrowserUseRegistry = class extends Service {
	registration;
	constructor(ctx) {
		super(ctx, "browserUse");
	}
	/** Name of the registered provider, including while its resources are closing. */
	get providerName() {
		return this.registration;
	}
	/**
	* Reserve the sole provider slot until the contribution is disposed.
	* A second registration fails even when it repeats the current name. Providers
	* must stop their tools and await owned work before releasing this registration.
	* @param name - provider-owned name used in registration diagnostics.
	* @returns the effect disposer for this exact registration.
	*/
	register(name) {
		if (this.registration !== void 0) throw new Error(`browser use provider "${this.registration}" is already registered`);
		return this.ctx.effect(() => {
			this.registration = name;
			return () => {
				this.registration = void 0;
			};
		}, "browserUse.register()");
	}
};
//#endregion
export { BrowserUseRegistry, BrowserUseRegistry as default };
