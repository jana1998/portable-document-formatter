import React from 'react';
import { Files, MessageSquare, PanelLeftClose, Search } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs';
import { PanelCard } from '@components/ui/panel-card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { usePDFStore } from '@renderer/store/usePDFStore';
import { ThumbnailsPanel } from '@components/features/viewer/ThumbnailsPanel';
import { AnnotationsPanel } from '@components/features/annotations/AnnotationsPanel';
import { SearchPanel } from '@components/features/search/SearchPanel';
import { cn } from '@renderer/lib/utils';

type TabValue = 'thumbnails' | 'annotations' | 'search';

const tabConfig: Array<{
  value: TabValue;
  label: string;
  icon: typeof Files;
}> = [
  { value: 'thumbnails', label: 'Pages', icon: Files },
  { value: 'annotations', label: 'Notes', icon: MessageSquare },
  { value: 'search', label: 'Search', icon: Search },
];

export function Sidebar() {
  const {
    sidebarTab,
    setSidebarTab,
    totalPages,
    annotations,
    searchResults,
    setIsSidebarOpen,
  } = usePDFStore();

  const annotationCount = Array.from(annotations.values()).reduce(
    (total, pageAnnotations) => total + pageAnnotations.length,
    0
  );

  const counts: Record<TabValue, number> = {
    thumbnails: totalPages || 0,
    annotations: annotationCount,
    search: searchResults.length,
  };

  return (
    <PanelCard className="flex h-full flex-col overflow-hidden">
      <Tabs
        value={sidebarTab}
        onValueChange={(value) => setSidebarTab(value as TabValue)}
        className="flex h-full flex-col"
      >
        <div className="flex items-center justify-between gap-2 px-5 pt-5">
          <span className="eyebrow">Workspace</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="toolbar"
                size="icon"
                className="shrink-0"
                onClick={() => setIsSidebarOpen(false)}
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Hide sidebar</TooltipContent>
          </Tooltip>
        </div>

        <TabsList className="mx-5 mt-3 mb-4 grid h-auto grid-cols-3 gap-0.5">
          {tabConfig.map(({ value, label, icon: Icon }) => {
            const count = counts[value];
            const active = sidebarTab === value;
            return (
              <TabsTrigger
                key={value}
                value={value}
                className="flex items-center justify-center gap-2 py-2 text-[13px]"
              >
                <Icon className="h-[15px] w-[15px]" />
                <span>{label}</span>
                {count > 0 ? (
                  <span
                    className={cn(
                      'inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-medium tabular-nums transition-colors',
                      active
                        ? 'bg-background/15 text-background'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <div className="border-t border-border/60" />

        <TabsContent value="thumbnails" className="min-h-0 flex-1 overflow-hidden p-5">
          <ThumbnailsPanel />
        </TabsContent>
        <TabsContent value="annotations" className="min-h-0 flex-1 overflow-hidden p-5">
          <AnnotationsPanel />
        </TabsContent>
        <TabsContent value="search" className="min-h-0 flex-1 overflow-hidden p-5">
          <SearchPanel />
        </TabsContent>
      </Tabs>
    </PanelCard>
  );
}
