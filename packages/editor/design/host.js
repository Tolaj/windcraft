// @ts-check
// Everything the editor needs from the app around it: saving, projects, board positions, the AI and the page address.
// The editor only calls `host`; the page that mounts it fills it in with setHost() before loading editor.js (the app's own
// version is app-host.js). An editor used elsewhere supplies its own.
/**
 * @typedef {object} Host
 * @property {(fields: object) => Promise<any>} createComponent    saves a new design (a design opened from a Figma draft sends `draftId`, and the answer may carry `figmaSource`); resolves to the saved record ({ _id, version, ... }), rejects with the reason
 * @property {(id: string, fields: object) => Promise<any>} updateComponent   changes a saved design (a new version when its code changes)
 * @property {(id: string) => Promise<void>} [deleteComponent]   deletes a saved design (a page takes its sections with it); rejects with the reason. Omit it and the editor shows no Delete page
 * @property {(name: string) => Promise<{ id: string, name: string }>} createProject   a project is the canvas that designs share
 * @property {(projectId: string, positions: object[]) => Promise<void>} saveLayout   where each design sits on the project's canvas
 * @property {(projectId: string, positions: object[]) => void} saveLayoutOnExit   the same, while the page is closing
 * @property {(body: object, onText?: (text: string) => void) => Promise<string>} [generate]   the AI drafts a page; resolves to its HTML. Omit it and the editor shows no AI box or AI tab
 * @property {(id: string | null) => void} showDesign   the address now shows this saved design (null: an unsaved one)
 * @property {(projectId: string, theme: object) => Promise<object>} [saveProjectTheme]   saves the project's theme (its plugins live there) and resolves to the theme as kept; omit it and the plugins are shown but not changed
 * @property {(projectId: string, patch: { autoParts?: boolean }) => Promise<{ autoParts?: boolean }>} [saveProjectSettings]   saves a setting of the project (autoParts: whether the parts of a frame are made on their own) and resolves to what was kept; omit it and the editor shows no such switch
 * @property {(projectId: string, group: string | null) => Promise<{ frames: object[], groups: { name: string, count: number }[], total: number, group: string | null, truncated: boolean }>} [loadFrames]   the frames of one group of the project ("" for the ones without a group), or of all of it (null), as the editor opened with them (a large project is on the canvas one group at a time); omit it and the editor has no group switcher
 * @property {(projectId: string) => string} [projectUrl]   where a project's own page is (the project name links there); omit for none
 * @property {(where: { projectId: string, designId: string }) => string} [previewUrl]   the address of the prototype page for a saved design (the play button opens it in its own tab); omit it and Preview opens over the editor instead
 * @property {(id: string) => void} openDesign   go to this design (loads the page again)
 * @property {(id: string) => Promise<{ changed?: boolean }>} [updateFromFigma]   converts a design again from the Figma data kept with it (a new version when the code changed); omit for no such button
 */
export const host = /** @type {Host} */ ({});
/** @param {Host} h */
export const setHost = (h) => { Object.assign(host, h); };
