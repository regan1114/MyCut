import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LockKeyhole, Plus, Search, Trash2, X } from 'lucide-react';
import type { Clip, Project } from '../../shared/model';

type Props = { project: Project; clip: Clip; active: boolean; onSelect: (clip: Clip) => void; onAdd: () => void; onRemove: (id: string) => void };
const ROW_HEIGHT = 56, OVERSCAN = 5;

export default function CaptionProperties({ project, clip, active, onSelect, onAdd, onRemove }: Props) {
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [scrollTop, setScrollTop] = useState(0), [height, setHeight] = useState(0);
  const position = useRef(0), revealed = useRef<{ id: string; query: string; index: number } | null>(null);
  const clips = useMemo(() => project.clips.filter(c => c.kind === 'text').sort((a, b) => a.start - b.start || a.id.localeCompare(b.id)), [project.clips]);
  const numbers = useMemo(() => new Map(clips.map((c, i) => [c.id, i + 1])), [clips]);
  const lockedTracks = useMemo(() => new Set(project.tracks.filter(t => t.locked).map(t => t.id)), [project.tracks]);
  const filtered = useMemo(() => { const term = query.toLocaleLowerCase(); return clips.filter(c => c.text.toLocaleLowerCase().includes(term)); }, [clips, query]);
  useLayoutEffect(() => {
    const container = list.current; if (!container || !active) return;
    const measure = () => { setHeight(container.clientHeight); setScrollTop(container.scrollTop); };
    container.scrollTop = position.current;
    measure();
    const observer = new ResizeObserver(measure); observer.observe(container);
    return () => observer.disconnect();
  }, [active]);
  useLayoutEffect(() => {
    const container = list.current; if (!container || !active) return;
    const index = filtered.findIndex(c => c.id === clip.id), previous = revealed.current;
    const selectionChanged = previous?.id !== clip.id;
    if (selectionChanged && query && index < 0) { setQuery(''); return; }
    if (previous?.id === clip.id && previous.query === query && previous.index === index) return;
    let top = position.current;
    if ((query && previous?.query !== query) || index < 0) top = 0;
    else if (index * ROW_HEIGHT < top) top = index * ROW_HEIGHT;
    else if ((index + 1) * ROW_HEIGHT > top + container.clientHeight) top = (index + 1) * ROW_HEIGHT - container.clientHeight;
    container.scrollTop = Math.max(0, top);
    position.current = container.scrollTop; setScrollTop(container.scrollTop);
    revealed.current = { id: clip.id, query, index };
  }, [clip.id, filtered, query, active]);
  // A full-height scroll range with only the visible rows mounted, including long projects.
  const top = Math.min(scrollTop, Math.max(0, filtered.length * ROW_HEIGHT - height));
  const first = Math.max(0, Math.floor(top / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(filtered.length, Math.ceil((top + height) / ROW_HEIGHT) + OVERSCAN);
  return <div className="caption-properties" hidden={!active}>
    <section className="property-section caption-list-section"><h4>全部文字與字幕 <span>{query ? `${filtered.length} / ${clips.length}` : clips.length} 則</span></h4>
      <div className="caption-list-tools"><div className="search-box"><Search size={14}/><input aria-label="搜尋字幕內容" placeholder="搜尋字幕內容" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button aria-label="清除字幕搜尋" data-tooltip="清除字幕搜尋" onClick={() => setQuery('')}><X size={13}/></button>}</div><button className="caption-list-add" aria-label="新增字幕" data-tooltip="新增字幕" onClick={onAdd}><Plus size={16}/></button></div>
      <div ref={list} className="caption-property-list" role="list" aria-label="專案字幕清單" tabIndex={0} onScroll={e => { if (active) { position.current = e.currentTarget.scrollTop; setScrollTop(position.current); } }}>
        <div role="presentation" className="caption-list-space" style={{ height: filtered.length * ROW_HEIGHT }}>{filtered.slice(first, last).map((c, i) => {
        const locked = lockedTracks.has(c.trackId);
        return <div role="listitem" aria-posinset={first + i + 1} aria-setsize={filtered.length} key={c.id} className="caption-list-row" style={{ top: (first + i) * ROW_HEIGHT, height: ROW_HEIGHT }}><button className={`caption-list-select${c.id === clip.id ? ' selected' : ''}`} aria-pressed={c.id === clip.id} disabled={locked} data-tooltip={locked ? '此字幕的軌道已鎖定' : c.text.trim().length > 160 ? c.text.trim().slice(0,160)+'…' : c.text.trim() || '空白文字'} onClick={() => onSelect(c)}>
          <small>{numbers.get(c.id)}</small><span>{c.text.trim() || '空白文字'}</span>{locked && <LockKeyhole size={12}/>}
        </button><button className="caption-list-delete" aria-label={`刪除字幕 ${numbers.get(c.id)}`} data-tooltip={locked ? '此字幕的軌道已鎖定' : '刪除這則字幕'} disabled={locked} onClick={() => onRemove(c.id)}><Trash2 size={15}/></button></div>;
      })}</div>{!filtered.length && <p className="caption-list-empty">找不到符合的字幕</p>}</div>
    </section>
  </div>;
}
