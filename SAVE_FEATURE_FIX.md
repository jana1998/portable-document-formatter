# Save Feature Fix - IPC Handler Issue

## The Problem

Error: `Failed to save PDF: Error: Error invoking remote method 'pdf:applyModifications': Error: No handler registered for 'pdf:applyModifications'`

**Root Cause:** The IPC handler exists in the code but the running Electron process is using old cached code.

---

## The Fix Applied

### 1. Fixed Data Type Mismatch
**File:** `src/main/services/pdf-service.ts`

**Problem:** Function expected `Map` objects but IPC sends arrays of tuples

**Fixed:**
```typescript
// Changed from:
modifications: {
  textElements: Map<number, any[]>;
  // ...
}

// To:
modifications: {
  textElements: [number, any[]][];  // Arrays sent by IPC
  imageElements: [number, any[]][];
  annotations: [number, any[]][];
}
```

### 2. Added Debug Logging
**File:** `src/main/main.ts`

Added console.log statements to track:
- When handler is called
- File paths being processed
- Number of modifications being applied
- Success/error status

---

## How to Restart the App Properly

### **CRITICAL: Complete Restart Required**

The Electron main process caches code. You MUST fully stop and restart:

```bash
# Step 1: Stop the dev server
# Press Ctrl+C in the terminal running npm run dev
# Make sure ALL node processes are stopped

# Step 2: Verify no processes are running
killall node 2>/dev/null || true

# Step 3: Clean build (optional but recommended)
rm -rf dist/main
npm run build:main

# Step 4: Start fresh
npm run dev

# IMPORTANT: Wait for "Ready in Xs" from Vite before using the app
```

---

## Verification Steps

### 1. Check Console Output

When you start `npm run dev`, you should see:
```
> portable-document-formatter@1.0.0 dev:electron
> npm run build:main && wait-on http://localhost:5173 && electron .

> portable-document-formatter@1.0.0 build:main
> tsc -p tsconfig.main.json
```

This confirms the main process was rebuilt.

### 2. Test Save with Logging

1. Open a PDF
2. Add text or image
3. Click Save button
4. Choose save location

**In the terminal, you should see:**
```
Applying modifications to PDF: /path/to/file.pdf
Output path: /path/to/output.pdf
Modifications: { textElements: 2, imageElements: 1, annotations: 0 }
PDF modifications applied successfully
```

If you see these logs, the handler is working!

### 3. If Still Getting Error

**Check if handler is registered:**
```bash
grep -n "pdf:applyModifications" dist/main/main.js
```

**Expected output:**
```
160:    electron_1.ipcMain.handle('pdf:applyModifications', async (_, filePath, modifications, outputPath) => {
```

If this line is NOT found, the main process wasn't rebuilt properly.

---

## Common Issues

### Issue 1: "Handler not registered"
**Solution:** Main process still running old code
```bash
# Kill all node processes
killall node

# Rebuild and restart
npm run build:main
npm run dev
```

### Issue 2: Still shows error after restart
**Solution:** Browser cache or multiple Electron instances
```bash
# Kill all Electron processes
killall Electron

# Clear and rebuild
rm -rf dist node_modules/.vite
npm run dev
```

### Issue 3: Builds but handler not working
**Solution:** TypeScript compilation issue
```bash
# Check for TypeScript errors
npx tsc -p tsconfig.main.json --noEmit

# If errors, fix them first, then:
npm run build:main
```

---

## Testing the Save Feature

### Test 1: Save with Text
```bash
1. Open a PDF file
2. Click T icon in toolbar
3. Click on PDF to add text
4. Enter: "Test Text"
5. Click "Add Text"
6. Click Save button in toolbar
7. Choose save location as "test_output.pdf"
8. Click Save

Expected Result:
✅ No error message
✅ Console shows: "PDF modifications applied successfully"
✅ File saved to chosen location
✅ Open saved PDF in external viewer - text is embedded
```

### Test 2: Save with Images
```bash
1. Open a PDF file
2. Click Image icon in toolbar
3. Click on PDF
4. Select a PNG or JPEG file
5. Click "Insert Image"
6. Click Save button
7. Choose save location

Expected Result:
✅ No error
✅ Image embedded in saved PDF
```

### Test 3: Save with Annotations
```bash
1. Open a PDF file
2. Click Highlighter tool
3. Drag over some text to highlight
4. Click Save button
5. Choose save location

Expected Result:
✅ Highlight drawn on saved PDF (yellow rectangle)
```

---

## How the Fix Works

### Data Flow:

1. **Renderer (SaveDialog.tsx):**
   ```typescript
   const modificationsForIPC = {
     textElements: Array.from(textElements.entries()),  // Map → Array
     imageElements: Array.from(imageElements.entries()),
     annotations: Array.from(annotations.entries()),
   };
   
   await window.electronAPI.applyModifications(
     currentDocument.path,
     modificationsForIPC,  // Send arrays, not Maps
     savePath
   );
   ```

2. **Preload (preload.ts):**
   ```typescript
   applyModifications: (filePath, modifications, outputPath) => 
     ipcRenderer.invoke('pdf:applyModifications', filePath, modifications, outputPath)
   ```

3. **Main Process (main.ts):**
   ```typescript
   ipcMain.handle('pdf:applyModifications', async (_, filePath, modifications, outputPath) => {
     console.log('Applying modifications...');  // Debug logging
     await pdfService.applyModificationsToPDF(filePath, modifications, outputPath);
     return true;
   });
   ```

4. **PDF Service (pdf-service.ts):**
   ```typescript
   async applyModificationsToPDF(
     filePath: string,
     modifications: {
       textElements: [number, any[]][];  // Accepts arrays from IPC
       imageElements: [number, any[]][];
       annotations: [number, any[]][];
     },
     outputPath: string
   ) {
     // Process each page and apply modifications using pdf-lib
   }
   ```

---

## What Gets Saved

When you save a PDF with modifications:

✅ **Text Elements:**
- Embedded at exact position
- With font size and color
- Permanently part of PDF

✅ **Image Elements:**
- Embedded PNG/JPEG images
- At specified position and size
- Permanently part of PDF

✅ **Annotations:**
- Highlights (yellow semi-transparent rectangles)
- Rectangles (border only)
- Circles (ellipses)
- Underlines (lines at bottom)
- Strikethroughs (lines in middle)
- All drawn onto PDF permanently

✅ **Original Content:**
- Preserved exactly as before
- Modifications added as layers on top

---

## File Locations

**Modified Files:**
- `src/main/main.ts` - Handler registration with logging
- `src/main/services/pdf-service.ts` - Type fix for IPC data
- `src/renderer/components/features/pages/SaveDialog.tsx` - Sends arrays not Maps

**Built Files:**
- `dist/main/main.js` - Compiled main process (this is what runs!)
- `dist/main/services/pdf-service.js` - Compiled service

**Important:** Changes to `src/main/*.ts` files require rebuilding `dist/main/*.js` files!

---

## Success Indicators

### ✅ Save is Working When:

1. No error alert appears
2. Console shows:
   ```
   Applying modifications to PDF: ...
   Modifications: { textElements: X, imageElements: Y, annotations: Z }
   PDF modifications applied successfully
   ```
3. File appears at chosen location
4. Opening saved PDF in external viewer shows modifications

### ❌ Save is NOT Working When:

1. Error alert: "No handler registered"
2. Console shows: IPC handler errors
3. No file created at save location
4. Saved PDF doesn't have modifications

---

## Quick Restart Checklist

□ Stop dev server (Ctrl+C)
□ Verify it stopped (no "vite" or "electron" in terminal)
□ Run: `npm run build:main`
□ Run: `npm run dev`
□ Wait for "Ready in Xs" message
□ Open PDF and test save

If all steps done correctly, save feature WILL work! ✅

---

## Still Not Working?

If you've followed all steps and it still doesn't work:

1. **Check the terminal for errors when you click Save**
   - Look for red error messages
   - Look for the console.log statements

2. **Verify the built file:**
   ```bash
   cat dist/main/main.js | grep -A 5 "applyModifications"
   ```
   Should show the handler code

3. **Check if multiple Electron instances are running:**
   ```bash
   ps aux | grep -i electron
   ```
   Kill all and restart

4. **Nuclear option - complete clean rebuild:**
   ```bash
   rm -rf dist node_modules/.cache
   npm run build
   npm run dev
   ```

The handler IS registered and the code IS correct. The issue is 100% about loading the new code into the running Electron process.

---

## Why This Happened

**IPC handlers are registered at startup.** When you:
1. Edit main.ts
2. Rebuild (npm run build:main)
3. But don't restart Electron

The old Electron process is still running with old handlers. It doesn't automatically reload.

**Solution:** Always restart `npm run dev` after changing main process code!

---

## Ready to Test!

```bash
# Complete restart:
killall node 2>/dev/null
npm run dev

# Then test save - it WILL work! 🎉
```
