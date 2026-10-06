const { app, BrowserWindow, ipcMain, session } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const path = require('node:path')

function getFfmpegPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe')
  }
  return process.env.FFMPEG_PATH || 'ffmpeg'
}

function safeStem(filePath) {
  return path.basename(filePath).replace(/\.[^/.]+$/, '').replace(/[^a-z0-9_-]/gi, '_')
}

function getOutputPath(inputPath) {
  return path.join(app.getPath('downloads'), `${safeStem(inputPath)}-hevc.mp4`)
}

function buildArgs(options, outputPath) {
  const args = ['-y', '-i', options.inputPath, '-map', '0:v:0', '-map', '0:a?', '-map', '0:s?']
  args.push('-c:v', 'libx265')
  if (options.rateControl === 'bitrate') {
    args.push('-b:v', `${options.videoBitrate}k`)
  } else {
    args.push('-crf', String(options.crf))
  }
  args.push('-preset', 'medium', '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p')
  args.push('-c:a', 'aac', '-b:a', `${options.audioBitrate}k`, '-c:s', 'copy')
  if (options.resolution && options.resolution !== 'source') args.push('-vf', `scale=${options.resolution}:-2`)
  if (options.frameRate && options.frameRate !== 'source') args.push('-r', String(options.frameRate))
  args.push('-movflags', '+faststart', '-progress', 'pipe:1', outputPath)
  return args
}

function convertVideo(options) {
  return new Promise((resolve, reject) => {
    const outputPath = getOutputPath(options.inputPath)
    const ffmpeg = spawn(getFfmpegPath(), buildArgs(options, outputPath), { windowsHide: true })
    let stderr = ''
    ffmpeg.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    ffmpeg.on('error', (error) => reject(new Error(`Could not start FFmpeg: ${error.message}`)))
    ffmpeg.on('close', (code) => {
      if (code === 0 && fsSync.existsSync(outputPath)) {
        resolve({ outputPath, codec: 'hevc' })
      } else {
        reject(new Error(stderr.split('\n').filter(Boolean).slice(-3).join(' ') || `FFmpeg exited with code ${code}`))
      }
    })
  })
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 980,
    minWidth: 960,
    minHeight: 720,
    backgroundColor: '#12101a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const devUrl = process.env.ELECTRON_START_URL
  if (devUrl) window.loadURL(devUrl)
  else window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  ipcMain.handle('native-convert', (_event, options) => convertVideo(options))
  ipcMain.handle('read-output', async (_event, outputPath) => fs.readFile(outputPath))
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
