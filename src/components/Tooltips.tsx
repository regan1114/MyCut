import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// One overlay serves every labelled control, including disabled buttons and
// controls inside scrolling panels. The name remains available to screen readers.
export default function Tooltips(){
  const [active,setActive]=useState<{target:HTMLElement;text:string}>();
  const [position,setPosition]=useState({left:0,top:0});
  const bubble=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    let target:HTMLElement|undefined,timer:ReturnType<typeof setTimeout>|undefined;
    const find=(node:EventTarget|null)=>node instanceof Element?node.closest<HTMLElement>('[data-tooltip]')??undefined:undefined;
    const hide=()=>{clearTimeout(timer);target=undefined;setActive(undefined);};
    const show=(next:HTMLElement|undefined,immediate=false)=>{
      if(next===target)return;hide();if(!next)return;target=next;
      timer=setTimeout(()=>{if(next.isConnected&&target===next){const text=next.dataset.tooltip;if(text)setActive({target:next,text});}},immediate?0:350);
    };
    const over=(event:PointerEvent)=>{if(event.pointerType!=='touch')show(find(event.target));};
    const out=(event:PointerEvent)=>{if(find(event.relatedTarget)!==target)hide();};
    const focus=(event:FocusEvent)=>{const next=find(event.target);if(next?.matches(':focus-visible'))show(next,true);};
    const key=(event:KeyboardEvent)=>{if(['Escape','Enter',' '].includes(event.key))hide();};
    document.addEventListener('pointerover',over,true);document.addEventListener('pointerout',out,true);
    document.addEventListener('focusin',focus,true);document.addEventListener('focusout',hide,true);
    document.addEventListener('pointerdown',hide,true);document.addEventListener('keydown',key,true);
    document.addEventListener('scroll',hide,true);document.addEventListener('fullscreenchange',hide);window.addEventListener('resize',hide);
    return()=>{clearTimeout(timer);document.removeEventListener('pointerover',over,true);document.removeEventListener('pointerout',out,true);document.removeEventListener('focusin',focus,true);document.removeEventListener('focusout',hide,true);document.removeEventListener('pointerdown',hide,true);document.removeEventListener('keydown',key,true);document.removeEventListener('scroll',hide,true);document.removeEventListener('fullscreenchange',hide);window.removeEventListener('resize',hide);};
  },[]);
  useLayoutEffect(()=>{
    if(!active||!bubble.current)return;
    const rect=active.target.getBoundingClientRect(),tip=bubble.current.getBoundingClientRect();
    setPosition({left:Math.max(8,Math.min(rect.left+(rect.width-tip.width)/2,innerWidth-tip.width-8)),top:Math.max(8,rect.bottom+tip.height+8<innerHeight?rect.bottom+8:rect.top-tip.height-8)});
    const previous=active.target.getAttribute('aria-describedby');
    active.target.setAttribute('aria-describedby',[previous,'mycut-tooltip'].filter(Boolean).join(' '));
    // A tab switch or modal dismissal can remove the anchor without pointerout.
    const observer=new MutationObserver(()=>{if(!active.target.isConnected)setActive(undefined);});
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>{observer.disconnect();if(previous)active.target.setAttribute('aria-describedby',previous);else active.target.removeAttribute('aria-describedby');};
  },[active]);
  return active?createPortal(<div id="mycut-tooltip" ref={bubble} role="tooltip" className="control-tooltip" style={position}>{active.text}</div>,document.fullscreenElement??document.body):null;
}
