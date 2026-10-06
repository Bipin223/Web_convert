import { useRef, useState } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { ALL_FORMATS, BlobSource, BufferTarget, canEncodeVideo, Conversion, Input, Mp4OutputFormat, Output, Quality } from 'mediabunny'
import './App.css'

function App() {
  const ffmpegRef = useRef(new FFmpeg())
  const [file, setFile] = useState<File | null>(null)
  const [outputUrl, setOutputUrl] = useState('')
  const [outputName, setOutputName] = useState('')
  const [outputCodec, setOutputCodec] = useState('hevc')
  const [quality, setQuality] = useState('balanced')
  const [rateControl, setRateControl] = useState('crf')
  const [videoBitrate, setVideoBitrate] = useState('8000')
  const [resolution, setResolution] = useState('source')
  const [frameRate, setFrameRate] = useState('source')
  const [audioBitrate, setAudioBitrate] = useState('192')
  const [status, setStatus] = useState('Ready for a video')
  const [progress, setProgress] = useState(0)
  const [isBusy, setIsBusy] = useState(false)
  const [isDark, setIsDark] = useState(() => {
    const hour = new Date().getHours()
    return hour >= 19 || hour < 7
  })

  const chooseFile = (nextFile?: File) => {
    if (!nextFile || !nextFile.type.startsWith('video/')) {
      setStatus('Choose a video file to continue')
      return
    }
    if (outputUrl) URL.revokeObjectURL(outputUrl)
    setFile(nextFile)
    setOutputUrl('')
    setOutputName('')
    setProgress(0)
    setStatus('Video ready to encode')
  }

  const convertVideo = async () => {
    if (!file || isBusy) return
    const sourceName = file.name.replace(/\.[^/.]+$/, '')
    setIsBusy(true)
    setProgress(0)
    setStatus('Loading the local encoder...')

    try {
      const crf = quality === 'smallest' ? 28 : quality === 'quality' ? 18 : 23
      const encodingQuality = rateControl === 'crf'
        ? new Quality({ quantizer: crf })
        : new Quality({ bitrate: Number(videoBitrate) * 1000, bitrateMode: 'variable' })
      const targetWidth = resolution === 'source' ? undefined : Number(resolution)
      const targetFrameRate = frameRate === 'source' ? undefined : Number(frameRate)
      let blob: Blob
      let resultCodec = 'hevc'
      if (await canEncodeVideo('hevc', { quality: encodingQuality })) {
        const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
        const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() })
        const conversion = await Conversion.init({
          input,
          output,
          tracks: 'all',
          video: { codec: 'hevc', quality: encodingQuality, forceTranscode: true, width: targetWidth, frameRate: targetFrameRate },
          showWarnings: false,
        })
        if (!conversion.isValid) throw new Error('This video does not have a browser-decodable track')
        conversion.onProgress = (nextProgress) => {
          setProgress(Math.max(0, Math.min(100, Math.round(nextProgress * 100))))
          setStatus('Encoding with the device encoder...')
        }
        await conversion.execute()
        if (!output.target.buffer) throw new Error('The encoder returned an empty file')
        blob = new Blob([output.target.buffer], { type: 'video/mp4' })
        setOutputCodec('hevc')
        setOutputName(`${sourceName}-hevc.mp4`)
      } else {
        setStatus('Downloading the local fallback encoder...')
        setProgress(5)
        const ffmpeg = ffmpegRef.current
        ffmpeg.on('log', ({ message }) => {
          const logLine = String(message || '')
          if (/input|output|encoder|stream|error/i.test(logLine)) setStatus(logLine.slice(-92))
        })
        if (!ffmpeg.loaded) {
          const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm'
          const loadEncoder = async () => {
            const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript')
            setStatus('Initializing the local fallback encoder...')
            const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm')
            await ffmpeg.load({ coreURL, wasmURL })
          }
          await Promise.race([
            loadEncoder(),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('The local encoder took too long to load')), 45000)),
          ])
        }
        ffmpeg.on('progress', ({ progress: nextProgress }) => {
          setProgress(Math.max(0, Math.min(100, Math.round(nextProgress * 100))))
          setStatus('Encoding locally with FFmpeg WASM...')
        })
        const inputExtension = file.name.split('.').pop()?.toLowerCase() || 'mp4'
        const inputName = `input.${inputExtension}`
        const resizeArgs = targetWidth ? ['-vf', `scale=${targetWidth}:-2`] : []
        const frameRateArgs = targetFrameRate ? ['-r', String(targetFrameRate)] : []
        const rateArgs = rateControl === 'crf' ? ['-crf', String(crf)] : ['-b:v', `${videoBitrate}k`]
        const audioArgs = ['-b:a', `${audioBitrate}k`]
        await ffmpeg.writeFile(inputName, await fetchFile(file))
        let fallbackCodec = 'hevc'
        try {
          await ffmpeg.exec(['-y', '-i', inputName, '-map', '0:v:0', '-map', '0:a?', '-map', '0:s?', '-c:v', 'libx265', ...rateArgs, '-preset', 'medium', '-tag:v', 'hvc1', '-c:a', 'aac', ...audioArgs, '-c:s', 'copy', ...resizeArgs, ...frameRateArgs, '-movflags', '+faststart', 'output.mp4'])
        } catch {
          fallbackCodec = 'h264'
          setStatus('HEVC is unavailable here. Creating a compatible H.264 MP4...')
          await ffmpeg.exec(['-y', '-i', inputName, '-map', '0:v:0', '-map', '0:a?', '-map', '0:s?', '-c:v', 'libx264', ...rateArgs, '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', ...audioArgs, '-c:s', 'copy', ...resizeArgs, ...frameRateArgs, '-movflags', '+faststart', 'output.mp4'])
        }
        resultCodec = fallbackCodec
        const data = await ffmpeg.readFile('output.mp4')
        const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
        blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'video/mp4' })
        setOutputCodec(fallbackCodec)
        setOutputName(`${sourceName}-${fallbackCodec}.mp4`)
      }
      setOutputUrl(URL.createObjectURL(blob))
      setProgress(100)
      setStatus(resultCodec === 'h264' ? 'Done. A compatible H.264 file is ready.' : 'Done. Your HEVC file is ready.')
    } catch (error) {
      console.error(error)
      setStatus('This browser could not encode the file locally. Try a smaller video or a modern desktop browser.')
      setProgress(0)
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <main className={`app-shell ${isDark ? 'dark-mode' : ''}`}>
      <header className="topbar">
        <a className="brand" href="/" aria-label="Local Encode home"><span className="brand-mark">L</span><span>LOCAL ENCODE</span></a>
        <div className="topbar-actions"><span className="privacy-pill"><span className="status-dot" /> DEVICE-ONLY PROCESSING</span><button className="theme-toggle" type="button" onClick={() => setIsDark((current) => !current)} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>{isDark ? '☼' : '◐'}</button></div>
      </header>
      <section className="intro">
        <div className="eyebrow"><span /> H.265 / HEVC VIDEO OPTIMIZER</div>
        <h1>Make your video<br /><em>lighter.</em></h1>
        <p>Convert video to efficient HEVC right in your browser. Your original file never leaves this device.</p>
      </section>
      <section className="workspace" aria-label="Video converter">
        <div className="upload-panel">
          <label className={`drop-zone ${file ? 'has-file' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files[0]) }}>
            <input type="file" accept="video/*" onChange={(event) => chooseFile(event.target.files?.[0])} />
            <span className="upload-glyph">↑</span>
            <strong>{file ? file.name : 'Drop a video here'}</strong>
            <span>{file ? `${(file.size / (1024 * 1024)).toFixed(1)} MB ready to encode` : 'or click to browse your device'}</span>
            {!file && <small>MP4, MOV, MKV, AVI and more</small>}
          </label>
          <div className="privacy-note"><span className="lock-icon">⌁</span><div><strong>Private by design</strong><span>Processing runs locally with WebAssembly. No upload, no account.</span></div></div>
        </div>
        <aside className="settings-panel">
          <div className="panel-heading"><span>01</span><h2>Output settings</h2></div>
          <div className="setting-row"><span>Format</span><strong>{outputCodec === 'h264' ? 'H.264 / AVC' : 'H.265 / HEVC'} <i>●</i></strong></div>
          <div className="setting-row quality-row"><span>Compression</span><div className="quality-options">{['smallest', 'balanced', 'quality'].map((option) => <button type="button" className={quality === option ? 'active' : ''} onClick={() => setQuality(option)} key={option}>{option}</button>)}</div></div>
          <div className="quality-labels"><span>Smallest file</span><span>Best quality</span></div>
          <div className="encoding-controls">
            <div className="control-heading"><span>Rate control</span><span className="control-hint">{rateControl === 'crf' ? `CRF ${quality === 'smallest' ? 28 : quality === 'quality' ? 18 : 23}` : 'Predictable size'}</span></div>
            <div className="rate-options"><button type="button" className={rateControl === 'crf' ? 'active' : ''} onClick={() => setRateControl('crf')}>CRF quality</button><button type="button" className={rateControl === 'bitrate' ? 'active' : ''} onClick={() => setRateControl('bitrate')}>Target bitrate</button></div>
            {rateControl === 'bitrate' && <label className="select-row"><span>Video bitrate</span><select value={videoBitrate} onChange={(event) => setVideoBitrate(event.target.value)}><option value="5000">5 Mbps</option><option value="8000">8 Mbps</option><option value="12000">12 Mbps</option><option value="20000">20 Mbps</option><option value="30000">30 Mbps</option><option value="50000">50 Mbps</option></select></label>}
            <label className="select-row"><span>Resolution</span><select value={resolution} onChange={(event) => setResolution(event.target.value)}><option value="source">Source size</option><option value="1280">720p</option><option value="1920">1080p</option><option value="2560">1440p</option><option value="3840">4K</option></select></label>
            <label className="select-row"><span>Frame rate</span><select value={frameRate} onChange={(event) => setFrameRate(event.target.value)}><option value="source">Source rate</option><option value="24">24 fps</option><option value="25">25 fps</option><option value="30">30 fps</option><option value="50">50 fps</option><option value="60">60 fps</option></select></label>
            <label className="select-row"><span>Audio bitrate</span><select value={audioBitrate} onChange={(event) => setAudioBitrate(event.target.value)}><option value="96">96 kbps</option><option value="128">128 kbps</option><option value="192">192 kbps</option><option value="256">256 kbps</option><option value="320">320 kbps</option></select></label>
          </div>
          <button className="convert-button" type="button" disabled={!file || isBusy} onClick={convertVideo}><span>{isBusy ? `${progress}%` : 'Convert to HEVC'}</span><span className="button-arrow">↗</span></button>
          <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
          <p className="status-text">{status}</p>
          {outputUrl && <a className="download-button" href={outputUrl} download={outputName}>Download {outputName} <span>↓</span></a>}
        </aside>
      </section>
      <footer className="footer-note">Made by Bipin Rizal</footer>
    </main>
  )
}

export default App
