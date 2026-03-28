import React from 'react';
import { Files, MessageSquare, Search } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs';
import { PanelCard, PanelCardDescription, PanelCardHeader, PanelCardTitle } from '@components/ui/panel-card';
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
  const { sidebarTab, setSidebarTab, totalPages, annotations, searchResults } = usePDFStore();

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
    <PanelCard className="flex h-full flex-col overflow-hidden">
      <Tabs
        value={sidebarTab}
        onValueChange={(value) => setSidebarTab(value as (typeof tabConfig)[number]['value'])}
        className="flex h-full flex-col"
      >
        <PanelCardHeader className="flex-col gap-4 border-b border-border/70 pb-4">
          <div>
            <PanelCardTitle>Workspace Panels</PanelCardTitle>
            <PanelCardDescription>
              Navigate pages, inspect annotations, and jump through search results.
            </PanelCardDescription>
          </div>

          <TabsList className="grid h-auto w-full grid-cols-3">
            {tabConfig.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="flex gap-2">
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="meta-pill w-fit">
            {tabStats[sidebarTab]}
          </div>
        </PanelCardHeader>

        <TabsContent value="thumbnails" className="min-h-0 flex-1 overflow-hidden px-4 pb-4 pt-4">
          <ThumbnailsPanel />
        </TabsContent>
        <TabsContent value="annotations" className="min-h-0 flex-1 overflow-hidden px-4 pb-4 pt-4">
          <AnnotationsPanel />
        </TabsContent>
        <TabsContent value="search" className="min-h-0 flex-1 overflow-hidden px-4 pb-4 pt-4">
          <SearchPanel />
        </TabsContent>
      </Tabs>
    </PanelCard>
  );
}
