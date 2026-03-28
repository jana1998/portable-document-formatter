# Setup Guide

## Quick Start

### 1. Prerequisites

Ensure you have the following installed:
- Node.js 18 or higher
- npm 9 or higher (or yarn/pnpm)
- Git

### 2. Clone and Install

```bash
# Clone the repository
git clone https://github.com/yourusername/portable-document-formatter.git
cd portable-document-formatter

# Install dependencies
npm install
```

### 3. Development Mode

```bash
# Start the development server
npm run dev
```

This will:
1. Start Vite dev server on `http://localhost:5173`
2. Compile the main process
3. Launch Electron with hot reload

## Project Configuration

### TypeScript

The project uses three TypeScript configurations:

1. **tsconfig.json** - Renderer process (React app)
2. **tsconfig.main.json** - Main process (Electron)
3. **tsconfig.node.json** - Build tools (if needed)

### Vite

Vite is configured in `vite.config.ts`:
- Root: `./src/renderer`
- Output: `./dist/renderer`
- Path aliases configured
- React plugin enabled

### Testing

#### Unit Tests (Vitest)
```bash
# Run once
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

Configuration in `vitest.config.ts`

#### E2E Tests (Playwright)
```bash
# Run E2E tests
npm run test:e2e

# Run with UI
npx playwright test --ui

# Run specific test
npx playwright test pdf-viewer.spec.ts
```

Configuration in `playwright.config.ts`

### Styling

#### TailwindCSS
- Configuration: `tailwind.config.js`
- Global styles: `src/renderer/styles/globals.css`
- Uses CSS variables for theming

#### shadcn/ui
All UI components are based on shadcn/ui:
- Located in `src/renderer/components/ui/`
- Fully customizable
- Accessible by default

## Common Tasks

### Adding a New Component

1. Create the component file:
```bash
# For UI components
touch src/renderer/components/ui/new-component.tsx

# For feature components
touch src/renderer/components/features/feature-name/NewComponent.tsx
```

2. Import and use shadcn/ui components
3. Add tests
4. Export from index if needed

### Adding IPC Handlers

1. Add handler in `src/main/main.ts`:
```typescript
ipcMain.handle('my-operation', async (_, arg1, arg2) => {
  // Implementation
  return result;
});
```

2. Add to preload script `src/main/preload.ts`:
```typescript
contextBridge.exposeInMainWorld('electronAPI', {
  myOperation: (arg1, arg2) => ipcRenderer.invoke('my-operation', arg1, arg2),
});
```

3. Add TypeScript definition in preload.ts:
```typescript
declare global {
  interface Window {
    electronAPI: {
      myOperation: (arg1: type, arg2: type) => Promise<ResultType>;
    };
  }
}
```

4. Use in renderer:
```typescript
const result = await window.electronAPI.myOperation(arg1, arg2);
```

### Adding a Service

1. Create service file in `src/services/`:
```typescript
export class MyService {
  async doSomething(): Promise<Result> {
    // Implementation
  }
}

export const myService = new MyService();
```

2. Write tests in `src/tests/unit/`
3. Import and use in components

### Working with State

The app uses Zustand for state management:

```typescript
// Get state and actions
const { value, setValue } = usePDFStore();

// Update state
setValue(newValue);

// Subscribe to changes
useEffect(() => {
  const unsubscribe = usePDFStore.subscribe(
    (state) => state.value,
    (value) => console.log('Value changed:', value)
  );
  return unsubscribe;
}, []);
```

## Environment Setup

### VS Code

Recommended extensions:
- ESLint
- Prettier
- Tailwind CSS IntelliSense
- TypeScript Vue Plugin (Volar)

Recommended settings.json:
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

### Git Hooks

Consider adding pre-commit hooks:

```bash
npm install -D husky lint-staged

# Add to package.json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,css,md}": ["prettier --write"]
  }
}
```

## Troubleshooting

### Port Already in Use

If port 5173 is in use:
```bash
# Kill the process
lsof -ti:5173 | xargs kill -9

# Or use a different port
vite --port 3000
```

### Electron Not Starting

1. Rebuild electron:
```bash
npm rebuild electron
```

2. Clear cache:
```bash
rm -rf node_modules dist
npm install
```

### TypeScript Errors

1. Restart TS server in VS Code
2. Check path aliases in tsconfig.json
3. Ensure all dependencies are installed

### Tests Failing

1. Update snapshots if needed:
```bash
npm test -- -u
```

2. Check mocks in `src/tests/setup.ts`
3. Run tests in verbose mode:
```bash
npm test -- --reporter=verbose
```

## Building for Production

### Development Build
```bash
npm run build
npm start
```

### Production Package
```bash
# Install electron-builder
npm install -D electron-builder

# Add to package.json scripts
{
  "pack": "electron-builder --dir",
  "dist": "electron-builder"
}

# Build for your platform
npm run dist
```

## Performance Tips

1. **Use React.memo** for expensive components
2. **Debounce** expensive operations
3. **Lazy load** components with React.lazy
4. **Use workers** for heavy computations
5. **Optimize images** before adding to PDFs
6. **Limit thumbnail** generation for large PDFs

## Security Best Practices

1. **Never disable contextIsolation** in Electron
2. **Validate all inputs** from users
3. **Sanitize file paths** before file operations
4. **Use Content Security Policy** in production
5. **Keep dependencies updated** regularly
6. **Audit packages** for vulnerabilities:
```bash
npm audit
npm audit fix
```

## Next Steps

1. Read the [README.md](./README.md) for features overview
2. Check the [Architecture](./README.md#architecture) section
3. Review existing components in `src/renderer/components/`
4. Look at test examples in `src/tests/`
5. Start building your feature!
