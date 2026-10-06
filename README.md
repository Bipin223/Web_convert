# Local Encode

The browser version uses WebCodecs, Mediabunny, and local FFmpeg fallbacks. The Windows desktop version bundles a native FFmpeg sidecar for reliable HEVC encoding without browser codec restrictions. Files are processed locally and are not uploaded.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## GitHub Pages deployment

The workflow in `.github/workflows/deploy.yml` deploys automatically whenever `main` receives a push.

1. Push this project to a GitHub repository.
2. Open **Settings > Pages**.
3. Set **Source** to **GitHub Actions**.
4. Push to `main`, then open the Pages URL shown in the workflow or Pages settings.

The Vite base path is set automatically from the repository name during the GitHub Actions build.

## Windows desktop build

The Electron desktop build uses the native FFmpeg executable installed on the machine and packages it into the installer.

```powershell
npm run desktop:dev
npm run desktop:package
```

The installer is created at `dist/Local-Encode-0.0.0-Setup.exe`. The generated `desktop/ffmpeg/ffmpeg.exe` file is ignored by Git because it is a large build artifact; run `npm run prepare:ffmpeg` again on another Windows build machine.

## Browser support

HEVC encoding depends on the device and browser exposing an HEVC `VideoEncoder` through WebCodecs. Support varies by operating system, hardware, browser version, and installed codec support. The app checks support before conversion and reports when the current device cannot encode HEVC.

Devices without native HEVC encoding need a custom x265 WebAssembly build or a server-side FFmpeg fallback. The current app keeps the strict local-processing model and does not upload files.
