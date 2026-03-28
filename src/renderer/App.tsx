import React, { useEffect, useState } from 'react';
import { TooltipProvider } from '@components/ui/tooltip';
import { Toaster } from '@components/ui/toaster';
import { LoadingSpinner } from '@components/ui/loading-spinner';
import { Toolbar } from '@components/common/Toolbar';
import { Sidebar } from '@components/common/Sidebar';
import { PDFViewer } from '@components/features/viewer/PDFViewer';
import { usePDFStore } from '@renderer/store/usePDFStore';

function App() {
  const { currentDocument, isSidebarOpen, setIsDarkMode } = usePDFStore();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Initialize dark mode from localStorage
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    setIsDarkMode(savedDarkMode);

    // Ensure the app is fully loaded before rendering
    setIsReady(true);
  }, [setIsDarkMode]);

  if (!isReady) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <LoadingSpinner size="xl" />
          <p className="text-base font-medium text-foreground">Initializing PDF Editor</p>
          <p className="text-sm text-muted-foreground">Please wait...</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="h-screen flex flex-col bg-background">
        <Toolbar />
        <div className="flex-1 flex overflow-hidden relative">
          <div
            className={`transition-all duration-300 ease-in-out ${
              isSidebarOpen ? 'w-64' : 'w-0'
            } overflow-hidden`}
          >
            <Sidebar />
          </div>
          <main className="flex-1 overflow-hidden">
            {currentDocument ? (
              <PDFViewer />
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <div className="text-center space-y-4">
                  <div className="text-6xl">📄</div>
                  <h2 className="text-2xl font-semibold">No PDF Loaded</h2>
                  <p className="text-sm">
                    Click "Open PDF" in the toolbar to get started
                  </p>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
