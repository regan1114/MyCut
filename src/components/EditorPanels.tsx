import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

export type PanelWidths = { library: number; inspector: number };
export const defaultPanelWidths: PanelWidths = { library: 272, inspector: 270 };
const minimum = { library: 220, player: 400, inspector: 240 };
type Side = keyof PanelWidths;
type Props = { widths: PanelWidths; onWidths: (widths: PanelWidths) => void; navigation: ReactNode; library: ReactNode; player: ReactNode; inspector: ReactNode };

export default function EditorPanels({ widths, onWidths, navigation, library, player, inspector }: Props) {
  const container = useRef<HTMLElement>(null);
  const [available, setAvailable] = useState(950);
  const [dragging, setDragging] = useState<Side>();
  const drag = useRef<{ side: Side; x: number; widths: PanelWidths; original: PanelWidths } | undefined>(undefined);
  useLayoutEffect(() => {
    const measure = () => setAvailable(container.current!.clientWidth - 70); // Navigation (58) and two dividers (6 each).
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container.current!);
    return () => observer.disconnect();
  }, []);
  // Keep all minimum widths when the window shrinks; restore the requested widths when it grows.
  const extra = Math.max(0, available - minimum.player - minimum.library - minimum.inspector);
  const requested = Math.max(0, widths.library - minimum.library) + Math.max(0, widths.inspector - minimum.inspector);
  const ratio = requested ? Math.min(1, extra / requested) : 1;
  const fitted = { library: minimum.library + Math.max(0, widths.library - minimum.library) * ratio, inspector: minimum.inspector + Math.max(0, widths.inspector - minimum.inspector) * ratio };
  const maximum = (side: Side) => Math.max(minimum[side], available - minimum.player - fitted[side === 'library' ? 'inspector' : 'library']);
  const resize = (side: Side, value: number, base = fitted) => onWidths({ ...base, [side]: Math.min(maximum(side), Math.max(minimum[side], value)) });
  const stop = () => { drag.current = undefined; setDragging(undefined); };
  const divider = (side: Side) => <div className="panel-divider" role="separator" tabIndex={0}
    aria-label={side === 'library' ? '調整功能區與播放器寬度' : '調整播放器與屬性區寬度'} aria-orientation="vertical"
    aria-valuemin={minimum[side]} aria-valuemax={Math.round(maximum(side))} aria-valuenow={Math.round(fitted[side])}
    aria-valuetext={`${side === 'library' ? '功能區' : '屬性區'} ${Math.round(fitted[side])} 像素`}
    data-tooltip="拖曳調整寬度，按兩下重設"
    onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { side, x: e.clientX, widths: fitted, original: widths }; setDragging(side); }}
    onPointerMove={e => { const start = drag.current; if (start?.side === side) resize(side, start.widths[side] + (e.clientX - start.x) * (side === 'library' ? 1 : -1), start.widths); }}
    onPointerUp={e => { stop(); if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
    onPointerCancel={() => { if (drag.current) onWidths(drag.current.original); stop(); }} onLostPointerCapture={stop}
    onDoubleClick={() => resize(side, defaultPanelWidths[side])}
    onKeyDown={e => {
      if (e.key === 'Escape' && drag.current) { e.preventDefault(); e.stopPropagation(); onWidths(drag.current.original); stop(); }
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      const delta = (e.shiftKey ? 30 : 10) * (e.key === 'ArrowLeft' ? -1 : 1) * (side === 'library' ? 1 : -1);
      resize(side, e.key === 'Home' ? minimum[side] : e.key === 'End' ? maximum(side) : fitted[side] + delta);
    }} />;
  return <main ref={container} className={`editor-main resizable-panels${dragging ? ' resizing' : ''}`} style={{ '--library-width': `${fitted.library}px`, '--inspector-width': `${fitted.inspector}px` } as CSSProperties}>
    {navigation}{library}{divider('library')}{player}{divider('inspector')}{inspector}
  </main>;
}
