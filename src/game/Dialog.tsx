import {useEffect,useRef,type ReactNode} from 'react';
import {X} from 'lucide-react';

export function Dialog({title,onClose,children,className='',closeDisabled=false}:{title:string;onClose:()=>void;children:ReactNode;className?:string;closeDisabled?:boolean}) {
  const ref=useRef<HTMLElement>(null),close=useRef(onClose);close.current=onClose;
  useEffect(()=> {
    const previous=document.activeElement as HTMLElement|null;
    const root=ref.current!;
    const backdrop=root.parentElement!;
    const siblings=Array.from(backdrop.parentElement?.children??[]).filter(el=>el!==backdrop) as HTMLElement[];
    const inertBefore=siblings.map(el=>el.inert);siblings.forEach(el=>el.inert=true);
    const focusables=()=>Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,a[href],[tabindex="0"]')).filter(el=>el.getClientRects().length>0);
    (focusables()[0]??root).focus();
    const key=(e:KeyboardEvent)=> {
      if(backdrop.inert)return;
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close.current();}
      if(e.key==='Tab') {
        const nodes=focusables(),first=nodes[0],last=nodes.at(-1);
        if(!first){e.preventDefault();root.focus();}
        else if(e.shiftKey&&(document.activeElement===first||document.activeElement===root)){e.preventDefault();last!.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    };
    const keepFocus=(e:FocusEvent)=>{if(!backdrop.inert&&!root.contains(e.target as Node))(focusables()[0]??root).focus();};
    document.addEventListener('keydown',key);document.addEventListener('focusin',keepFocus);
    return()=>{document.removeEventListener('keydown',key);document.removeEventListener('focusin',keepFocus);siblings.forEach((el,i)=>el.inert=inertBefore[i]);if(previous?.isConnected)previous.focus();};
  },[]);
  return <div className="modal-backdrop" onClick={onClose}><section ref={ref} tabIndex={-1} className={`modal game-dialog ${className}`} role="dialog" aria-modal="true" aria-label={title} onClick={e=>e.stopPropagation()}><div className="modal-head"><h2>{title}</h2><button className="icon-button" aria-label="关闭" disabled={closeDisabled} onClick={onClose}><X size={19}/></button></div>{children}</section></div>;
}
