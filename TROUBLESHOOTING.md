# Troubleshooting Guide

## PDF Viewer Issues

### Issue: "PDF document not loaded" Error

**Symptoms:**
- Console shows: `Failed to render page: Error: PDF document not loaded`
- PDF doesn't display after opening a file

**Causes & Solutions:**

#### 1. Buffer to ArrayBuffer Conversion
**Fixed in latest update** - The Electron API returns a Node.js Buffer, which needs to be converted to ArrayBuffer for pdf.js.

**Verify the fix is applied in these files:**
- `src/renderer/components/features/viewer/PDFViewer.tsx` (line 50-53)
- `src/renderer/components/features/viewer/ThumbnailsPanel.tsx` (line 29-32)
- `src/renderer/components/features/search/SearchPanel.tsx` (line 30-33)

#### 2. Race Condition
**Fixed in latest update** - Added `isDocumentReady` flag to prevent rendering before document loads.

**Verify:**
```typescript
// PDFViewer.tsx should have:
const [isDocumentReady, setIsDocumentReady] = useState(false);

useEffect(() => {
  if (isDocumentReady && canvasRef.current) {
    renderPage();
  }
}, [currentPage, scale, rotation, isDocumentReady]);
```

#### 3. PDF.js Worker Configuration
**Check:** Ensure pdf.js worker is properly configured.

In `src/services/pdf-renderer.ts`, verify:
```typescript
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
```

**Alternative (for offline use):**
```bash
npm install pdfjs-dist
```

Then update `pdf-renderer.ts`:
```typescript
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
```

### Testing the Fix

1. **Restart the dev server:**
   ```bash
   # Stop current process (Ctrl+C)
   npm run dev
   ```

2. **Open DevTools** (automatically opens)

3. **Open a test PDF:**
   - Click "Open PDF" button
   - Select a small PDF file (< 5 pages recommended)

4. **Check console for errors:**
   - Should NOT see "PDF document not loaded"
   - Should see canvas rendering

## Common Errors

### Error: "Transport destroyed"

**Cause:** Multiple PDF renderers trying to use the same document

**Solution:** Each component creates its own PDFRenderer instance
- ✅ PDFViewer: Creates one renderer (line 6)
- ✅ ThumbnailsPanel: Creates its own renderer (line 24)
- ✅ SearchPanel: Creates temporary renderer (line 27)

### Error: "Failed to get canvas context"

**Cause:** Canvas element not ready or not found

**Solution:**
```typescript
// Ensure canvas is ready before rendering
if (canvasRef.current) {
  await renderPage();
}
```

### Error: "Module not found: Can't resolve 'canvas'"

**Cause:** Some pdf libraries expect node-canvas in Electron

**Solution:** This is expected in renderer process. The mocks in tests handle this.

## Development Issues

### Electron Not Opening

**Check:**
1. Is Vite ready? Look for: `Local: http://localhost:5173`
2. Is main process compiled? Check `dist/main/` exists
3. Any TypeScript errors? Run `npm run build:main`

**Solution:**
```bash
# Clean build
rm -rf dist node_modules
npm install
npm run build:main
npm run dev
```

### Hot Reload Not Working

**For Renderer (React) code:**
- Should auto-reload ✅
- If not, refresh: Cmd+R (Mac) or Ctrl+R (Windows)

**For Main process code:**
- Requires restart ❌
- Stop and run `npm run dev` again

### Tests Failing

**Run with verbose output:**
```bash
npm test -- --reporter=verbose
```

**Common test issues:**
1. Missing mocks → Check `src/tests/setup.ts`
2. Import errors → Check path aliases in `tsconfig.json`
3. Timeout → Increase in `vitest.config.ts`

## Performance Issues

### Large PDFs Load Slowly

**Expected:** PDFs > 50 pages take 5-10 seconds

**Optimize:**
1. Reduce thumbnail count (currently 20):
   ```typescript
   // In ThumbnailsPanel.tsx
   const pagesToLoad = Math.min(pageCount, 10); // Reduce from 20
   ```

2. Increase thumbnail scale (trade quality for speed):
   ```typescript
   await renderer.renderPage(i, canvas, 0.1); // From 0.2
   ```

### UI Feels Sluggish

**Check:**
1. Open DevTools → Performance tab
2. Record while using app
3. Look for long tasks

**Common causes:**
- Too many re-renders → Use React DevTools
- Memory leaks → Check if PDF renderers are destroyed
- Large state updates → Profile with Zustand DevTools

## Build Issues

### TypeScript Errors

```bash
# Check main process
npm run build:main

# Check renderer
npx tsc --noEmit
```

### Vite Build Fails

**Common causes:**
1. Import errors → Check path aliases
2. Missing dependencies → Run `npm install`
3. Syntax errors → Check console

## Platform-Specific Issues

### macOS

**Issue:** "App is damaged"
**Solution:** Remove quarantine flag:
```bash
xattr -cr /path/to/app
```

### Windows

**Issue:** Electron doesn't start
**Solution:** Check antivirus isn't blocking

### Linux

**Issue:** Missing dependencies
**Solution:**
```bash
sudo apt-get install libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils
```

## Getting Help

1. **Check console logs** (DevTools opens automatically)
2. **Check this guide** for your specific error
3. **Check main documentation:**
   - README.md
   - QUICKSTART.md
   - SETUP.md
   - FIXES_APPLIED.md

4. **Enable debug logging:**
   ```typescript
   // Add to PDFViewer.tsx
   console.log('Document loaded:', currentDocument);
   console.log('Document ready:', isDocumentReady);
   console.log('Canvas ref:', canvasRef.current);
   ```

## Debugging Tips

### 1. Check Electron IPC

```typescript
// In Toolbar.tsx, add logging
const handleOpenFile = async () => {
  console.log('Opening file...');
  const fileInfo = await window.electronAPI.openFile();
  console.log('File info:', fileInfo);
  // ...
};
```

### 2. Check PDF Loading

```typescript
// In PDFViewer.tsx loadDocument()
try {
  const data = await window.electronAPI.readFile(currentDocument.path);
  console.log('Read file data:', data);
  console.log('Data type:', data.constructor.name);
  console.log('Data length:', data.byteLength || data.length);

  const arrayBuffer = data instanceof ArrayBuffer
    ? data
    : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  console.log('ArrayBuffer:', arrayBuffer);

  await pdfRenderer.loadDocument(arrayBuffer);
  console.log('PDF loaded successfully');
} catch (error) {
  console.error('Load error:', error);
}
```

### 3. Check State Updates

```typescript
// Add to PDFViewer.tsx
useEffect(() => {
  console.log('State updated:', {
    currentDocument: currentDocument?.name,
    currentPage,
    scale,
    rotation,
    isDocumentReady,
  });
}, [currentDocument, currentPage, scale, rotation, isDocumentReady]);
```

## Still Having Issues?

If you've tried everything above and still have problems:

1. **Create a minimal test case:**
   ```bash
   # Test with a simple PDF
   # Create a 1-page PDF in any tool
   ```

2. **Check browser console** for any other errors

3. **Verify all fixes are applied:**
   - Run `npm test` - should pass all tests
   - Check `FIXES_APPLIED.md` - verify each fix
   - Run `git status` - check for uncommitted changes

4. **Clean reinstall:**
   ```bash
   rm -rf node_modules dist package-lock.json
   npm install
   npm run build:main
   npm run dev
   ```

## Success Checklist

When everything works, you should see:
- ✅ Electron window opens automatically
- ✅ UI loads without errors
- ✅ "Open PDF" button is clickable
- ✅ After opening PDF:
  - PDF renders in main canvas
  - Thumbnails appear in sidebar
  - Page count shows correctly (e.g., "1 / 10")
  - No console errors
- ✅ Annotations can be added
- ✅ Search works
- ✅ Zoom works

If all above work, your setup is correct! 🎉
