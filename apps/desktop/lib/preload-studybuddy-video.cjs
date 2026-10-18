let electron = require("electron");
//#region lib/types/studybuddy/video-viewer-snapshot.js
/** Static editor DOM query shared by its preload and Main's before/after capture check. */
function readVideoViewerSnapshot() {
	const element = document.querySelector("[data-studio-viewer-capture]");
	if (!element) return null;
	const rect = element.getBoundingClientRect();
	return {
		projectId: element.getAttribute("data-studio-project"),
		time: Number(element.getAttribute("data-studio-time")),
		rect: {
			x: Math.floor(rect.x),
			y: Math.floor(rect.y),
			width: Math.ceil(rect.width),
			height: Math.ceil(rect.height)
		}
	};
}
`${readVideoViewerSnapshot.toString()}`;
//#endregion
//#region lib/types/preload-studybuddy-video.js
if (process.isMainFrame && location.protocol === "http:" && location.hostname === "127.0.0.1") {
	const request = async (action) => {
		const result = await electron.ipcRenderer.invoke("studybuddy:video-guest-action", action);
		if (!result.ok) throw Error(result.error?.code ?? "VIDEO_ACTION_FAILED");
		return result.data;
	};
	let project = Promise.resolve(), projectId = null, projectEpoch = 0;
	const selectProject = (id) => {
		projectId = id;
		projectEpoch++;
		project = request({
			kind: "project",
			projectId: id,
			projectEpoch
		});
		project.catch(() => {});
		return project;
	};
	const selected = async () => {
		const id = projectId, epoch = projectEpoch;
		await project;
		if (!id || id !== projectId || epoch !== projectEpoch) throw Error("VIDEO_SCOPE_REVOKED");
		return {
			projectId: id,
			projectEpoch: epoch
		};
	};
	const paths = (value) => {
		if (!Array.isArray(value) || value.some((path) => typeof path !== "string")) throw Error("VIDEO_ACTION_FAILED");
		return value;
	};
	const pick = async (purpose, folder, options) => {
		const binding = purpose === "project" ? {} : await selected();
		return paths(await request({
			kind: "pick-paths",
			input: {
				purpose,
				folder,
				...options
			},
			...binding
		}));
	};
	const dropped = async (files, purpose) => {
		const values = files.map((file) => electron.webUtils.getPathForFile(file));
		if (values.some((value) => !value)) return [];
		const binding = purpose === "project" ? {} : await selected(), result = [];
		let batch = [];
		const flush = async () => {
			if (!batch.length) return;
			result.push(...paths(await request({
				kind: "drop-paths",
				purpose,
				paths: batch,
				...binding
			})));
			batch = [];
		};
		for (const value of values) {
			if (batch.length >= 128 || JSON.stringify([...batch, value]).length > 6e4) await flush();
			batch.push(value);
		}
		await flush();
		return result;
	};
	electron.contextBridge.exposeInMainWorld("studybuddyVideoHost", {
		version: 1,
		name: "StudyBuddy",
		managedServices: {
			label: "StudyBuddy",
			open: () => request({ kind: "open-tools" }),
			models: async () => request({
				kind: "models",
				...await selected()
			})
		},
		folders: {
			pick: async (options) => {
				const { purpose = "project", ...given } = options ?? {};
				return (await pick(purpose, true, given))[0] ?? null;
			},
			pathOf: (file) => electron.webUtils.getPathForFile(file),
			pathsOf: (files) => dropped(files, "project")
		},
		files: {
			pick: (options) => pick("asset", options.folder, options.title ? { title: options.title } : {}),
			pathsOf: (files) => dropped(files, "asset")
		},
		onProject: selectProject,
		onProjectChanged: (id) => projectId === id ? selectProject(id) : Promise.resolve(),
		onSelection: (selection) => {
			project.then(() => request({
				kind: "selection",
				selection
			})).catch(() => {});
		},
		refer: (reference) => {
			const selected = projectId, epoch = projectEpoch, viewer = readVideoViewerSnapshot();
			project.then(() => {
				if (selected !== projectId || epoch !== projectEpoch) throw Error("VIDEO_SCOPE_REVOKED");
				return request({
					kind: "reference",
					reference,
					projectId: selected,
					projectEpoch: epoch,
					viewer
				});
			}).catch(() => {});
		}
	});
}
//#endregion
