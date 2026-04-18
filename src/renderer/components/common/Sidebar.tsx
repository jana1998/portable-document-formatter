import React from 'react';
import { Files, MessageSquare, Search, PanelLeftClose, PanelLeft } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs';
import { PanelCard, PanelCardDescription, PanelCardHeader, PanelCardTitle } from '@components/ui/panel-card';
import { Button } from '@components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { usePDFStore } from '@renderer/store/usePDFStore';
import { ThumbnailsPanel } from '@components/features/viewer/ThumbnailsPanel';
import { AnnotationsPanel } from '@components/features/annotations/AnnotationsPanel';
import { SearchPanel } from '@components/features/search/SearchPanel';

const tabConfig = [
  { value: 'thumbnails', label: 'Pages', icon: Files },
  { value: 'annotations', label: 'Notes', icon: MessageSquare },
  { value: 'search', label: 'Search', icon: Search },
] as const;

export function Sidebar() {
  const { sidebarTab, setSidebarTab, totalPages, annotations, searchResults, isSidebarOpen, setIsSidebarOpen } = usePDFStore();

  const annotationCount = Array.from(annotations.values()).reduce(
    (total, pageAnnotations) => total + pageAnnotations.length,
    0
  );

  const tabStats = {
    thumbnails: `${totalPages || 0} page${totalPages === 1 ? '' : 's'}`,
    annotations: `${annotationCount} annotation${annotationCount === 1 ? '' : 's'}`,
    search: `${searchResults.length} result${searchResults.length === 1 ? '' : 's'}`,
  };

  return (
    <div className="relative h-full">
      {/* Toggle Button - Always Visible */}
      <div className="absolute left-0 top-0 z-20 p-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              aria-label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
              className="bg-card/90 shadow-sm hover:bg-card"
            >
              {isSidebarOpen ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeft className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Sidebar Content */}
      <PanelCard
        className={`flex h-full flex-col overflow-hidden transition-all duration-200 ease-out ${
          isSidebarOpen ? 'translate-x-0 opacity-100' : '-translate-x-[calc(100%-3.5rem)] opacity-50'
        }`}
        style={{ willChange: isSidebarOpen ? 'auto' : 'transform' }}
      >
        <Tabs
          value={sidebarTab}
          onValueChange={(value) => setSidebarTab(value as (typeof tabConfig)[number]['value'])}
          className="flex h-full flex-col"
        >
          <PanelCardHeader className="flex-col gap-4 border-b border-border/40 pb-5 pl-16 pr-5 pt-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.04em] text-muted-foreground">
                • Workspace
              </p>
              <PanelCardTitle className="mt-1 text-lg font-medium tracking-tight">
                Document Panels
              </PanelCardTitle>
            </div>

            <PanelCardDescription className="font-normal leading-relaxed">
              Navigate pages, inspect annotations, and search content.
            </PanelCardDescription>

            <TabsList className="grid h-auto w-full grid-cols-3 gap-1.5 rounded-button bg-muted/60 p-1.5">
              {tabConfig.map(({ value, label, icon: Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="flex gap-2 rounded-button font-medium tracking-tight data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_2px_8px_rgba(0,0,0,0.1)]"
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-accent" />
              <span className="text-xs font-semibold text-muted-foreground">
                {tabStats[sidebarTab]}
              </span>
            </div>
          </PanelCardHeader>

          <TabsContent value="thumbnails" className="min-h-0 flex-1 overflow-hidden px-5 pb-5 pt-4">
            <ThumbnailsPanel />
          </TabsContent>
          <TabsContent value="annotations" className="min-h-0 flex-1 overflow-hidden px-5 pb-5 pt-4">
            <AnnotationsPanel />
          </TabsContent>
          <TabsContent value="search" className="min-h-0 flex-1 overflow-hidden px-5 pb-5 pt-4">
            <SearchPanel />
          </TabsContent>
        </Tabs>
      </PanelCard>
    </div>
  );
}
