# AGENTS.md - Development Guide for AI Assistants

This document provides essential information for AI coding assistants working on this project.

## Project Overview

**YakShaver** is an Electron desktop application that helps users "trim the fluff and get straight to the point" using AI. It's built with:
- **Backend**: Electron + TypeScript
- **Frontend**: React + TypeScript + Vite
- **UI Framework**: Radix UI + Tailwind CSS
- **Package Manager**: npm
- **Code Quality**: Biome (linter + formatter)

## Project Structure

```
/workspace/
├── src/
│   ├── backend/          # Electron main process
│   │   ├── config/       # Configuration (env, etc.)
│   │   ├── events/       # Event forwarding
│   │   ├── ipc/          # IPC handlers (auth, mcp, openai, recording, settings, video)
│   │   ├── services/     # Core services (auth, ffmpeg, file, mcp, openai, recording, storage)
│   │   └── utils/        # Utility functions
│   └── ui/               # React frontend
│       ├── src/
│       │   ├── components/   # React components
│       │   ├── contexts/     # React contexts
│       │   ├── hooks/        # Custom React hooks
│       │   ├── services/     # Frontend services (IPC client)
│       │   └── types/        # TypeScript types
│       └── public/       # Static assets (icons, fonts, logos)
├── .github/workflows/    # GitHub Actions workflows
├── package.json          # Root package.json (backend deps + scripts)
└── forge.config.js       # Electron Forge configuration
```

## Quick Start

### Setup
```bash
npm run setup  # Installs dependencies for both root and src/ui
```

### Development
```bash
npm run dev    # Starts dev server (Vite on :3000) + Electron app
```

### Build Commands
- `npm run build` - Compiles TypeScript backend to `dist/`
- `npm run make` - Creates distributables for all platforms
- `npm run package` - Creates unpacked app packages
- `npm run publish` - Creates distributables and publishes (requires GitHub token)

### Code Quality
- `npm run lint` - Run Biome linter (with auto-fix)
- `npm run format` - Format code with Biome

## Key Technologies

### Backend (Electron Main Process)
- **IPC Channels**: Communication between main and renderer processes via `src/backend/ipc/channels.ts`
- **Services**: Modular services for auth, MCP, OpenAI, recording, storage, etc.
- **Storage**: Uses `electron-store` for persistence, secure storage for sensitive data

### Frontend (React)
- **Build Tool**: Vite (dev server on localhost:3000)
- **UI Library**: Radix UI components
- **Styling**: Tailwind CSS
- **IPC Client**: `src/ui/src/services/ipc-client.ts` for backend communication

## Environment Variables

Create `.env` file in project root:
```env
YOUTUBE_CLIENT_ID=your_youtube_client_id_here
YOUTUBE_CLIENT_SECRET=your_youtube_client_secret_here
```

Note: OpenAI API keys are handled in-app via secure storage (not in .env).

## TypeScript Configuration

- **Backend**: `tsconfig.json` - compiles `src/backend/**/*` to `dist/`
- **Frontend**: `src/ui/tsconfig.json` - separate config for React/Vite

## Build System

### Electron Forge
- Configuration: `forge.config.js`
- Builds: Windows (Squirrel), macOS (ZIP), Linux (DEB)
- Auto-unpacks: UI dist and ffmpeg binaries from ASAR

### Build Process
1. TypeScript compilation (`npm run build`)
2. UI build (`cd src/ui && npm run build`)
3. Electron packaging (via Forge)

## IPC Communication

### Channels
Defined in `src/backend/ipc/channels.ts`. Handlers in:
- `auth-handlers.ts` - YouTube authentication
- `mcp-handlers.ts` - MCP server management
- `openai-handlers.ts` - OpenAI API integration
- `screen-recording-handlers.ts` - Screen recording
- `settings-handlers.ts` - App settings
- `video-handlers.ts` - Video processing

### Usage Pattern
1. Frontend calls IPC via `ipc-client.ts`
2. Backend handlers in `src/backend/ipc/*-handlers.ts`
3. Preload script exposes safe IPC methods (`src/backend/preload.ts`)

## Common Tasks

### Adding a New IPC Handler
1. Add channel constant to `src/backend/ipc/channels.ts`
2. Implement handler in appropriate `*-handlers.ts` file
3. Register handler in `src/backend/index.ts`
4. Update `src/backend/preload.ts` to expose to renderer
5. Add frontend call in `src/ui/src/services/ipc-client.ts`

### Adding a New UI Component
1. Create component in `src/ui/src/components/`
2. Use Radix UI + Tailwind for styling
3. Import via `src/ui/src/lib/utils.ts` for className utilities

### Modifying Build Configuration
- Electron Forge: `forge.config.js`
- Vite (UI): `src/ui/vite.config.mts`
- TypeScript: `tsconfig.json` (backend) or `src/ui/tsconfig.json` (frontend)

## Testing

### Local Testing
- Use `npm run dev` for hot-reload development
- UI changes auto-reload (Vite HMR)
- Backend changes require restart of Electron app

### CI/CD
- **Release builds**: Triggered on GitHub release publish (`.github/workflows/release-electron-app.yml`)
- **Branch builds**: Triggered on push to any branch (`.github/workflows/build-on-branches.yml`)

## Key Files to Reference

- `src/backend/index.ts` - Electron main process entry point
- `src/ui/src/index.tsx` - React app entry point
- `src/backend/ipc/channels.ts` - IPC channel definitions
- `src/ui/src/services/ipc-client.ts` - Frontend IPC client
- `forge.config.js` - Electron packaging configuration
- `package.json` - Scripts and dependencies

## Code Style

- **Formatter**: Biome (2-space indent, 100 char line width)
- **Linter**: Biome (recommended rules)
- Run `npm run lint` before committing

## Development Tips

1. **Dual Package Structure**: Root has backend deps, `src/ui/` has frontend deps. Run `npm run setup` after cloning.

2. **Environment Loading**: `.env` is loaded in both dev (from project root) and production (from bundled resources).

3. **UI Development**: Frontend runs on Vite dev server (localhost:3000). Electron loads this in development mode.

4. **IPC Security**: Context isolation is enabled. Only safe IPC methods are exposed via preload script.

5. **Storage Locations**: 
   - App data: Platform-specific user data directory
   - Settings: `electron-store` (plain JSON)
   - Secure data: Electron `safeStorage` API

## Known Issues / TODOs

- `.env` file handling for YouTube credentials (see forge.config.js line 18 comment)
- Reference issue: https://github.com/SSWConsulting/SSW.YakShaver/issues/3095

## Getting Help

- Check existing IPC handlers for patterns
- Review `src/backend/services/` for service implementations
- Look at existing React components in `src/ui/src/components/` for UI patterns