import { ChatCanvas } from './ChatCanvas';
import { AnalyticsPanel } from './AnalyticsPanel';

export function Commander() {
  return (
    <div className="h-full grid grid-cols-[1fr_320px] gap-4">
      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
        <ChatCanvas />
      </div>
      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
        <AnalyticsPanel />
      </div>
    </div>
  );
}
