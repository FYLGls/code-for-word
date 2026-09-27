/**
 * CLI entry: start the clipboard HTTP service and keep the process alive.
 */
import { startClipboardServer, DEFAULT_CLIP_PORT } from './clipboard-service.mjs'

const port = Number(process.env.CODEPASTE_CLIP_PORT || DEFAULT_CLIP_PORT)

const handle = await startClipboardServer({ port })
console.log(`[codepaste-clipboard] http://${handle.host}:${handle.port}`)
