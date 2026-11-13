// 코이데 공동체의 서버 응답을 코이데 교회 모임 모드의 모양으로 바꾼다.
window.koideCommunityApi = (() => {
  const q = new URLSearchParams(location.search);
  const demo = q.has('demo');
  const unsupported = () => ({ ok:false, code:'bad', message:'공동체에서는 아직 쓸 수 없어요.' });
  const dateLabel = value => {
    if (!value) return '';
    const m = String(value).match(/^\d{4}-(\d\d)-(\d\d)/);
    return m ? Number(m[1]) + '월 ' + Number(m[2]) + '일' : '';
  };
  let demoPromise;
  async function rpc(name, args = {}) {
    if (!demo) return window.KoideSb.rpc(name, args);
    if (!demoPromise) demoPromise = new Promise((resolve, reject) => {
      if (window.koideKoinoniaDemo) return resolve(window.koideKoinoniaDemo);
      const el = document.createElement('script');
      el.src = 'demo/koinonia-demo.js';
      el.onload = () => resolve(window.koideKoinoniaDemo);
      el.onerror = () => reject({ code:'net', message:'공동체 데모를 불러오지 못했어요.' });
      document.head.appendChild(el);
    });
    return (await demoPromise).call(name, args);
  }
  // Code.js weaveShuffle_: FNV-1a 32비트 해시 + LCG Fisher-Yates.
  function shuffled(count, seed) {
    const a = Array.from({length:count}, (_,i)=>i);
    let h = 2166136261;
    for (let i=0;i<seed.length;i++) { h ^= seed.charCodeAt(i); h = Math.imul(h,16777619); }
    let x = h >>> 0;
    for (let i=a.length-1;i>0;i--) {
      x = (Math.imul(x,1664525)+1013904223) >>> 0;
      const j = x % (i+1); [a[i],a[j]]=[a[j],a[i]];
    }
    const newIndex = [];
    a.forEach((original,i) => { newIndex[original]=i; });
    return newIndex;
  }
  function weave(raw) {
    if (!raw) return null;
    const n=Math.max(0,Math.min(20,Number(raw.n)||0));
    const at=shuffled(n,String(raw.id||''));
    const shift = pair => Array.isArray(pair)&&pair.length>=2&&at[pair[0]]!=null&&at[pair[1]]!=null
      ? [at[pair[0]],at[pair[1]],...pair.slice(2)] : null;
    const sort=(a,b)=>a[0]-b[0]||a[1]-b[1];
    const mapped = arr => (Array.isArray(arr)?arr:[]).map(shift).filter(Boolean).map(p=>[Math.min(p[0],p[1]),Math.max(p[0],p[1]),...p.slice(2)]).sort(sort);
    return {...raw,n,pairs:mapped(raw.pairs),fresh:mapped(raw.fresh)};
  }
  const dept = name => ({id:'',name,group:'공동체',unit:'개인'});
  function month(raw) {
    if (!raw || !raw.month) throw { code:'bad', message:'이 공동체는 열 수 없어요.' };
    const families=(raw.families||raw.members||[]).map(f=>({
      ...f, kids:[], status:f.status==='changed'?'edited':(f.status||'same'),
      items:(f.items||[]).map(i=>({...i,scope:'room',editedAt:f.own?dateLabel(i.editedAt):'',editedBy:f.own?(i.editedBy||f.name):''})),
      ended:f.own?(f.ended||[]):[]
    }));
    const stage=raw.received?.stage||'none';
    const received=raw.received && typeof raw.received.n==='number'
      ? {...raw.received} : {n:stage==='none'?0:1,of:stage==='soft'?3:1,stage};
    const info=raw.group||{};
    return {
      ...raw,dept:dept(raw.name||raw.room?.name||''),room:raw.room||{id:raw.id,name:raw.name},
      group:{...info,at:dateLabel(info.at),asks:(info.asks||[]).map(x=>({...x,at:dateLabel(x.at)}))},
      me:{...(raw.me||{}),admin:false,grp:raw.id},
      families,received,serve:[],art:raw.art||{month:raw.month,hero:0,fams:0,hearts:0},weave:weave(raw.weave)
    };
  }
  function threads(mine, now) {
    const all=(mine||[]).flatMap(m=>(m.items||[]).map(x=>({...x,month:m.month})));
    const byId=new Map(all.map(x=>[String(x.id),x])),next=new Map();
    all.forEach(x=>{if(x.prevId&&byId.has(String(x.prevId)))next.set(String(x.prevId),x);});
    const list=all.filter(x=>!x.prevId||!byId.has(String(x.prevId))).map(first=>{
      let last=first,n=0;
      while(next.has(String(last.id))&&n++<600)last=next.get(String(last.id));
      return {target:last.target,text:last.text,scope:'room',from:first.month,to:last.month,ended:!!last.ended};
    });
    return list.sort((a,b)=>Number(b.to===now&&!b.ended)-Number(a.to===now&&!a.ended)||a.from.localeCompare(b.from));
  }
  const monthFor = async id => {
    const [raw, status] = await Promise.all([
      rpc('community_view',{p_id:id}),rpc('community_status',{p_id:id})
    ]);
    if (status.state === '닫음' || raw.state === '닫음') return {
      id,closed:true,state:'닫음',group:{state:'닫음'},room:{id,name:'공동체'},
      me:{role:'회원',admin:false,grp:id},families:[],month:new Date().toISOString().slice(0,7)
    };
    const result = month(raw);
    result.group = {...result.group,...status};
    result.state = status.state;
    return result;
  };
  async function handle(body) {
    const id=body.grp;
    switch(body.action) {
      case 'month': return monthFor(id);
      case 'pray': {
        const r=await rpc('community_pray',{p_id:id,p_member:body.familyId});
        return {...r,art:await rpc('community_art',{})};
      }
      case 'saveItem':
        await rpc('community_item_save',{p_id:id,p_text:body.text,p_target:body.target||'',p_item:body.id||null});
        return monthFor(id);
      case 'saveItems':
        await rpc('community_items_add',{p_id:id,p_items:(body.items||[]).map(i=>({target:i.target||'',text:i.text}))});
        return monthFor(id);
      case 'deleteItem':
        await rpc('community_item_del',{p_id:id,p_item:body.id});return monthFor(id);
      case 'endItem':
      case 'reopenItem':
        await rpc('community_item_end',{p_id:id,p_item:body.id,p_end:body.action==='endItem'});return monthFor(id);
      case 'confirmSame':
        await rpc('community_confirm_same',{p_id:id});return monthFor(id);
      case 'history': {
        const h=await rpc('community_history',{p_id:id,p_month:body.month||null});
        return {...h,threads:threads(h.mine,h.now)};
      }
      case 'groupDecide':
        await rpc('community_decide',{p_id:id,p_member:body.id,p_ok:!!body.ok});return monthFor(id);
      case 'groupRemove':
        await rpc('community_remove',{p_id:id,p_member:body.id});return monthFor(id);
      case 'groupRename':
        await rpc('community_rename',{p_id:id,p_name:body.name});return monthFor(id);
      case 'groupRenew':
        await rpc('community_renew',{p_id:id});return monthFor(id);
      case 'groupLeave':
        return rpc('community_leave',{p_id:id});
      case 'groupHandoff':
        await rpc('community_handoff',{p_id:id,p_member:body.id});return monthFor(id);
      case 'groupEnd':
        await rpc('community_end',{p_id:id});return monthFor(id);
      case 'groupEnds':
        await rpc('community_ends_change',{p_id:id,p_months:body.months??null});return monthFor(id);
      case 'groupReport':
        return rpc('community_report',{p_id:id,p_reason:body.reason,p_note:body.note||''});
      case 'sendFeedback':
        return rpc('feedback_put',{p_kind:body.kind,p_text:body.text,p_named:!!body.named,p_ver:body.ver||'',p_width:body.width||''});
      case 'usage': return {kept:true,n:0};
      case 'tourDone': await rpc('tour_mark').catch(() => {}); return {ok:true};
      case 'tourSeen': return {seen:!!(await rpc('tour_seen'))};
      case 'surveyState': return {survey:body.survey||{}};
      default: throw unsupported();
    }
  }
  async function call(body) {
    try {
      if (!body || !body.grp && !['usage','tourDone','tourSeen','surveyState','sendFeedback'].includes(body.action)) return unsupported();
      return {ok:true,data:await handle(body)};
    } catch(e) {
      if (e && e.ok===false) return e;
      return {ok:false,code:e?.code||'bad',message:e?.message||'공동체 서버에 연결하지 못했어요.'};
    }
  }
  return {call,month,threads,weave};
})();