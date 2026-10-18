window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-brand-official",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region lib/types/client/Brand.js
		/**
		* Render the standalone mark only when the host is not showing the full wordmark.
		* @param props - Host-supplied mark presentation.
		* @returns the approved StudyBuddy mark.
		*/
		function OfficialBrandMark({ size, wide }) {
			if (wide) return null;
			return (0, react_jsx_runtime.jsx)("img", {
				src: "/brand/guibao.png",
				width: size,
				height: size,
				style: { objectFit: "contain" },
				alt: "硅宝"
			});
		}
		/**
		* Render the complete wordmark with its single integrated mascot letter.
		* @returns the official name wordmark.
		*/
		function OfficialBrandName() {
			return (0, react_jsx_runtime.jsx)("img", {
				src: "/brand/sidebar-v4-1x.png",
				srcSet: "/brand/sidebar-v4-1x.png 1x, /brand/sidebar-v4-2x.png 2x, /brand/sidebar-v4-3x.png 3x",
				width: 160,
				height: 36,
				style: { objectFit: "contain" },
				alt: "StudyBuddy 硅基同桌"
			});
		}
		/** Approved compact mark for the conversation hero. */
		function StudyBuddyHeroMark({ size, className }) {
			return (0, react_jsx_runtime.jsx)("img", {
				src: "/brand/guibao.png",
				width: size,
				height: size,
				className,
				style: { objectFit: "contain" },
				alt: "硅宝"
			});
		}
		//#endregion
		//#region lib/types/client/index.js
		/** Required service: the UI slot registry. */
		const inject = ["slots"];
		/**
		* Fill the sidebar brand slots as one declaration-aware registration set. The
		* conversation hero receives the same approved StudyBuddy mascot.
		* @param ctx - Client root context.
		*/
		function apply(ctx) {
			ctx.slots.inject("sidebar.brand.mark", () => ctx.slots.inject("sidebar.brand.name", function* () {
				yield ctx.slots.register({ name: "sidebar.brand.mark" }, OfficialBrandMark);
				yield ctx.slots.register({ name: "sidebar.brand.name" }, OfficialBrandName);
			}));
			ctx.slots.inject("conversation.hero.brand.mark", () => ctx.slots.register({ name: "conversation.hero.brand.mark" }, StudyBuddyHeroMark));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map