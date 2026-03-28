import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs';
import { usePDFStore } from '@renderer/store/usePDFStore';
import { ThumbnailsPanel } from '@components/features/viewer/ThumbnailsPanel';
import { AnnotationsPanel } from '@components/features/annotations/AnnotationsPanel';
import { SearchPanel } from '@components/features/search/SearchPanel';

export function Sidebar() {
  const { sidebarTab, setSidebarTab } = usePDFStore();

  return (
    <div className="w-64 border-r bg-background flex flex-col h-full">
      <Tabs value={sidebarTab} onValueChange={(v) => setSidebarTab(v as any)} className="flex-1 flex flex-col h-full">
        <TabsList className="w-full rounded-none border-b shrink-0">
          <TabsTrigger value="thumbnails" className="flex-1">
            Thumbnails
          </TabsTrigger>
          <TabsTrigger value="annotations" className="flex-1">
            Annotations
          </TabsTrigger>
          <TabsTrigger value="search" className="flex-1">
            Search
          </TabsTrigger>
        </TabsList>

        <TabsContent value="thumbnails" className="m-0 p-2 flex-1 overflow-y-auto">
          <ThumbnailsPanel />
        </TabsContent>
        <TabsContent value="annotations" className="m-0 p-2 flex-1 overflow-y-auto">
          <AnnotationsPanel />
        </TabsContent>
        <TabsContent value="search" className="m-0 p-2 flex-1 overflow-y-auto">
          <SearchPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
