/**
 * Byte-for-byte patch that puts the GPT-SoVITS engine switch into the desktop tray menu.
 *
 * Why the archive: the tray menu is built once in the Electron main process
 * (`app.asar/lib/main.js`, `DesktopTray.relabel()`), while this plugin runs in the Host
 * child process. There is no Tray/Menu handle and no IPC message that adds a menu item, so
 * the only supported-permission route is replacing the `//#region lib/types/tray.js` block
 * with an equal-length copy that splices in two rows loaded from `lib/tray-ext.mjs`.
 *
 * Safety rules, all enforced here:
 *   - equal length only: the region is padded to its original byte count, so every
 *     offset/size in the asar header stays valid and the archive is never rebuilt;
 *   - the header's SHA-256 integrity entry is rewritten to match, so the file also
 *     validates on installs that enforce embedded asar integrity;
 *   - the unpatched `main.js` is backed up before the first write and the write is
 *     read back and compared;
 *   - an unknown anchor (a future DSH that reshaped the region) is reported, not forced.
 *
 * @module dsh-gpt-sovits/tray-patch
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/** Content marker for this patch generation; bump when the injected block changes. */
export const MARKER = 'dsh-gpt-sovits-tray-v2'

const REGION_START = '//#region lib/types/tray.js\n'
const REGION_END = '//#region lib/types/background-notice.js'
/**
 * Second, much smaller edit: hand `hostUrl` to the tray.
 *
 * `DesktopTray` is a module-level class, but `hostUrl` is a local of `async function main()`
 * (declared `let hostUrl;` inside it). The class therefore cannot see it — a bare reference
 * degrades to `undefined` under `typeof` and the menu sits on "检测中…" forever. The one place
 * that can see both is the tray construction inside `main()`, so the options object gains a
 * lazy getter there.
 */
const SPOT_START = '\tif (process.platform === "win32") try {\n\t\ttray = new DesktopTray({'
const SPOT_END = 'console.warn("desktop tray: unavailable", error);\n\t}\n'
const MAIN_JS = '/lib/main.js'

/**
 * Electron's `fs` treats any path ending in `.asar` as an archive, which fails writes and
 * reports the archive itself as a zero-byte file. Writes must go through the real file.
 */
function asRealFile(fn) {
  const previous = process.noAsar
  process.noAsar = true
  try {
    return fn()
  } finally {
    process.noAsar = previous
  }
}

function isRealAsar(candidate) {
  try {
    return asRealFile(() => {
      const fd = fs.openSync(candidate, 'r')
      try {
        const head = Buffer.alloc(8)
        const read = fs.readSync(fd, head, 0, 8, 0)
        return read === 8 && head.readUInt32LE(4) > 0
      } finally {
        fs.closeSync(fd)
      }
    })
  } catch {
    return false
  }
}

/** Find the desktop app's `resources/app.asar`, or `null` for a web-only install. */
export function locateAsar(override) {
  if (typeof override === 'string' && override !== '') return override
  if (typeof process.env.DSH_DESKTOP_APP_ASAR === 'string' && process.env.DSH_DESKTOP_APP_ASAR !== '') {
    return process.env.DSH_DESKTOP_APP_ASAR
  }
  const candidates = []
  /*
   * The Host is launched from inside the archive, so `DSH_INSTALL_DIR` is the shortest
   * reliable pointer: cut it at `.asar`.
   */
  const installDir = process.env.DSH_INSTALL_DIR ?? ''
  const cut = installDir.toLowerCase().indexOf('.asar')
  if (cut > 0) {
    const root = installDir.slice(0, cut + 5)
    if (isRealAsar(root)) candidates.push(root)
  }
  const exe = process.execPath
  if (typeof exe === 'string' && /deepseek harness\.exe$/i.test(exe)) {
    candidates.push(path.join(path.dirname(exe), 'resources', 'app.asar'))
  }
  const argv = [...process.argv, ...process.execArgv].join('\n')
  const fromArgv = argv.match(/([A-Za-z]:[\\/][^\n]*?\.asar)(?=[\\/]|$)/i)
  if (fromArgv !== null) candidates.push(fromArgv[1])
  const local = process.env.LOCALAPPDATA ?? ''
  if (local !== '') candidates.push(path.join(local, 'Programs', 'DeepSeek Harness', 'resources', 'app.asar'))
  for (const candidate of candidates) {
    if (isRealAsar(candidate)) return candidate
  }
  return null
}

function readLayout(asarPath) {
  const fd = asRealFile(() => fs.openSync(asarPath, 'r+'))
  const prefix = Buffer.alloc(16)
  asRealFile(() => fs.readSync(fd, prefix, 0, 16, 0))
  const headerSize = prefix.readUInt32LE(12)
  if (!Number.isSafeInteger(headerSize) || headerSize <= 0) throw new Error('asar header is unreadable')
  const header = Buffer.alloc(headerSize)
  asRealFile(() => fs.readSync(fd, header, 0, headerSize, 16))
  const text = header.toString('utf8')
  const end = text.lastIndexOf('}')
  if (end < 0) throw new Error('asar header JSON is missing')
  const json = JSON.parse(text.slice(0, end + 1))
  return { fd, headerSize, text, json, dataOffset: 16 + headerSize }
}

function findEntry(node, prefix, target) {
  for (const [name, child] of Object.entries(node.files ?? {})) {
    const full = `${prefix}/${name}`
    if (child.files !== undefined) {
      const found = findEntry(child, full, target)
      if (found !== null) return found
    } else if (full === target) {
      return child
    }
  }
  return null
}

/** Read the archive's `lib/main.js` without any patch interpretation. */
export function readMainJs(asarPath) {
  const layout = readLayout(asarPath)
  try {
    const entry = findEntry(layout.json, '', MAIN_JS)
    if (entry === null) throw new Error('app.asar has no /lib/main.js')
    const buffer = Buffer.alloc(entry.size)
    asRealFile(() => fs.readSync(layout.fd, buffer, 0, entry.size, layout.dataOffset + Number(entry.offset)))
    return { content: buffer.toString('utf8'), offset: Number(entry.offset), size: entry.size, integrity: entry.integrity ?? null }
  } finally {
    asRealFile(() => fs.closeSync(layout.fd))
  }
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

/**
 * Write equal-length content back and keep the header's integrity hash in step.
 *
 * A multi-block integrity entry would mean a `main.js` above the 4 MiB block size; that
 * shape has not been seen and is refused rather than patched blind.
 */
function writeMainJs(asarPath, offset, buffer) {
  const layout = readLayout(asarPath)
  const entry = findEntry(layout.json, '', MAIN_JS)
  if (entry === null) throw new Error('app.asar has no /lib/main.js')
  if (entry.size !== buffer.length) throw new Error(`refusing to write ${buffer.length} bytes over ${entry.size}`)
  const absolute = layout.dataOffset + offset
  const fd = layout.fd
  try {
    asRealFile(() => fs.writeSync(fd, buffer, 0, buffer.length, absolute))
    asRealFile(() => fs.fsyncSync(fd))
    const back = Buffer.alloc(buffer.length)
    asRealFile(() => fs.readSync(fd, back, 0, buffer.length, absolute))
    if (!back.equals(buffer)) throw new Error('write verification failed (read-back differs)')
    const integrity = entry.integrity
    if (integrity !== undefined && integrity !== null) {
      const blocks = Array.isArray(integrity.blocks) ? integrity.blocks : []
      if (blocks.length !== 1) throw new Error('multi-block asar integrity is not supported by this patch')
      const fresh = sha256(buffer)
      if (integrity.hash !== fresh || blocks[0] !== fresh) {
        const oldHash = String(integrity.hash)
        if (!/^[0-9a-f]{64}$/.test(oldHash)) throw new Error('unexpected asar integrity hash')
        const updated = layout.text.split(oldHash).join(fresh)
        if (Buffer.byteLength(updated, 'utf8') !== layout.headerSize) throw new Error('header rewrite changed its length')
        asRealFile(() => fs.writeSync(fd, Buffer.from(updated, 'utf8'), 0, layout.headerSize, 16))
        asRealFile(() => fs.fsyncSync(fd))
      }
    }
    return { absolute, bytes: buffer.length, integrity: integrity !== undefined && integrity !== null }
  } finally {
    asRealFile(() => fs.closeSync(fd))
  }
}

/**
 * The replacement region.
 *
 * `hostUrl` is the main process's own module-level Host origin; it is guarded with
 * `typeof` so a future rename degrades to "no state row" instead of a broken menu.
 */
function trayTemplate(extUrl) {
  /*
   * No prose in here: the whole block has to fit the original region byte-for-byte, and the
   * profile path of `tray-ext.mjs` alone eats most of the slack.
   */
  return `//#region lib/types/tray.js
var DesktopTray = class {
	options;
	tray;
	constructor(options) {
		this.options = options;
		const tray = new Tray(nativeImage.createFromPath(options.iconPath));
		this.tray = tray;
		tray.on("click", () => {
			options.open();
		});
		this.relabel();
		import(${JSON.stringify(extUrl)}).then((m) => {
			globalThis.__dshGptTray = m;
			m.install(tray, () => this.relabel());
		}).catch((e) => console.error("gpt-sovits tray:", e));
	}
	relabel() {
		const tray = this.tray;
		if (tray === void 0) return;
		const { messages } = this.options.locale();
		tray.setToolTip(messages.aboutProduct);
		const extra = globalThis.__dshGptTray === void 0 ? [] : globalThis.__dshGptTray.items(messages, (this.options.host ?? (() => ""))());
		tray.setContextMenu(Menu.buildFromTemplate([
			{ label: messages.openApplication, click: () => { this.options.open(); } },
			...(extra.length === 0 ? [] : [{ type: "separator" }, ...extra]),
			{ type: "separator" },
			{ label: messages.quitApplication, click: () => { this.options.quit(); } }
		]));
	}
	dispose() {
		const tray = this.tray;
		this.tray = void 0;
		tray?.destroy();
	}
};
//#endregion
// ${MARKER}
`
}

/** The construction-site template: adds the lazy `host` getter and keeps the slot length. */
function traySpotTemplate() {
  return `\tif (process.platform === "win32") try {
\t\ttray = new DesktopTray({
\t\t\ticonPath: trayIconPath,
\t\t\tlocale: currentDesktopLocale,
\t\t\thost: () => hostUrl,
\t\t\topen: () => focusPrimaryWindow(),
\t\t\tquit: () => app.quit()
\t\t});
\t} catch (error) {
\t\tconsole.warn("desktop tray: unavailable", error);
\t}
`
}

/**
 * Replace a byte range with an equal-length template.
 *
 * A shorter template is padded with spaces *after* its final newline, which is inside the
 * following line's indentation and therefore inert.
 */
function replaceExact(source, startAnchor, endAnchor, template, label) {
  const start = source.indexOf(startAnchor)
  if (start < 0) throw new Error(`anchor missing (${label}: start)`)
  const end = source.indexOf(endAnchor, start)
  if (end < 0) throw new Error(`anchor missing (${label}: end)`)
  const endAbs = end + endAnchor.length
  const original = source.slice(start, endAbs)
  const originalBytes = Buffer.byteLength(original, 'utf8')
  const templateBytes = Buffer.byteLength(template, 'utf8')
  if (templateBytes > originalBytes) {
    throw new Error(`${label}: needs ${templateBytes} bytes but the slot is ${originalBytes}; the shape changed`)
  }
  const padded = template + ' '.repeat(originalBytes - templateBytes)
  if (Buffer.byteLength(padded, 'utf8') !== originalBytes) throw new Error(`${label}: padding failed`)
  return { content: source.slice(0, start) + padded + source.slice(endAbs), slack: originalBytes - templateBytes }
}

/** Build the patched text without writing anything. */
export function buildPatchedMain(original, extUrl) {
  if (original.includes(MARKER)) return { content: original, changed: false, reason: 'already-patched' }
  const classEdit = replaceExact(original, REGION_START, REGION_END, trayTemplate(extUrl), 'tray class')
  const spotEdit = replaceExact(classEdit.content, SPOT_START, SPOT_END, traySpotTemplate(), 'tray construction')
  if (Buffer.byteLength(spotEdit.content, 'utf8') !== Buffer.byteLength(original, 'utf8')) {
    throw new Error('patcher changed the file length; refusing')
  }
  return { content: spotEdit.content, changed: true, slack: { class: classEdit.slack, spot: spotEdit.slack } }
}

/**
 * Inspect and (unless `apply === false`) patch the installed archive.
 *
 * @param options.extUrl absolute `file://` URL of `lib/tray-ext.mjs`
 * @param options.backupPath where to keep the unpatched `main.js`
 * @param options.asarPath override the auto-detected archive
 * @param options.apply false = report only
 */
export function ensureTrayPatch(options = {}) {
  if (process.platform !== 'win32') {
    return { status: 'skipped', ok: false, note: 'only the Windows desktop app owns a tray menu' }
  }
  const asarPath = locateAsar(options.asarPath)
  if (asarPath === null) return { status: 'no-app', ok: false, note: 'resources/app.asar not found (web-only install?)' }
  if (typeof options.extUrl !== 'string' || !options.extUrl.startsWith('file://')) {
    return { status: 'error', ok: false, asarPath, note: 'extUrl must be an absolute file:// URL' }
  }
  const current = readMainJs(asarPath)
  const base = { asarPath, mainSize: current.size }
  if (current.content.includes(MARKER)) return { ...base, status: 'patched', ok: true }
  if (current.content.includes('dsh-gpt-sovits-tray-') || current.content.includes('__dshGptTray')) {
    /*
     * An older generation of this patch is present. It cannot be re-patched in place
     * (the region is already the patched one), so the backup is the way back. If the
     * backup belongs to another DSH build, refuse instead of guessing.
     */
    const restored = restoreTrayPatch({ asarPath, backupPath: options.backupPath })
    if (restored.status !== 'restored') return { ...base, status: 'stale', ok: false, note: restored.note }
    return ensureTrayPatch({ ...options, asarPath })
  }
  if (options.apply === false) return { ...base, status: 'not-patched', ok: false }
  const built = buildPatchedMain(current.content, options.extUrl)
  const buffer = Buffer.from(built.content, 'utf8')
  if (buffer.length !== current.size) throw new Error(`patched size ${buffer.length} != original ${current.size}`)
  let backup = null
  if (typeof options.backupPath === 'string' && options.backupPath !== '') {
    try {
      fs.mkdirSync(path.dirname(options.backupPath), { recursive: true })
      fs.writeFileSync(options.backupPath, current.content, 'utf8')
      backup = options.backupPath
    } catch (error) {
      backup = `backup failed: ${error instanceof Error ? error.message : String(error)}`
    }
  }
  const written = writeMainJs(asarPath, current.offset, buffer)
  const after = readMainJs(asarPath)
  if (!after.content.includes(MARKER)) throw new Error('patched file does not contain the marker after writing')
  return { ...base, status: 'applied', ok: true, backup, integrityUpdated: written.integrity }
}

/** Put the backed-up `main.js` back (same length only). */
export function restoreTrayPatch(options = {}) {
  const asarPath = locateAsar(options.asarPath)
  if (asarPath === null) return { status: 'no-app', ok: false, note: 'app.asar not found' }
  const backupPath = options.backupPath
  if (typeof backupPath !== 'string' || !fs.existsSync(backupPath)) {
    return { status: 'no-backup', ok: false, asarPath, note: 'no backup to restore' }
  }
  const original = fs.readFileSync(backupPath, 'utf8')
  const current = readMainJs(asarPath)
  if (Buffer.byteLength(original, 'utf8') !== current.size) {
    return { status: 'mismatch', ok: false, asarPath, note: 'backup size differs from the current main.js (app updated)' }
  }
  writeMainJs(asarPath, current.offset, Buffer.from(original, 'utf8'))
  const after = readMainJs(asarPath)
  if (after.content.includes(MARKER)) throw new Error('restore did not remove the marker')
  return { status: 'restored', ok: true, asarPath, bytes: current.size }
}
