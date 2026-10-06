import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

let source = process.env.FFMPEG_PATH
if (!source) {
  try {
    source = execFileSync('where.exe', ['ffmpeg'], { encoding: 'utf8' }).split(/\r?\n/).find(Boolean)
  } catch {
    source = ''
  }
}

if (!source) {
  throw new Error('FFmpeg was not found. Set FFMPEG_PATH to a licensed ffmpeg.exe before packaging.')
}

const destination = join(process.cwd(), 'desktop', 'ffmpeg', 'ffmpeg.exe')
mkdirSync(dirname(destination), { recursive: true })
copyFileSync(source.trim(), destination)
console.log(`Prepared FFmpeg: ${destination}`)
