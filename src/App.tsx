import { useState } from 'react'
import { ALL_FORMATS, BlobSource, BufferTarget, canEncodeVideo, Conversion, Input, Mp4OutputFormat, Output, Quality } from 'mediabunny'
import './App.css'

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [outputUrl, setOutputUrl] = useState('')
  const [outputName, setOutputName] = useState('')
  const [quality, setQuality] = useState('balanced')
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
    const finalName = `${file.name.replace(/\.[^/.]+$/, '')}-hevc.mp4`
    setIsBusy(true)
    setProgress(0)
    setStatus('Loading the local encoder...')

    try {
      const qualityLevel = quality === 'smallest' ? 'low' : quality === 'quality' ? 'high' : 'medium'
      const encodingQuality = new Quality(qualityLevel)
      if (!(await canEncodeVideo('hevc', { quality: encodingQuality }))) {
        throw new Error('HEVC is not available in this browser or device')
      }

      const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
      const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() })
      const conversion = await Conversion.init({
        input,
        output,
        tracks: 'primary',
        video: { codec: 'hevc', quality: encodingQuality, forceTranscode: true },
        showWarnings: false,
      })
      if (!conversion.isValid) throw new Error('This video does not have a browser-decodable track')
      conversion.onProgress = (nextProgress) => {
        setProgress(Math.max(0, Math.min(100, Math.round(nextProgress * 100))))
        setStatus('Encoding on this device...')
      }
      await conversion.execute()
      if (!output.target.buffer) throw new Error('The encoder returned an empty file')
      const blob = new Blob([output.target.buffer], { type: 'video/mp4' })
      setOutputUrl(URL.createObjectURL(blob))
      setOutputName(finalName)
      setProgress(100)
      setStatus('Done. Your HEVC file is ready.')
    } catch (error) {
      console.error(error)
      setStatus('This browser could not load the HEVC encoder. Try Chrome or Edge on desktop.')
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
          <div className="setting-row"><span>Format</span><strong>H.265 / HEVC <i>●</i></strong></div>
          <div className="setting-row quality-row"><span>Compression</span><div className="quality-options">{['smallest', 'balanced', 'quality'].map((option) => <button type="button" className={quality === option ? 'active' : ''} onClick={() => setQuality(option)} key={option}>{option}</button>)}</div></div>
          <div className="quality-labels"><span>Smallest file</span><span>Best quality</span></div>
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
