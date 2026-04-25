import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

export function WelcomeHero() {
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const dateStr = time.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = time.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <>
      <div className="mb-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        <span>
          {dateStr} · {timeStr}
        </span>
      </div>
      <span className="eyebrow mb-5 justify-center">Workspace</span>
      <h1 className="display-hero mb-10">Open a PDF to begin.</h1>
    </>
  );
}
