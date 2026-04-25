import React from 'react';
import { Files, MessageSquare, PanelLeftClose, Search } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { usePDFStore } from '@renderer/store/usePDFStore';
import { ThumbnailsPanel } from '@components/features/viewer/ThumbnailsPanel';
import { AnnotationsPanel } from '@components/features/annotations/AnnotationsPanel';
import { SearchPanel } from '@components/features/search/SearchPanel';
import { cn } from '@renderer/lib/utils';

type TabValue = 'thumbnails' | 'annotations' | 'search';

const tabs: Array<{ value: TabValue; label: string; icon: typeof Files }> = [
  { value: 'thumbnails', label: 'Pages', icon: Files },
  { value: 'annotations', label: 'Notes', icon: MessageSquare },
  { value: 'search', label: 'Search', icon: Search },
];

export function Sidebar() {
  const { sidebarTab, setSidebarTab, totalPages, annotations, searchResults, setIsSidebarOpen } =
    usePDFStore();

  const annotationCount = Array.from(annotations.values()).reduce(
    (sum, a) => sum + a.length,
    0
  );

  const counts: Record<TabValue, number> = {
    thumbnails: totalPages || 0,
    annotations: annotationCount,
    search: searchResults.length,
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[2rem] border border-border/50 bg-card shadow-[0_8px_40px_rgba(20,20,19,0.07)]">
      <Tabs
        value={sidebarTab}
        onValueChange={(v) => setSidebarTab(v as TabValue)}
        className="flex h-full flex-col"
      >
        {/* Header — top pt clears the fixed floating toolbar */}
        <div className="flex shrink-0 items-center gap-2 px-3 pt-3 pb-3">
          <TabsList className="h-8 flex-1 gap-0 rounded-full bg-muted/50 p-0.5">
            {tabs.map(({ value, label, icon: Icon }) => {
              const count = counts[value];
              const active = sidebarTab === value;
              return (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="flex flex-1 items-center justify-center gap-1 rounded-full py-1.5 text-[11px] font-medium"
                >
                  <Icon className="h-3 w-3 shrink-0" />
                  <span className="hidden sm:inline">{label}</span>
                  {count > 0 && (
                    <span
                      className={cn(
                        'inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums leading-none',
                        active
                          ? 'bg-background/25 text-current'
                          : 'bg-muted-foreground/15 text-muted-foreground'
                      )}
                    >
                      {count}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                onClick={() => setIsSidebarOpen(false)}
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Hide sidebar</TooltipContent>
          </Tooltip>
        </div>

        <div className="mx-3 mb-0 border-t border-border/30" />

        <TabsContent value="thumbnails" className="min-h-0 flex-1 overflow-hidden p-3">
          <ThumbnailsPanel />
        </TabsContent>
        <TabsContent value="annotations" className="min-h-0 flex-1 overflow-hidden p-3">
          <AnnotationsPanel />
        </TabsContent>
        <TabsContent value="search" className="min-h-0 flex-1 overflow-hidden p-3">
          <SearchPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
