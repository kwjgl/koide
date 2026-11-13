// 예시 데이터만 쓰는 공동체 데모. 장면 주소는 이 창에서만 변경하고 기기에 남기지 않는다.
window.koideKoinoniaDemo = (() => {
  const q = new URLSearchParams(location.search), scene = q.get('as') || '';
  const key = 'koide-demo-koinonia', transient = !!scene;
  const err = msg => { throw { code: 'bad', message: msg }; };
  const day = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const date = d => [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
  const add = (m, d = day()) => {
    const k = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + m);
    d.setDate(Math.min(k, new Date(d.getFullYear(), d.getMonth()+1, 0).getDate()));
    return date(d);
  };
  const id = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  const token = () => id().replace(/[^a-z0-9]/g, '') + id();
  const me = '새봄';
  let memory = null;
  const seeds = () => {
    const c1 = {id:'demo-a', name:'금요 기도 모임',months:null,endsOn:null,state:'열림',token:token(),expires:new Date(Date.now()+7*864e5).toISOString(),
      members:['새봄','가람','나래','다온','보람','하늘'].map((n,i)=>({id:'a-'+i,name:n,role:i?'회원':'모임장',own:!i,status:'함께',at:new Date(Date.now()-i*864e5).toISOString()}))
        .concat(['이슬','한결'].map((n,i)=>({id:'ask-'+i,name:n,role:'회원',own:false,status:'요청',at:new Date(Date.now()-i*864e5).toISOString()})))};
    const c2 = {id:'demo-b',name:'대학 동기 모임',months:3,endsOn:add(3),state:'열림',token:token(),expires:new Date(Date.now()+7*864e5).toISOString(),
      members:['다온','새봄','유진','지우'].map((n,i)=>({id:'b-'+i,name:n,role:i?'회원':'모임장',own:n===me,status:'함께',at:new Date(Date.now()-i*864e5).toISOString()}))};
    const c3 = {id:'demo-c',name:'동네 이웃 모임',months:null,endsOn:null,state:'열림',token:token(),expires:new Date(Date.now()+7*864e5).toISOString(),
      members:[{id:'c-0',name:'현우',role:'모임장',status:'함께',own:false,at:new Date().toISOString()}]};
    const mon=date(day()).slice(0,7);
    const prev=date(new Date(day().getFullYear(),day().getMonth()-1,1)).slice(0,7);
    const at='2026-11-12T14:34:33';
    const items=[];
    const addItem=(member,month,target,text,state='새로',prevId=null,same=false)=>{
      const x={id:id(),communityId:'demo-a',memberId:member,month,target,text,state,prevId,same,editedAt:at};
      items.push(x);return x;
    };
    const p=addItem('a-0',prev,'나','일상에서 기도하는 시간을 지키도록','이어짐');
    addItem('a-0',mon,'나','일상에서 기도하는 시간을 지키도록','이어짐',p.id,true);
    addItem('a-0',mon,'가족','가족이 서로의 이야기를 잘 듣도록');
    addItem('a-0',mon,'학교·직장','맡은 일을 성실하게 하도록','마침');
    addItem('a-1',mon,'친구','친구들과 함께하는 시간에 감사하도록');
    addItem('a-2',mon,'나','새 학기를 잘 준비하도록');
    addItem('a-3',mon,'가족','가족의 건강을 위해');
    addItem('a-4',mon,'기타','이웃의 어려움을 기억하도록');
    addItem('a-5',mon,'학교·직장','일터에서 지혜를 구하도록');
    const today=date(day());
    const prayers=[
      {communityId:'demo-a',by:'a-0',to:'a-1',day:today},
      {communityId:'demo-a',by:'a-0',to:'a-2',day:today},
      {communityId:'demo-a',by:'a-1',to:'a-0',day:today},
      {communityId:'demo-a',by:'a-2',to:'a-0',day:today}
    ];
    const ended = {id:'demo-ended',name:'가을 기도 공동체',months:3,endsOn:add(-1),state:'끝맺음',
      closedAt:new Date().toISOString(),token:token(),expires:new Date(Date.now()+7*864e5).toISOString(),
      members:[{id:'end-0',name:me,role:'모임장',own:true,status:'함께',at:new Date().toISOString()}]};
    const closed = {id:'demo-closed',name:'닫힌 공동체',months:null,endsOn:null,state:'닫음',
      closedAt:new Date().toISOString(),token:token(),expires:new Date(Date.now()+7*864e5).toISOString(),
      members:[{id:'closed-0',name:me,role:'회원',own:true,status:'함께',at:new Date().toISOString()}]};
    const data={rooms:[c1,c2,c3,ended,closed],items,prayers,monthly:{},reports:[],last:''};
    if(scene==='empty')data.rooms=[];
    if(scene==='full') c3.members.push({id:'c-me',name:me,role:'회원',status:'요청',own:true,at:new Date().toISOString()});
    if(scene==='invite'||scene==='expired'){
      data.rooms=[c3];
      if(scene==='expired')c3.expires=new Date(Date.now()-864e5).toISOString();
      data.invite=c3.token;
    }
    return data;
  };
  function read() {
    if (memory) return memory;
    try { if(!transient) memory=JSON.parse(localStorage.getItem(key)||'null'); }catch(e) {/* 새로 */}
    return memory || (memory=seeds());
  }
  function save(d) {memory=d;if(!transient)try{localStorage.setItem(key,JSON.stringify(d));}catch(e){/* 메모리만 */}}
  function reset(){memory=seeds();if(!transient)try{localStorage.removeItem(key)}catch(e){};return memory;}
  const norm = s => String(s||'').trim().replace(/\s+/g,' ');
  const live = c => c.state==='열림'&&(!c.endsOn||c.endsOn>=date(day()));
  const own = c => c.members.find(m=>m.own);
  const count = c => c.members.filter(m=>m.status==='함께').length;
  const used = d => d.rooms.filter(c=>live(c)&&!!own(c)).length;
  function room(d,p_id){const c=d.rooms.find(x=>x.id===p_id);if(!c)err('공동체를 찾을 수 없어요.');return c;}
  function lead(c){if(!own(c)||own(c).role!=='모임장'||own(c).status!=='함께'||!live(c))err('모임장만 할 수 있어요.')}
  function peek(d,t){
    const c=d.rooms.find(x=>x.token===t);
    if(!c||Date.parse(c.expires)<=Date.now()||!live(c))err('이 초대 링크는 쓸 수 없어요. 모임장에게 새 링크를 받아 주세요.');
    return c;
  }
  // 데모도 SQL 004와 같은 기록 구조를 쓴다. 실제 계정이나 서버에는 닿지 않는다.
  const month=()=>date(day()).slice(0,7);
  const monthStart=()=>month()+'-01';
  const weekStart=()=>{const t=day();t.setDate(t.getDate()-t.getDay());return date(t)};
  const statusKey=(c,m)=>c.id+'/'+m.id+'/'+month();
  function ensure(d){
    if(!Array.isArray(d.items))d.items=[];
    if(!Array.isArray(d.prayers))d.prayers=[];
    if(!d.monthly)d.monthly={};
    if(!Array.isArray(d.reports))d.reports=[];
  }
  const owned=(c)=>own(c)&&own(c).status==='함께';
  function accessible(c){if(!owned(c))err('이 공동체를 볼 수 없어요.')}
  const actualState = c => c.state==='열림' && c.endsOn && c.endsOn<date(day()) ? '끝남' : c.state;
  const erased = c => {
    const x=actualState(c);
    if(x==='열림')return null;
    const d=new Date(x==='끝남'?c.endsOn+'T12:00:00':c.closedAt||Date.now());
    d.setDate(d.getDate()+30);return date(d);
  };
  const status = c => ({state:actualState(c),endsOn:c.endsOn||null,eraseOn:erased(c),canWrite:live(c)});
  const cleaned = (d,c,m) => {
    d.items=d.items.filter(x=>x.memberId!==m.id);
    d.prayers=d.prayers.filter(x=>x.by!==m.id&&x.to!==m.id);
    Object.keys(d.monthly).filter(k=>k.includes('/'+m.id+'/')).forEach(k=>delete d.monthly[k]);
  };
  function writable(c){accessible(c);if(!live(c))err('끝난 공동체라 쓸 수 없어요.')}
  const relevant=(d,c,member,mon)=>d.items.filter(x=>x.communityId===c.id&&x.memberId===member&&x.month===mon);
  function rollover(d,c){
    const mon=month(),dt=new Date(day().getFullYear(),day().getMonth()-1,1),prev=date(dt).slice(0,7);
    c.members.filter(m=>m.status==='함께').forEach(m=>{
      if(relevant(d,c,m.id,mon).length)return;
      relevant(d,c,m.id,prev).filter(x=>x.state!=='마침').forEach(x=>{
        d.items.push({...x,id:id(),month:mon,state:'이어짐',same:true,prevId:x.id});
      });
    });save(d);
  }
  function art(d,mon=month()){
    const mineIds=new Set(d.rooms.flatMap(c=>c.members.filter(x=>x.own).map(x=>x.id)));
    const p=d.prayers.filter(x=>mineIds.has(x.by)&&x.day.slice(0,7)===mon);
    const days=new Set(p.map(x=>x.day)), people=new Set(p.map(x=>x.communityId+'/'+x.to));
    const pairs=new Set(p.map(x=>x.day+'/'+x.communityId+'/'+x.to));
    return {month:mon,hero:days.size,fams:people.size,hearts:p.length-pairs.size};
  }
  function weave(d,c){
    const members=c.members.filter(x=>x.status==='함께').slice(0,20);
    const at=new Map(members.map((x,i)=>[x.id,i])),pairs=new Map();
    d.prayers.filter(p=>p.communityId===c.id).forEach(p=>{
      const a=at.get(p.by),b=at.get(p.to);
      if(a==null||b==null||a===b)return;
      const x=Math.min(a,b),y=Math.max(a,b),key=x+'/'+y;
      const row=pairs.get(key)||{x,y,n:0,first:p.day};
      row.n++;if(p.day<row.first)row.first=p.day;pairs.set(key,row);
    });
    const rows=[...pairs.values()].sort((a,b)=>a.x-b.x||a.y-b.y);
    return {id:c.id,name:c.name,from:date(new Date(c.createdAt||Date.now())),to:c.endsOn||'',
      n:members.length,pairs:rows.map(x=>[x.x,x.y,x.n>=6?3:x.n>=3?2:1]),
      fresh:rows.filter(x=>x.first===date(day())).map(x=>[x.x,x.y])};
  }
  function view(d,c){
    accessible(c);
    if(c.state==='닫음')return {id:c.id,name:c.name,state:'닫음'};
    if(live(c))rollover(d,c);
    const m=own(c),mon=month(),people=c.members.filter(x=>x.status==='함께'),start=monthStart(),today=date(day());
    const families=people.map(x=>{
      const ps=d.prayers.filter(p=>p.communityId===c.id&&p.by===m.id&&p.to===x.id);
      const all=relevant(d,c,x.id,mon);
      const show=i=>({id:i.id,target:i.target,text:i.text,scope:'room',same:!!i.same,
        isNew:!i.prevId&&!i.same,editedBy:x.own?x.name:'',
        editedAt:x.own?i.editedAt:'',prevId:x.own?i.prevId:null});
      return {id:x.id,name:x.name,kids:[],role:x.role,own:!!x.own,status:d.monthly[statusKey(c,x)]||'same',
        prayed:ps.filter(p=>p.day>=start).length,today:ps.filter(p=>p.day===today).length,
        week:ps.filter(p=>p.day>=weekStart()).length,
        items:all.filter(i=>i.state!=='마침').map(show),
        ended:x.own?all.filter(i=>i.state==='마침').map(i=>({id:i.id,target:i.target,text:i.text,scope:'room'})):[]};
    }).sort((a,b)=>Number(b.own)-Number(a.own));
    const by=new Set(d.prayers.filter(p=>p.communityId===c.id&&p.to===m.id&&p.by!==m.id&&p.day>=start).map(p=>p.by));
    const stage=!by.size?'none':by.size*2>=people.length-1?'deep':'soft';
    const group={id:c.id,name:c.name,lead:m.role==='모임장',max:30,at:c.createdAt||new Date().toISOString(),
      endsAt:c.endsOn||'',left:c.endsOn?Math.max(0,Math.round((new Date(c.endsOn+'T00:00:00Z')-new Date(today+'T00:00:00Z'))/864e5)):null,
      people:people.map(x=>({id:x.id,person:x.name,role:x.role,me:!!x.own})),
      asks:m.role==='모임장'?c.members.filter(x=>x.status==='요청').map(x=>({id:x.id,person:x.name,at:x.at})):[],
      token:m.role==='모임장'?c.token:''};
    return {id:c.id,name:c.name,month:mon,term:mon.slice(0,4),room:{id:c.id,name:c.name},role:m.role,state:actualState(c),
      me:{person:m.name,familyId:m.id,role:m.role,admin:false,grp:c.id},
      families,group,received:{n:stage==='none'?0:1,of:stage==='soft'?3:1,stage},
      serve:[],art:art(d),weave:weave(d,c)};
  }
  function historyView(d,c,want){
    accessible(c);
    const all=d.items.filter(x=>x.communityId===c.id);
    const months=[...new Set(all.map(x=>x.month))].sort().reverse();
    const selected=months.includes(want)?want:months.find(m=>m<month())||months[0]||month();
    const visible=c.members.filter(x=>x.status==='함께').map(x=>({
      id:x.id,name:x.name,own:!!x.own,items:relevant(d,c,x.id,selected).map(i=>({target:i.target,text:i.text,scope:'room',ended:i.state==='마침'}))
    }));
    const mine=months.map(mon=>({month:mon,items:all.filter(i=>i.memberId===own(c).id&&i.month===mon).map(i=>({
      id:i.id,prevId:i.prevId,target:i.target,text:i.text,scope:'room',ended:i.state==='마침'
    }))})).filter(x=>x.items.length);
    return {months,month:selected,now:month(),room:c.name,families:visible,mine};
  }
  function itemWrite(d,c,a,mode){
    writable(c);ensure(d);
    const m=own(c),mon=month(),list=relevant(d,c,m.id,mon);
    if(mode==='confirm'){d.monthly[statusKey(c,m)]='same';save(d);return {ok:true};}
    if(mode==='addMany'){
      if(!Array.isArray(a.p_items)||!a.p_items.length||a.p_items.length>30||list.length+a.p_items.length>60)err('한 번에 최대 30개를 넣을 수 있어요.');
      a.p_items.forEach(x=>itemWrite(d,c,{p_text:x.text,p_target:x.target},'save'));
      return {n:a.p_items.length};
    }
    const item=d.items.find(x=>x.id===a.p_item&&x.memberId===m.id&&x.communityId===c.id&&x.month===mon);
    if(mode==='save'){
      const text=String(a.p_text||'').trim(),target=String(a.p_target||'').trim();
      if(!text||text.length>500||target.length>10)err('기도제목은 1~500자로 적어 주세요.');
      if(a.p_item&&!item)err('고칠 기도제목을 찾을 수 없어요.');
      if(!a.p_item&&list.length>=60)err('한 달에 60개까지 적을 수 있어요.');
      const x=item||{id:id(),communityId:c.id,memberId:m.id,month:mon,prevId:null,state:'새로'};
      Object.assign(x,{text,target,same:false,editedAt:new Date().toISOString()});
      if(!item)d.items.push(x);
      d.monthly[statusKey(c,m)]='changed';save(d);return {id:x.id};
    }
    if(!item)err('고칠 기도제목을 찾을 수 없어요.');
    if(mode==='del')d.items=d.items.filter(x=>x!==item);
    else if(mode==='end')item.state=a.p_end===false?(item.prevId?'이어짐':'새로'):'마침';
    d.monthly[statusKey(c,m)]='changed';save(d);return {ok:true};
  }
  async function call(name,a={}){
    const d=read();let c,m,n;
    ensure(d);
    switch(name) {
      case 'tour_seen': return !!d.tour;
      case 'tour_mark': d.tour = true; save(d); return true;
      case 'community_status':
        c=room(d,a.p_id);accessible(c);return status(c);
      case 'community_leave':{
        c=room(d,a.p_id);m=own(c);
        if(!m)err('이 공동체의 지체가 아니에요.');
        c.members=c.members.filter(x=>x!==m);cleaned(d,c,m);
        const other=c.members.filter(x=>x.status==='함께').sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
        if(!other.length){d.rooms=d.rooms.filter(x=>x!==c);save(d);return {ok:true,gone:true};}
        if(m.role==='모임장')other[0].role='모임장';
        save(d);return {ok:true,gone:false};
      }
      case 'community_handoff':{
        c=room(d,a.p_id);lead(c);
        m=c.members.find(x=>x.id===a.p_member&&x.status==='함께'&&!x.own);
        if(!m)err('넘겨줄 지체를 확인해 주세요.');
        own(c).role='회원';m.role='모임장';save(d);return {ok:true};
      }
      case 'community_end':{
        c=room(d,a.p_id);lead(c);c.state='끝맺음';c.closedAt=new Date().toISOString();
        save(d);return {ok:true};
      }
      case 'community_ends_change':{
        c=room(d,a.p_id);lead(c);
        if(!c.endsOn)err('끝나는 날을 바꿀 수 없어요.');
        if(a.p_months!=null&&![1,3,6,12].includes(Number(a.p_months)))err('1·3·6·12개월 중에서 골라 주세요.');
        if(a.p_months==null)c.endsOn=null;
        else {const d0=new Date(c.endsOn+'T12:00:00');d0.setMonth(d0.getMonth()+Number(a.p_months));c.endsOn=date(d0);}
        c.months=a.p_months;save(d);return {ok:true,endsOn:c.endsOn};
      }
      case 'community_report':{
        c=room(d,a.p_id);accessible(c);
        if(!['기도제목이 맞지 않아요','괴롭히거나 불편해요','광고·홍보','그 밖'].includes(a.p_reason))err('신고 이유를 골라 주세요.');
        const note=String(a.p_note||'').trim();
        if(note.length>200)err('글은 200자까지 적을 수 있어요.');
        d.reports.push({communityId:c.id,at:new Date().toISOString(),reason:a.p_reason,note,status:'새로'});
        save(d);return {ok:true};
      }
      case 'community_export':{
        c=room(d,a.p_id);accessible(c);if(c.state==='닫음')err('이 공동체는 닫혔어요.');
        const seen=new Set();
        const items=d.items.filter(x=>x.communityId===c.id).slice().sort((a,b)=>b.month.localeCompare(a.month)).filter(x=>{
          const key=x.memberId+'|'+x.target+'|'+x.text;if(seen.has(key))return false;seen.add(key);return true;
        }).map(x=>({own:x.memberId===own(c).id,who:c.members.find(m=>m.id===x.memberId)?.name||'',target:x.target,text:x.text,month:x.month,ended:x.state==='마침'}));
        return {name:c.name,endsOn:c.endsOn,me:own(c).name,items};
      }

      case 'community_view':c=room(d,a.p_id);return view(d,c);
      case 'community_art':return art(d,a.p_month||month());
      case 'community_weave':c=room(d,a.p_id);accessible(c);return weave(d,c);
      case 'community_history':c=room(d,a.p_id);return historyView(d,c,a.p_month);
      case 'community_confirm_same':c=room(d,a.p_id);return itemWrite(d,c,a,'confirm');
      case 'community_item_save':c=room(d,a.p_id);return itemWrite(d,c,a,'save');
      case 'community_items_add':c=room(d,a.p_id);return itemWrite(d,c,a,'addMany');
      case 'community_item_del':c=room(d,a.p_id);return itemWrite(d,c,a,'del');
      case 'community_item_end':c=room(d,a.p_id);return itemWrite(d,c,a,'end');
      case 'community_pray':{
        c=room(d,a.p_id);writable(c);const who=own(c);
        const target=c.members.find(x=>x.id===a.p_member&&x.status==='함께');
        if(!target||target.id===who.id)err('이 사람을 위해 기도할 수 없어요.');
        let p=d.prayers.filter(x=>x.communityId===c.id&&x.by===who.id&&x.to===target.id);
        const today=date(day());
        const n=p.filter(x=>x.day===today).length;
        if(n<3)d.prayers.push({communityId:c.id,by:who.id,to:target.id,day:today});
        save(d);p=d.prayers.filter(x=>x.communityId===c.id&&x.by===who.id&&x.to===target.id);
        const countToday=p.filter(x=>x.day===today).length;
        return {prayed:p.filter(x=>x.day>=monthStart()).length,today:countToday,
          week:p.filter(x=>x.day>=weekStart()).length,capped:countToday>=3};
      }
      case 'feedback_put':return {ok:true};
      case 'community_mine': {
        const list=d.rooms.filter(c=>own(c)).map(c=>({id:c.id,name:c.name,role:own(c).role,status:own(c).status,n:count(c),
          endsOn:c.endsOn,state:actualState(c),eraseOn:erased(c),
          asks:own(c).role==='모임장'?c.members.filter(m=>m.status==='요청').length:0}));
        return {list,places:Math.max(0,3-used(d))};
      }
      case 'community_create':
        n=norm(a.p_name);m=norm(a.p_person);
        if(n.length<1||n.length>16||m.length<1||m.length>10)err('공동체 이름은 1~16자, 내 이름은 1~10자로 적어 주세요.');
        if(a.p_months!=null&&![1,3,6,12].includes(Number(a.p_months)))err('끝나는 날은 1·3·6·12개월 중에서 골라 주세요.');
        if(used(d)>=3)err('코이데 공동체는 세 곳까지 함께할 수 있어요. 다른 곳에서 나온 뒤 신청해 주세요.');
        c={id:id(),name:n,months:a.p_months==null?null:Number(a.p_months),endsOn:a.p_months==null?null:add(Number(a.p_months)),
          state:'열림',token:token(),expires:new Date(Date.now()+7*864e5).toISOString(),
          members:[{id:id(),name:m,role:'모임장',status:'함께',own:true,at:new Date().toISOString()}]};
        d.rooms.push(c);save(d);return {id:c.id,token:c.token,expires:c.expires};
      case 'community_peek':
        c=peek(d,a.p_token);return {name:c.name,lead:c.members.find(m=>m.role==='모임장')?.name||'',n:count(c),
          max:30,endsOn:c.endsOn,used:used(d),mine:own(c)?.status||null};
      case 'community_join':
        c=peek(d,a.p_token);if(own(c))return {id:c.id,status:own(c).status};
        m=norm(a.p_person);if(m.length<1||m.length>10)err('내 이름을 1~10자로 적어 주세요.');
        if(used(d)>=3)err('코이데 공동체는 세 곳까지 함께할 수 있어요. 다른 곳에서 나온 뒤 신청해 주세요.');
        c.members.push({id:id(),name:m,role:'회원',status:'요청',own:true,at:new Date().toISOString()});
        save(d);return {id:c.id,status:'요청'};
      case 'community_info':
        c=room(d,a.p_id);m=own(c);if(!m||m.status!=='함께')err('이 공동체를 볼 수 없어요.');
        return {id:c.id,name:c.name,role:m.role,endsOn:c.endsOn,months:c.months,
          state:c.state==='열림'&&c.endsOn<date(day())?'끝남':c.state,
          members:c.members.filter(x=>x.status==='함께').map(x=>({id:x.id,name:x.name,role:x.role,own:x.own})),
          asks:m.role==='모임장'?c.members.filter(x=>x.status==='요청').map(x=>({id:x.id,name:x.name,at:x.at})):null,
          token:m.role==='모임장'?c.token:null,expires:m.role==='모임장'?c.expires:null};
      case 'community_decide':
        c=room(d,a.p_id);lead(c);m=c.members.find(x=>x.id===a.p_member&&x.status==='요청');
        if(!m)err('승인 요청을 찾을 수 없어요.');
        if(a.p_ok){if(count(c)>=30)err('30명이 다 찼어요.');m.status='함께';}
        else c.members=c.members.filter(x=>x!==m);
        save(d);return {ok:true};
      case 'community_remove':
        c=room(d,a.p_id);lead(c);m=c.members.find(x=>x.id===a.p_member&&!x.own);
        if(!m)err('이 사람을 내보낼 수 없어요.');c.members=c.members.filter(x=>x!==m);save(d);return {ok:true};
      case 'community_rename':
        c=room(d,a.p_id);lead(c);n=norm(a.p_name);if(n.length<1||n.length>16)err('이름은 1~16자로 적어 주세요.');
        c.name=n;save(d);return {ok:true};
      case 'community_renew':
        c=room(d,a.p_id);lead(c);c.token=token();c.expires=new Date(Date.now()+7*864e5).toISOString();
        save(d);return {token:c.token,expires:c.expires};
      default:err('아직 이 기능은 없어요.');
    }
  }
  return {call,reset,scene,initialInvite:()=>read().invite||'',seedToken:()=>read().rooms[0]?.token||''};
})();
