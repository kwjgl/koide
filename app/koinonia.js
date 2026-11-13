// 코이데 공동체 만들기·로그인·초대 신청. 공동체 안의 기도 화면은 index.html 모임 모드를 쓴다.
(() => {
  const CFG=window.KOIDE_CONFIG||{}, q=new URLSearchParams(location.search);
  const scene=q.get('as')||'', explicitDemo=q.has('demo'), demo=explicitDemo||!CFG.SUPABASE_URL;
  const S={page:'load',list:[],places:3,info:null,peek:null,invite:q.get('invite')||'',sheet:'',busy:false,
    error:'',msg:'',months:3,limited:false,loginProviders:['kakao'],id:'',joinError:'',sheetError:'',draftName:'',draftPerson:'',draftJoin:'',navigating:false};
  const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  const nick=()=>{try{return localStorage.getItem('koide-koinonia-name')||'';}catch(e){return '';}};
  const remember=s=>{try{localStorage.setItem('koide-koinonia-name',s);}catch(e){}};
  const err=e=>(e&&e.message)||'다시 시도해 주세요.';
  // 목록 화면 대신 노트의 공동체 카드로 돌아간다. ?c=는 로그인 복귀용이므로 여기서 건드리지 않는다.
  const noteMore=()=>location.replace('note.html'+(explicitDemo?'?demo':'')+'#my-groups');
  let demoLoad=null;
  async function fake(){
    if(window.koideKoinoniaDemo)return window.koideKoinoniaDemo;
    if(!demoLoad)demoLoad=new Promise((ok,no)=>{
      const s=document.createElement('script');s.src='demo/koinonia-demo.js';
      s.onload=()=>ok(window.koideKoinoniaDemo);s.onerror=()=>no({code:'net',message:'데모를 불러오지 못했어요.'});document.head.appendChild(s);
    });return demoLoad;
  }
  async function kApi(name,args){return demo?(await fake()).call(name,args||{}):window.KoideSb.rpc(name,args||{});}
  const nday=()=>new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Seoul'}));
  const ymd=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const addMonthsStr=m=>{const d=nday(),n=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+m);d.setDate(Math.min(n,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));return ymd(d)};
  const krday=d=>{if(!d)return '';const a=String(d).slice(0,10).split('-').map(Number);return a[1]+'월 '+a[2]+'일'};
  const days=d=>{if(!d)return null;const a=String(d).slice(0,10),today=ymd(nday());return Math.round((Date.parse(a+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/864e5)};
  const endText=e=>e?', '+krday(e)+'까지':'';
  const finishText=e=>e?krday(e)+'까지':'끝나는 날 없이 계속해요';
  const agree=()=>'<ul class="agree hint"><li>공동체 사람들과 함께 보기 때문에 암호화되지 않고 서버에 저장돼요.</li><li>모임에서 나가면 내 기도제목도 지워져요.</li></ul>';
  const banner=()=>demo?'<div class="demo-banner"><span>데모 모드예요</span><button class="link" data-a="reset">데모 데이터 지우기</button></div>':'';
  const KNOT = '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M.5 8.5h3.8c1.2 0 1.7-1.5 1.7-2.8C6 3.7 7.3 2.5 9 2.5s3 1.2 3 3.1-1.8 3.1-4 3.3"/><path d="M5.6 10.1C7.6 9 9.6 8.5 15.5 8.5"/></svg>';
  // 화면 설정: 노트·교회와 같은 곳(koide-pref)에 둔다
  const PREF=(()=>{try{return JSON.parse(localStorage.getItem('koide-pref'))||{};}catch(e){return {};}})();
  const MODES=[['system','기기 설정'],['light','밝게'],['dark','어둡게']], STYLES=[['flat','basic'],['neu','new'],['skeu','classic'],['glass','glass']];
  const ACCENTS=[['green','초록','#2B6A62'],['amber','주황','#C46A24'],['blue','파랑','#2F5D95'],['rose','장미','#A8435C'],['ink','먹색','#3A3A36'],['paper','종이','#6B4A2E']];
  function setPref(k,v){
    PREF[k]=v;try{localStorage.setItem('koide-pref',JSON.stringify(PREF));}catch(e){}
    const d=document.documentElement;
    if(PREF.mode==='light'||PREF.mode==='dark')d.dataset.mode=PREF.mode;else delete d.dataset.mode;
    if(PREF.accent&&PREF.accent!=='green')d.dataset.accent=PREF.accent;else delete d.dataset.accent;
    if(PREF.style&&PREF.style!=='flat')d.dataset.style=PREF.style;else delete d.dataset.style;
    if(PREF.big)d.dataset.big=PREF.big===2?'2':'';else delete d.dataset.big;
  }
  function bigControls(){
    const level=PREF.big===true?1:Number(PREF.big)||0;
    return '<div class="seg" role="radiogroup" aria-label="큰 글씨">'+[[0,'보통'],[1,'크게'],[2,'아주 크게']].map(([k,l])=>'<button class="'+(level===k?'on':'')+'" role="radio" aria-checked="'+(level===k)+'" data-a="pref" data-k="big" data-v="'+k+'">'+l+'</button>').join('')+'</div>';
  }
  function screenControls(){
    const mode=PREF.mode||'system',accent=PREF.accent||'green',style=PREF.style||'flat';
    return '<div class="seg" role="radiogroup" aria-label="화면 모드">'+MODES.map(([k,l])=>'<button class="'+(mode===k?'on':'')+'" role="radio" aria-checked="'+(mode===k)+'" data-a="pref" data-k="mode" data-v="'+k+'">'+l+'</button>').join('')+'</div>'+
      '<div class="swatches" role="radiogroup" aria-label="색 테마">'+ACCENTS.map(([k,l,c])=>'<button class="swatch'+(accent===k?' on':'')+'" role="radio" aria-checked="'+(accent===k)+'" data-a="pref" data-k="accent" data-v="'+k+'" aria-label="'+l+'" title="'+l+'"><i style="background:'+c+'"></i></button>').join('')+'</div>'+
      '<div class="seg" role="radiogroup" aria-label="디자인">'+STYLES.map(([k,l])=>'<button class="'+(style===k?'on':'')+'" role="radio" aria-checked="'+(style===k)+'" data-a="pref" data-k="style" data-v="'+k+'">'+l+'</button>').join('')+'</div>'+
      '<div class="row"><span class="mhead">큰 글씨</span></div>'+bigControls();
  }
  const GEAR='<svg class="ic" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="8" cy="8" r="2"/><path d="M8 1.8v1.6M8 12.6v1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M1.8 8h1.6M12.6 8h1.6M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1"/></svg>';
  // 함께하는 곳 메뉴: 노트·교회 화면과 같은 places.js로 그린다(교회 사랑방은 이 기기에 남은 교회 화면에서 이름을 가져온다)
  function placesMenu(){
    const D=explicitDemo?'?demo':'';let room=null,linked=false;
    try{const c=JSON.parse(localStorage.getItem(explicitDemo?'koide-demo-cache':'koide-cache')||'null');if(c&&c.month&&c.month.room&&c.me&&c.me.link&&c.me.link.status==='연결'){room={name:c.month.room.name};linked=true;}}catch(e){}
    if(!window.koidePlaces)return '';
    return window.koidePlaces.html({cur:'',room,linked,demo:explicitDemo,groups:[],circles:S.list,circleMake:S.page!=='login'&&S.page!=='off'&&S.places>0,
      attr:(k,id)=>k==='note'?'href="note.html'+D+'"':k==='room'?'href="index.html'+D+'"':k==='circle'?'href="index.html'+(explicitDemo?'?demo&c=':'?c=')+encodeURIComponent(id)+'"':'data-a="new"'});
  }
  const head=()=>'<header class="topbar"><div class="inner"><a href="note.html'+(explicitDemo?'?demo':'')+'" class="brand"><span class="brand-mark">'+KNOT+'</span>코이데</a>'+
    '<span style="display:flex;align-items:center;gap:.3em"><button class="badge-btn" data-a="menu" data-v="badge" aria-haspopup="menu" aria-expanded="'+(S.menu==='badge')+'">코이데 공동체</button>'+
    '<button class="icon-btn" data-a="menu" data-v="settings" aria-haspopup="menu" aria-expanded="'+(S.menu==='settings')+'" aria-label="설정">'+GEAR+'</button></span>'+
    (S.menu==='badge'?'<div class="menu" role="menu" aria-label="함께하는 곳">'+placesMenu()+'</div>':S.menu==='settings'?'<div class="menu" role="menu" aria-label="설정"><p class="mlabel mhead">화면 설정</p><div class="menu-set">'+screenControls()+'</div></div>':'')+
    '</div></header>';
  const notice=()=>S.msg?'<p class="hint" role="status">'+esc(S.msg)+'</p>':'';
  const error=()=>S.error?'<p class="error" role="alert">'+esc(S.error)+'</p>':'';
  const layout=inner=>banner()+(q.has('new')&&(S.page==='create'||S.page==='load')?'':head())+'<main class="wrap'+(S.page==='create'?' create-wrap':'')+'">'+inner+'</main>';
  function login(){
    return '<div class="card" style="max-width:460px;margin:45px auto;align-items:center;text-align:center">'+
      '<span class="wl-mark" aria-hidden="true">'+KNOT+'</span><h1>코이데 공동체</h1>'+
      '<div style="width:100%;display:grid;gap:8px">'+S.loginProviders.map(k=>'<button class="btn sso-btn sso-'+k+'" data-a="oauth" data-v="'+k+'">'+(window.KoideSb.logos[k]||'')+
      '<span>'+({kakao:'카카오로 계속',google:'Google로 계속',apple:'Apple로 계속'}[k]||'로그인')+'</span></button>').join('')+'</div>'+error()+'</div>';
  }
  const inviteUrl=t=>location.origin+location.pathname+(demo?'?demo&invite=':'?invite=')+encodeURIComponent(t);
  function invite(){
    const p=S.peek;return '<button class="link" data-a="back">‹ 코이데 노트로</button><h1>'+esc(p.name)+'</h1>'+
      '<p class="hint" style="margin-bottom:18px">모임장 '+esc(p.lead||'')+(p.endsOn?', '+esc(krday(p.endsOn))+'까지':'')+'</p>'+
      '<div class="card">'+agree()+'<label class="label" for="join-person">공동체에서 쓸 내 이름</label>'+
      '<input class="field" id="join-person" maxlength="10" autocomplete="name" value="'+esc(S.draftJoin||nick())+'" placeholder="이름을 적어 주세요">'+
      (S.joinError?'<p class="error">'+esc(S.joinError)+'</p>':'')+
      '<button class="btn" data-a="join"'+(S.busy?' disabled':'')+'>동의하고 함께하기 신청</button>'+
      '<button class="link" data-a="back">나중에 할게요</button></div>';
  }
  const waiting=()=>'<div class="card"><h1>함께하기를 신청했어요</h1><p>모임장이 승인하면 들어갈 수 있어요.</p><button class="btn ghost" data-a="back">코이데 노트로</button></div>';
  const failed=()=>'<div class="card"><h1>초대 링크를 열 수 없어요</h1>'+error()+'<button class="btn ghost" data-a="back">코이데 노트로</button></div>';
  // 공동체 만들기는 겹쳐 뜨는 창 대신 독립된 카드 페이지로 보여 준다.
  function createPage(){
    const back='<a class="link create-back" href="note.html'+(explicitDemo?'?demo':'')+'#my-groups">‹ 코이데 노트로</a>';
    if(S.error)return back+'<div class="card"><h1>새 공동체 만들기</h1>'+error()+
      '<button class="btn ghost" data-a="retry">다시 불러오기</button></div>';
    if(S.places<=0)return back+'<div class="card"><h1>새 공동체 만들기</h1>'+
      '<p>코이데 공동체는 세 곳까지 함께할 수 있어요.</p>'+
      '<button class="btn wide" data-a="back">코이데 노트로</button></div>';
    return back+'<div class="card"><h1>새 공동체 만들기</h1>'+
      '<label class="label" for="create-name">공동체 이름</label>'+
      '<input class="field" id="create-name" maxlength="16" value="'+esc(S.draftName)+'" placeholder="금요 기도 모임">'+
      '<label class="label" for="create-person">공동체에서 쓸 내 이름</label>'+
      '<input class="field" id="create-person" maxlength="10" value="'+esc(S.draftPerson)+'" placeholder="이름을 적어 주세요">'+
      '<div class="row"><span>끝나는 날 정하기</span><button class="switch'+(S.limited?' on':'')+'" data-a="limit" role="switch" aria-checked="'+S.limited+'"><span></span></button></div>'+
      (S.limited?'<div class="seg">'+[1,3,6,12].map(m=>'<button data-a="months" data-v="'+m+'" class="'+(S.months===m?'on':'')+'">'+m+'개월<small>'+krday(addMonthsStr(m))+'까지</small></button>').join('')+'</div>':'')+
      agree()+(S.sheetError?'<p class="error" role="alert">'+esc(S.sheetError)+'</p>':'')+
      '<button class="btn wide" data-a="create"'+(S.busy?' disabled':'')+'>'+(S.busy?'만드는 중…':'동의하고 만들기')+'</button></div>';
  }
  function render(){
    let inside='';
    if(S.page==='off')inside='<div class="card"><h1>코이데 공동체는 곧 열려요.</h1><a class="btn ghost" href="note.html">코이데 노트로</a></div>';
    else if(S.page==='login')inside=login();
    else if(S.page==='create')inside=createPage();
    else if(S.page==='invite')inside=invite();
    else if(S.page==='waiting')inside=waiting();
    else if(S.page==='error')inside=failed();
    else inside='<h1>코이데 공동체</h1><p class="hint">불러오는 중이에요…</p>'+error();
    $('root').innerHTML=layout(inside);
    // 화면 전환 그림(splash.js)은 첫 화면을 그린 뒤에 닫는다. 불러오는 중에는 그대로 둔다
    if(S.page!=='load'&&window.koideSplash)window.koideSplash.hide();
  }
  function clearInvite(){
    S.invite='';S.peek=null;S.joinError='';
    const u=new URL(location.href);u.searchParams.delete('invite');history.replaceState(null,'',u.pathname+u.search+u.hash);
  }
  async function loadCreate(){
    S.page='load';S.error='';render();
    try {
      const a=await kApi('community_mine');
      S.list=a.list||[];S.places=a.places??3;S.page='create';
      S.sheet='';S.sheetError='';S.limited=false;S.draftName='';S.draftPerson=nick();
    } catch(e) {
      if(e.code==='login'&&!demo){S.page='login';S.loginProviders=await window.KoideSb.providers();}
      else {S.page='create';S.error=err(e);}
    }
    render();
  }
  function open(id){
    if(!id)return;
    location.href='index.html'+(demo?'?demo&c=':'?c=')+encodeURIComponent(id);
  }
  async function loadInvite(){
    if(!S.invite)return noteMore();
    S.page='load';S.error='';render();
    try{
      const p=await kApi('community_peek',{p_token:S.invite});S.peek=p;
      if(p.mine==='함께'){
        // SQL peek에는 공동체 id가 없다. 이미 함께인 경우 join은 새 요청을 만들지 않고 id와 status만 돌려준다.
        const mine=await kApi('community_join',{p_token:S.invite,p_person:''});
        clearInvite();return open(mine.id);
      }
      S.page=p.mine==='요청'?'waiting':'invite';
      if(S.page==='waiting')clearInvite();
    }catch(e){if(e.code==='login'&&!demo){S.page='login';S.loginProviders=await window.KoideSb.providers();}
      else{S.page='error';S.error=err(e);}}
    render();
  }
  async function busy(run,where=''){
    if(S.busy)return;S.busy=true;S.sheetError='';S.joinError='';S.error='';render();
    try{await run();}catch(e){
      if(e.code==='login'&&!demo){S.page='login';S.sheet='';S.loginProviders=await window.KoideSb.providers();}
      else if(where==='sheet')S.sheetError=err(e);else if(where==='join')S.joinError=err(e);else S.error=err(e);
    }finally{S.busy=false;if(!S.navigating)render();}
  }
  const $v=id=>$(id)?.value||'';
  async function init(){
    const mode=scene==='off'?'off':scene==='login'?'login':null;
    if(!S.invite&&!q.has('new')&&!q.get('c')&&!mode&&scene!=='invite'&&scene!=='expired')return noteMore();
    if(mode==='off'){S.page='off';return render();}
    if(!demo&&!(CFG.COMMUNITY==='on'&&window.KoideSb.ready())){S.page='off';return render();}
    if(demo){
      const d=await fake();
      if(scene==='invite'||scene==='expired')S.invite=d.initialInvite();
      if(mode==='login'){S.page='login';return render();}
      if(q.get('c'))return open(q.get('c'));
      return S.invite?loadInvite():q.has('new')?loadCreate():noteMore();
    }
    try{const session=await window.KoideSb.session();
      if(!session){S.page='login';S.loginProviders=await window.KoideSb.providers();return render();}
      try{localStorage.removeItem('koide-koinonia-resume');}catch(e){}
      const u=new URL(location.href);
      if(['code','error','error_code','error_description'].some(k=>u.searchParams.has(k))){
        ['code','error','error_code','error_description'].forEach(k=>u.searchParams.delete(k));
        history.replaceState(null,'',u.pathname+u.search+u.hash);
      }
      if(!S.invite&&u.searchParams.has('error_description'))S.error='로그인이 끝나지 않았어요.';
      if(q.get('c'))return open(q.get('c'));
      return S.invite?loadInvite():q.has('new')?loadCreate():noteMore();
    }catch(e){S.page='login';S.error=err(e);S.loginProviders=await window.KoideSb.providers();render();}
  }
  document.addEventListener('input',ev=>{const id=ev.target.id;if(id==='create-name')S.draftName=ev.target.value;else if(id==='create-person')S.draftPerson=ev.target.value;else if(id==='join-person')S.draftJoin=ev.target.value;});
  document.addEventListener('click',async ev=>{
    const b=ev.target.closest('[data-a]');
    if(S.menu&&!ev.target.closest('.menu')&&!(b&&b.dataset.a==='menu')){S.menu=null;render();if(!b)return;}
    if(!b)return;
    if(b.dataset.a==='menu'){S.menu=S.menu===b.dataset.v?null:b.dataset.v;return render();}
    if(b.dataset.a==='pref'){const k=b.dataset.k;setPref(k,k==='big'?Number(b.dataset.v):b.dataset.v);return render();}
    if(ev.target.closest('[data-stop]')&&!b.closest('[data-stop]'))return;
    const a=b.dataset.a,v=b.dataset.v;
    if(a==='none')return;
    if(a==='close'){S.sheet='';S.sheetError='';return noteMore();}
    if(a==='back'){clearInvite();S.sheet='';return noteMore();}
    if(a==='new')return location.assign('koinonia.html'+(explicitDemo?'?demo&new':'?new'));
    if(a==='retry')return loadCreate();
    if(a==='limit'){S.limited=!S.limited;return render();}
    if(a==='months'){S.months=Number(v);return render();}
    if(a==='open')return open(v);
    if(a==='oauth')return busy(async()=>window.KoideSb.oauth(v));
    if(a==='reset'){(await fake()).reset();clearInvite();return q.has('new')?loadCreate():noteMore();}
    if(a==='create'){
      const name=$v('create-name'),person=$v('create-person');
      return busy(async()=>{
      const res=await kApi('community_create',{p_name:name,p_person:person,p_months:S.limited?S.months:null});
      remember(person.trim());S.navigating=true;
      location.replace('index.html'+(explicitDemo?'?demo&c=':'?c=')+encodeURIComponent(res.id));
    },'sheet'); }
    if(a==='join'){
      const person=$v('join-person');
      return busy(async()=>{
      const res=await kApi('community_join',{p_token:S.invite,p_person:person});
      remember(person.trim());S.draftJoin='';clearInvite();
      if(res.status==='함께')return open(res.id);
      S.page='waiting';
    },'join'); }
    if(a==='copy')return busy(async()=>{await navigator.clipboard.writeText(inviteUrl(S.info.token));S.msg='초대 링크를 복사했어요.';});
    if(a==='share')return busy(async()=>{try{await navigator.share({title:S.info.name,url:inviteUrl(S.info.token)});}catch(e){if(e.name!=='AbortError')throw e;}});
    if(a==='renew'){if(!confirm('새 링크를 만들면 예전 링크로는 들어올 수 없어요. 새로 만들까요?'))return;
      return busy(async()=>{const r=await kApi('community_renew',{p_id:S.id});S.info.token=r.token;S.info.expires=r.expires;S.msg='새 초대 링크를 만들었어요.';});}
    if(a==='approve'||a==='reject'){
      if(a==='reject'&&!confirm('함께하기 신청을 거절할까요?'))return;
      return busy(async()=>{await kApi('community_decide',{p_id:S.id,p_member:v,p_ok:a==='approve'});
        S.info=await kApi('community_info',{p_id:S.id});S.sheet=S.info.asks?.length?'asks':'';S.msg=a==='approve'?'함께하기를 승인했어요.':'신청을 거절했어요.';},'sheet');
    }
  });
  init();
})();
