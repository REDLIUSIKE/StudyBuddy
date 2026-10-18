import * as Cordis from "@deepseek-ai/cordis";
import { Context } from "@deepseek-ai/cordis";
import Loader from "@deepseek-ai/cordis-plugin-loader";
import css from "./boot-page.module.css";
import * as React from "react";
import * as ReactJsxRuntime from "react/jsx-runtime";
import * as ReactDom from "react-dom";
import * as ReactDomClient from "react-dom/client";
import * as ClientStore from "@deepseek-ai/dsh-client-store";
import * as UiSlots from "@deepseek-ai/dsh-client-ui-slots";
import * as UiPrimitives from "@deepseek-ai/dsh-client-ui-primitives";
import * as UiDockkit from "@deepseek-ai/dsh-client-ui-dockkit";
import "./base.css";
//#region lib/types/loader-status.js
/**
* Value mirror of cordis's `FiberState` const enum: a const enum has no
* runtime object to import (and esbuild-based pipelines cannot inline it
* across modules), so these values mirror the pinned vendored definition
* while retaining its type (same rationale as dsh-tool-cordis's mirror).
*/
const FIBER_STATE = {
	PENDING: 0,
	LOADING: 1,
	ACTIVE: 2,
	FAILED: 3,
	DISPOSED: 4,
	UNLOADING: 5
};
/** Label for each fiber state, keyed by member (inlining-safe — no reverse mapping). */
const STATE_LABELS = {
	[FIBER_STATE.PENDING]: "pending",
	[FIBER_STATE.LOADING]: "loading",
	[FIBER_STATE.ACTIVE]: "active",
	[FIBER_STATE.FAILED]: "failed",
	[FIBER_STATE.DISPOSED]: "disposed",
	[FIBER_STATE.UNLOADING]: "unloading"
};
//#endregion
//#region lib/types/boot-client.js
/**
* Compose the client: `ctx.plugin(Loader)`, `loader.internal = modules`, one
* `loader.create({ name })` per manifest row, `loader.await()`, then
* {@link assertEntriesActive}. A row whose module cannot be imported is marked
* failed; the Loader logs its import error, the module system records it, and
* the audit rejects startup with that error text per entry.
* @param options - context, module system, manifest, optional progress sink.
* @returns resolves after every entry is active; rejects with the audit report otherwise.
*/
async function bootClient(options) {
	const { ctx, manifest, onEntryState } = options;
	await ctx.plugin(Loader);
	const loader = ctx.loader;
	loader.internal = options.modules;
	ctx.on("internal/status", (fiber) => {
		const entry = fiber.entry;
		if (entry === void 0 || entry.fiber === void 0) return;
		onEntryState?.(entry.options.name, STATE_LABELS[entry.fiber.state]);
	});
	const rows = manifest.plugins.map((row) => row.id);
	for (const name of rows) onEntryState?.(name, "loading");
	await options.modules.entries.start(loader, manifest);
	for (const entry of loader.entries()) if (entry.fiber === void 0) onEntryState?.(entry.options.name, "failed");
	await loader.await();
	assertEntriesActive(ctx, options.modules);
}
/**
* Reject entries that failed import/apply or still wait on missing services.
* @param ctx - root Context carrying the Loader.
* @param modules - the module system whose recorded import failures name why an entry
*   has no fiber; a row with no record points at the console.
* @throws {Error} listing every non-active entry with its reason.
*/
function assertEntriesActive(ctx, modules) {
	const failures = [];
	for (const entry of ctx.loader.entries()) {
		const name = entry.options.name;
		if (entry.fiber === void 0) {
			const importError = modules.importError(name);
			failures.push(importError === void 0 ? `${name}: import failed (see console for the import error)` : `${name}: import failed: ${importError.message}`);
			continue;
		}
		const state = STATE_LABELS[entry.fiber.state];
		if (state === "active") continue;
		if (state === "pending") {
			const missing = Object.keys(entry.fiber.inject).filter((service) => ctx.get(service) === void 0);
			failures.push(`${name}: pending (waiting for service${missing.length === 1 ? "" : "s"}: ${missing.join(", ") || "unknown"})`);
		} else failures.push(`${name}: ${state}`);
	}
	if (failures.length > 0) throw new Error(`web boot: ${String(failures.length)} entr${failures.length === 1 ? "y" : "ies"} did not activate\n${failures.join("\n")}`);
}
//#endregion
//#region lib/types/boot-page.js
/** Create a div with one module class and optional text. */
function div(className, text) {
	const el = document.createElement("div");
	el.className = className ?? "";
	if (text !== void 0) el.textContent = text;
	return el;
}
/** Kernel-owned page mounted below the application's root element. */
var BootPage = class {
	root;
	card;
	wordmark;
	spinner;
	hint;
	states = /* @__PURE__ */ new Map();
	active = /* @__PURE__ */ new Set();
	total = 0;
	failure;
	/**
	* Build and attach the boot page.
	* @param container - Application mount point.
	*/
	constructor(container) {
		this.root = div(css.boot);
		this.root.dataset.dshBoot = "";
		this.card = div(css.card);
		this.wordmark = div(css.wordmark, "Studybuddy");
		this.spinner = div(css.spinner);
		this.spinner.dataset.dshBootSpinner = "";
		this.hint = div(css.hint, "Loading plugins…");
		this.card.append(this.wordmark, this.spinner, this.hint);
		this.root.append(this.card);
		container.append(this.root);
		this.updateProgress();
	}
	/**
	* Set the number of loader entries represented by the progress arc.
	* @param total - Complete boot roster size.
	*/
	setTotal(total) {
		this.total = total;
		this.updateProgress();
	}
	/**
	* Project one loader entry's fiber state.
	* @param id - Loader entry name.
	* @param state - Projected fiber state.
	*/
	setState(id, state) {
		this.states.set(id, state);
		if (state === "active") this.active.add(id);
		this.updateProgress();
		this.render();
	}
	/**
	* Display the boot failure report.
	* @param message - Failure report text.
	*/
	fail(message) {
		this.failure = message;
		this.render();
	}
	/** Detach the page before or after the UI renderer takes the mount point. */
	dispose() {
		this.root.remove();
	}
	/** Redraw the state-dependent content below the wordmark. */
	render() {
		const failed = [...this.states].filter(([, state]) => state === "failed").map(([id]) => id);
		if (this.failure === void 0 && failed.length === 0) {
			if (this.spinner.parentElement !== this.card) this.card.replaceChildren(this.wordmark, this.spinner, this.hint);
			return;
		}
		const report = div(css.failed);
		report.append(div(css.failedTitle, "Failed to load plugins"));
		for (const id of failed) report.append(div(css.failedItem, id));
		if (this.failure !== void 0) report.append(div(css.failedItem, this.failure));
		this.card.replaceChildren(this.wordmark, report);
	}
	/** Grow the rotating arc monotonically as loader entries activate. */
	updateProgress() {
		const ratio = this.total === 0 ? 0 : Math.min(this.active.size / this.total, 1);
		this.spinner.style.setProperty("--dsh-boot-arc", `${String(Math.round(72 + ratio * 216))}deg`);
	}
};
//#endregion
//#region lib/types/mount.js
/**
* Mount the UI renderer into `container` through a dependency fiber on
* `uiRenderer`: the mount effect installs when the service is provided and
* reinstalls when it is replaced.
* @param ctx - booted root Context.
* @param container - application mount point.
* @returns resolves once the dependency fiber exists; with `uiRenderer`
* already provided (as after `bootClient`) the mount effect is installed by
* then, otherwise it installs when the service arrives.
*/
async function mountClient(ctx, container) {
	await ctx.inject(["uiRenderer"], (scope) => {
		scope.effect(() => scope.uiRenderer.mount(container), "web boot: application mount");
	});
}
//#endregion
//#region lib/types/seed.js
/**
* Platform-singleton module-table. These are the ONLY entities the shell
* shares into the frozen module table — fetch bundles resolve their externals
* against exactly this set through the loader's require. Keys come from the
* platform constant module ({@link ./platform.ts}, the single source
* of truth with the tsdown client externals); values stay shell-static
* imports so every bundle sees the same instance.
*/
/**
* Build the static table handed to the module loader at boot.
* @returns module specifier → exported entity (one entry per platform word).
*/
function getStaticModules() {
	return {
		"react": React,
		"react/jsx-runtime": ReactJsxRuntime,
		"react-dom": ReactDom,
		"react-dom/client": ReactDomClient,
		"@deepseek-ai/cordis": Cordis,
		"@deepseek-ai/dsh-client-store": ClientStore,
		"@deepseek-ai/dsh-client-ui-slots": UiSlots,
		"@deepseek-ai/dsh-client-ui-primitives": UiPrimitives,
		"@deepseek-ai/dsh-client-ui-dockkit": UiDockkit
	};
}
//#endregion
//#region lib/types/window-drag/regions.js
/**
* The window drag-region contract for the macOS desktop shell: Electron hands
* the page's `-webkit-app-region` boxes to the native window, which hit-tests
* them by geometry in DOM order, ignoring stacking. The property does not inherit:
* Blink collects one box per element whose own computed value is not `none`,
* skipping subtrees that are not visible, and the window applies them in that
* order: `drag` adds geometry, `no-drag` removes it. The composition is therefore
* equivalent to "the last matching box decides" — a point is draggable when the
* last collected box containing it is `drag`.
*
* This module is the executable statement of that rule. Production CSS authors
* the boxes; tests and the browser coverage scenario both decide points through
* this module so a claim about coverage has one meaning.
*/
/**
* The attribute a chrome row puts on the element that owns its window drag.
* ui-web `base.css` turns the mark into the one darwin drag rule, so the row's
* own box is the window's draggable geometry.
*/
const DRAG_MARK = "data-window-drag";
/**
* The attribute the shell sets for one frame to make Electron recollect the
* window's drag rects (electron#32341). While it is set, ui-web `base.css`
* subtracts the marked box; the row marks inside it still declare drag and win in
* document order, so the mark's only effect is that app-region values changed.
*/
const RECALL_MARK = "data-window-drag-recall";
[
	"button",
	"a",
	"input",
	"select",
	"textarea",
	"summary",
	"[contenteditable='true']",
	"[tabindex]",
	"[role='dialog']",
	"[role='alertdialog']",
	"[role='menu']",
	"[role='listbox']",
	"[role='tooltip']",
	"[role='button']",
	"[role='link']",
	"[role='tab']",
	"[role='menuitem']",
	"[role='menuitemcheckbox']",
	"[role='menuitemradio']",
	"[role='option']",
	"[role='checkbox']",
	"[role='radio']",
	"[role='switch']",
	"[role='slider']",
	"[role='combobox']",
	"[role='textbox']"
].join(", ");
//#endregion
//#region lib/types/window-drag/recall.js
/**
* Window drag recollection for the macOS desktop shell. Electron rebuilds the
* window's `-webkit-app-region` rects only when a style pass changes a computed
* app-region value (electron#32341), and Blink skips hidden boxes when it collects
* them, so a chrome row that appears, moves, or disappears without such a change
* leaves the native window holding the previous geometry: a press inside the row
* drags from where it used to be, and a row that slid under the pointer keeps its
* controls unreachable or its blank runs undraggable. This module owns the one
* watcher that closes that gap, so no chrome row has to know the trap.
*
* A row's viewport box is the measurement: every row in this composition shows and
* hides by mounting, unmounting, or moving, so a changed box is the signal. The
* watcher starts on a DOM change that touches a marked row — inside it, on it, on
* an ancestor that holds one, on a container it lives in, or adding or removing one
* — on a marked row's box resizing, or on a transition or animation starting on an
* element that holds one, and then measures every marked row once per frame for as
* long as any box keeps changing. Each frame that changed sets the recall mark, and
* the frame that finds the same geometry clears it and stops once the short grace
* window below has passed: that clear is the collection the steady state comes from.
* @module @deepseek-ai/dsh-client-web/src/window-drag/recall
*/
/** The selector of an element that owns a window drag region. */
const ROW_SELECTOR = `[${DRAG_MARK}]`;
/**
* Quiet frames a report tolerates before the loop stops again. A CSS transition's
* first frame still reports the box's from-value, so a report that arrives before
* the surface starts moving must not end the loop on its first unchanged sample.
*/
const GRACE_FRAMES = 2;
/** The event types that mark a box starting or finishing a transition or animation. */
const MOTION_EVENTS = [
	"transitionstart",
	"transitionend",
	"animationstart",
	"animationend"
];
/**
* Watch the window's marked drag rows and pulse the recall mark whenever their
* geometry can have moved. Installs nothing outside the darwin platform, where no
* app-region rule exists.
* @param options - the document to watch and the two scheduling seams.
* @returns a disposer that stops watching, drops any pending frame, and clears the mark.
*/
function installWindowDragRecall(options) {
	const doc = options.document;
	if (doc.documentElement.dataset.platform !== "darwin") return () => {};
	const scheduleFrame = options.scheduleFrame ?? defaultScheduleFrame;
	const watchBox = options.watchBox ?? defaultWatchBox;
	/** The last frame's measurement per row, the baseline a change is read against. */
	let geometry = /* @__PURE__ */ new Map();
	/** One box watcher per row currently rendered. */
	const boxes = /* @__PURE__ */ new Map();
	let scheduled = false;
	let disposed = false;
	let cancelPending;
	/** Quiet frames left before the loop may stop; refreshed by every report. */
	let grace = 0;
	/**
	* Measure every marked row and pulse when any box differs from the last frame's.
	* Runs once per frame while the surface keeps moving.
	*/
	const measure = () => {
		doc.body.removeAttribute(RECALL_MARK);
		const rows = Array.from(doc.querySelectorAll(ROW_SELECTOR));
		watchBoxes(rows);
		const next = new Map(rows.map((row) => [row, readBox(row)]));
		const moved = rows.length !== geometry.size || rows.some((row) => geometry.get(row) !== next.get(row));
		geometry = next;
		if (moved) {
			doc.body.setAttribute(RECALL_MARK, "");
			grace = 0;
			schedule();
			return;
		}
		if (grace === 0) return;
		grace -= 1;
		schedule();
	};
	/** Report that the surface may be moving, opening the grace window again. */
	const arm = () => {
		grace = GRACE_FRAMES;
		schedule();
	};
	/** Schedule one frame, keeping at most one pending. */
	const schedule = () => {
		if (scheduled) return;
		scheduled = true;
		cancelPending = scheduleFrame(() => {
			scheduled = false;
			cancelPending = void 0;
			if (disposed) return;
			measure();
		});
	};
	/** Keep one box watcher per live row, re-watching when its frame moves or unmounts. */
	const watchBoxes = (rows) => {
		for (const [row, dispose] of boxes) {
			if (rows.includes(row)) continue;
			dispose();
			boxes.delete(row);
		}
		for (const row of rows) {
			if (boxes.has(row)) continue;
			boxes.set(row, watchBox(row, arm));
		}
	};
	/**
	* Whether a motion event can be moving a marked row: the transitioning element is
	* one, holds one, or lives inside one.
	* @param target - the event target to classify.
	* @returns true when the drag surface has to be re-measured.
	*/
	const movesRows = (target) => {
		if (!(target instanceof Element)) return false;
		return target.closest(ROW_SELECTOR) !== null || target.querySelector(ROW_SELECTOR) !== null;
	};
	/** Re-arm for a transition or animation that can be sliding a marked row. */
	const onMotion = (event) => {
		if (movesRows(event.target)) arm();
	};
	const observer = new MutationObserver((records) => {
		if (records.some((record) => touchesRows(record, geometry.keys()))) arm();
	});
	observer.observe(doc.body, {
		subtree: true,
		childList: true,
		attributes: true,
		characterData: true
	});
	for (const type of MOTION_EVENTS) doc.addEventListener(type, onMotion, true);
	arm();
	return () => {
		disposed = true;
		observer.disconnect();
		for (const type of MOTION_EVENTS) doc.removeEventListener(type, onMotion, true);
		if (cancelPending !== void 0) cancelPending();
		for (const dispose of boxes.values()) dispose();
		boxes.clear();
		geometry.clear();
		doc.body.removeAttribute(RECALL_MARK);
	};
}
/** The box a row owns this frame, in viewport pixels. */
function readBox(row) {
	const rect = row.getBoundingClientRect();
	return `${rect.x},${rect.y},${rect.width},${rect.height}`;
}
/**
* Whether one DOM change can have moved the drag surface: a child list change in a
* container that holds a marked row, or an attribute or text change that lands on a
* marked row, inside one, or on an element holding one (a panel's open flag, a
* column's width). A child list change in a container without a marked row is left
* alone — a row whose box grows because its content did is a resize, which the box
* watcher reports — and so is a mounted overlay, whose own app-region value is a
* change of its own.
* @param record - the mutation record to classify.
* @param rows - the rows the last frame measured.
* @returns true when the drag surface has to be re-measured.
*/
function touchesRows(record, rows) {
	if (record.attributeName === "data-window-drag-recall") return false;
	for (const node of [...record.addedNodes, ...record.removedNodes]) if (node instanceof Element && (node.matches(ROW_SELECTOR) || node.querySelector(ROW_SELECTOR) !== null)) return true;
	const target = record.target instanceof Element ? record.target : record.target.parentElement;
	/* v8 ignore next -- the observer watches body's subtree, so a text target always has a parent element. */
	if (target === null) return false;
	if (record.type === "childList") {
		for (const row of rows) if (target.contains(row)) return true;
		return false;
	}
	return target.closest(ROW_SELECTOR) !== null || target.querySelector(ROW_SELECTOR) !== null;
}
/** Schedule one frame through the browser's animation frame queue. */
function defaultScheduleFrame(frame) {
	const handle = requestAnimationFrame(frame);
	return () => {
		cancelAnimationFrame(handle);
	};
}
/** Watch one row's border box where the document has a `ResizeObserver`. */
function defaultWatchBox(row, changed) {
	if (typeof ResizeObserver !== "function") return () => {};
	const observer = new ResizeObserver(changed);
	observer.observe(row);
	return () => {
		observer.disconnect();
	};
}
//#endregion
//#region lib/types/boot.js
/**
* Web boot kernel. It owns only the module system, Cordis loader, and a
* framework-free boot page; plugin composition and the renderer handoff are
* `bootClient` and `mountClient`. The dynamic UI renderer receives the mount
* point after every client entry activates.
* @module @deepseek-ai/dsh-client-web/src/boot
*/
/** Browser boot entry consumed by `apps/web`. */
var AppWebEntry = class {
	container;
	seams;
	page;
	ctx;
	stopDragRecall;
	modules;
	manifest;
	/**
	* Draw the boot page; {@link run} starts the loader.
	* @param container - Application mount point.
	* @param seams - Optional module transport replacement.
	*/
	constructor(container, seams) {
		this.container = container;
		this.seams = seams;
		this.page = new BootPage(container);
	}
	/**
	* Load and activate every client entry, then hand the mount point to the
	* UI renderer. Plugin failures remain visible on the boot page.
	* @param onFailure - Optional carrier-owned fatal presentation; keeps the boot page visible.
	* @returns Resolves after application mount or failure reporting.
	*/
	async run(onFailure) {
		try {
			await globalThis.__DSH_BOOT_READY__?.promise;
			const win = globalThis;
			const moduleLoader = win.__ModuleLoader__;
			if (moduleLoader === void 0) throw new Error("web boot: window.__ModuleLoader__ bootstrap facade is missing");
			const transport = globalThis.__DSH_TRANSPORT__;
			this.modules = moduleLoader.create({
				boot: win.__DSH_BOOT__,
				staticModules: getStaticModules(),
				...transport?.loadBundle === void 0 ? {} : { loadBundle: transport.loadBundle },
				...this.seams
			});
			this.manifest = this.modules.manifest;
			const prefetching = this.prefetchImmediateTier();
			const ctx = new Context();
			this.ctx = ctx;
			this.page.setTotal(this.manifest.plugins.length);
			await prefetching;
			await bootClient({
				ctx,
				modules: this.modules,
				manifest: this.manifest,
				onEntryState: (name, state) => {
					if (onFailure === void 0 || state !== "failed") this.page.setState(name, state);
				}
			});
			this.stopDragRecall = installWindowDragRecall({ document: this.container.ownerDocument });
			await mountClient(ctx, this.container);
		} catch (reason) {
			console.error(reason);
			if (onFailure !== void 0) onFailure(reason);
			else this.page.fail(reason instanceof Error ? reason.message : String(reason));
		}
	}
	/** Dispose the client plugin tree and whichever page owns the mount point. */
	async dispose() {
		this.stopDragRecall?.();
		this.stopDragRecall = void 0;
		const ctx = this.ctx;
		this.ctx = void 0;
		if (ctx !== void 0) await ctx.fiber.dispose();
		this.page.dispose();
	}
	/** Prefetch stage-one bundles and their dynamic requests before concurrent plugin imports. */
	async prefetchImmediateTier() {
		await Promise.all(this.manifest.plugins.filter((row) => row.immediately).map((row) => this.modules.prefetch(row.id).catch((_prefetchError) => {})));
	}
};
//#endregion
//#region lib/types/platform.js
/**
* Shared browser platform modules. Seeding, bundling externals, and Vite
* aliases consume this list so their module identities cannot drift.
* @module @deepseek-ai/dsh-client-web/src/platform
*/
/** The module specifiers the shell shares into the frozen module table. */
const PLATFORM_MODULES = [
	"react",
	"react/jsx-runtime",
	"react-dom",
	"react-dom/client",
	"@deepseek-ai/cordis",
	"@deepseek-ai/dsh-client-store",
	"@deepseek-ai/dsh-client-ui-slots",
	"@deepseek-ai/dsh-client-ui-primitives",
	"@deepseek-ai/dsh-client-ui-dockkit"
];
/** Client-bundle specifiers whose factories the parser preloads before the shell starts. */
const PRELOADED_CLIENT_EXTERNALS = [];
//#endregion
//#region lib/types/apply-injections.js
function assertNever(row) {
	throw new Error(`web boot: unknown index injection row ${JSON.stringify(row)}`);
}
/**
* Execute every row in table order.
* @param rows - Injection table from the boot payload.
* @param loadScript - Executes one script-src row through the page owner's asset transport.
*/
async function applyIndexInjections(rows, loadScript) {
	for (const row of rows) switch (row.kind) {
		case "global":
			globalThis[row.name] = row.value;
			break;
		case "script": {
			const el = document.createElement("script");
			el.textContent = row.text;
			(row.placement === "head" ? document.head : document.body).append(el);
			break;
		}
		case "script-src":
			await loadScript(row.src);
			break;
		case "script-preload": break;
		case "style": {
			const el = document.createElement("style");
			el.textContent = row.text;
			document.head.append(el);
			break;
		}
		case "html":
			(row.placement === "head" ? document.head : document.body).insertAdjacentHTML("beforeend", row.html);
			break;
		default: assertNever(row);
	}
}
//#endregion
export { AppWebEntry, PLATFORM_MODULES, PRELOADED_CLIENT_EXTERNALS, applyIndexInjections, getStaticModules };

//# sourceMappingURL=index.js.map