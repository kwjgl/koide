// 코이데 공동체 목록·가입·초대. 공동체 안의 기도 화면은 index.html 모임 모드를 쓴다.
(() => {
  const CFG=window.KOIDE_CONFIG||{}, q=new URLSearchParams(location.search);
  const scene=q.get('as')||'', explicitDemo=q.has('demo'), demo=explicitDemo||!CFG.SUPABASE_URL;
  const S={page:'load',list:[],places:3,info:null,peek:null,invite:q.get('invite')||'',sheet:'',busy:false,
    error:'',msg:'',months:3,limited:false,loginProviders:['kakao'],id:'',joinError:'',sheetError:'',draftName:'',draftPerson:'',draftJoin:''};
  const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  const nick=()=>{try{return localStorage.getItem('koide-koinonia-name')||'';}catch(e){return '';}};
  const remember=s=>{try{localStorage.setItem('koide-koinonia-name',s);}catch(e){}};
  const err=e=>(e&&e.message)||'다시 시도해 주세요.';
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
  const agree=()=>'<div class="agree"><p>공동체 사람들과 함께 봐요. 휴대폰에서 잠그지 않고 서버에 저장돼요.</p><p>나가면 내 기도제목도 함께 지워져요.</p></div>';
  const banner=()=>demo?'<div class="demo-banner"><span>데모 모드예요</span><button class="link" data-a="reset">데모 데이터 지우기</button></div>':'';
  const KNOT = '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M.5 8.5h3.8c1.2 0 1.7-1.5 1.7-2.8C6 3.7 7.3 2.5 9 2.5s3 1.2 3 3.1-1.8 3.1-4 3.3"/><path d="M5.6 10.1C7.6 9 9.6 8.5 15.5 8.5"/></svg>';
  const head=()=>'<header class="topbar"><div class="inner"><a href="note.html'+(explicitDemo?'?demo':'')+'" class="brand"><span class="brand-mark">'+KNOT+'</span>코이데</a><a href="note.html'+(explicitDemo?'?demo':'')+'" class="badge-btn badge-link">코이데 공동체</a></div></header>';
  const notice=()=>S.msg?'<p class="hint" role="status">'+esc(S.msg)+'</p>':'';
  const error=()=>S.error?'<p class="error" role="alert">'+esc(S.error)+'</p>':'';
  const layout=inner=>banner()+head()+'<main class="wrap">'+inner+'</main>'+sheet();
  function login(){
    return '<div class="card" style="max-width:460px;margin:45px auto;align-items:center;text-align:center">'+
      '<span class="wl-mark" aria-hidden="true">'+KNOT+'</span><h1>코이데 공동체</h1>'+
      '<div style="width:100%;display:grid;gap:8px">'+S.loginProviders.map(k=>'<button class="btn sso-btn sso-'+k+'" data-a="oauth" data-v="'+k+'">'+(window.KoideSb.logos[k]||'')+
      '<span>'+({kakao:'카카오로 계속',google:'Google로 계속',apple:'Apple로 계속'}[k]||'로그인')+'</span></button>').join('')+'</div>'+error()+'</div>';
  }
  const chip=(label,extra='')=>'<span class="role-chip'+(extra?' '+extra:'')+'">'+esc(label)+'</span>';
  function list(){
    return '<h1>코이데 공동체</h1>'+error()+notice()+
      (S.list.length?'<div class="mlist">'+S.list.map(c=>{
        const closed=c.state==='닫음',ended=c.state==='끝남'||c.state==='끝맺음',
          wait=c.status==='요청',leader=c.role==='모임장';
        return '<button class="mrow" data-a="'+(wait||closed?'none':'open')+'" data-v="'+esc(c.id)+'"'+(wait||closed?' disabled':'')+'><span>'+
          '<b class="name-chips">'+esc(c.name)+(leader?chip('모임장'):'')+'</b><small>'+
          (closed?'닫힌 공동체예요':ended?(c.eraseOn?krday(c.eraseOn)+'에 지워져요':'끝난 공동체예요'):wait?'모임장의 승인을 기다려요':c.n+'명'+endText(c.endsOn))+
          '</small></span><span class="row mrow-end">'+(leader&&c.asks?chip('신청 '+c.asks,'ask-chip'):'')+
          (wait||closed?'':'<span aria-hidden="true">›</span>')+'</span></button>';
      }).join('')+'</div>':
      '<div class="card"><p>아직 함께하는 공동체가 없어요.</p></div>')+
      (S.places>0?'<button class="btn new-community" data-a="new">+ 공동체 만들기</button>':'<p class="hint">세 곳이 다 찼어요.</p>');
  }
  const inviteUrl=t=>location.origin+location.pathname+(demo?'?demo&invite=':'?invite=')+encodeURIComponent(t);
  function invite(){
    const p=S.peek;return '<button class="link" data-a="back">‹ 목록으로</button><h1>'+esc(p.name)+'</h1>'+
      '<p class="hint" style="margin-bottom:18px">모임장 '+esc(p.lead||'')+(p.endsOn?', '+esc(krday(p.endsOn))+'까지':'')+'</p>'+
      '<div class="card">'+agree()+'<label class="label" for="join-person">공동체에서 쓸 내 이름</label>'+
      '<input class="field" id="join-person" maxlength="10" autocomplete="name" value="'+esc(S.draftJoin||nick())+'" placeholder="이름을 적어 주세요">'+
      (S.joinError?'<p class="error">'+esc(S.joinError)+'</p>':'')+
      '<button class="btn" data-a="join"'+(S.busy?' disabled':'')+'>동의하고 함께하기 신청</button>'+
      '<button class="link" data-a="back">나중에 할게요</button></div>';
  }
  const waiting=()=>'<div class="card"><h1>함께하기를 신청했어요</h1><p>모임장이 승인하면 들어갈 수 있어요.</p><button class="btn ghost" data-a="back">목록으로</button></div>';
  const failed=()=>'<div class="card"><h1>초대 링크를 열 수 없어요</h1>'+error()+'<button class="btn ghost" data-a="back">목록으로</button></div>';
  function sheet(){
    if(!S.sheet)return '';
    if(S.sheet==='create'){
      return '<div class="sheet-back" data-a="close"><section class="sheet" role="dialog" aria-modal="true" aria-label="새 공동체" data-stop>'+
        '<h2>새 공동체</h2><label class="label" for="create-name">공동체 이름</label>'+
        '<input class="field" id="create-name" maxlength="16" value="'+esc(S.draftName)+'" placeholder="금요 기도 모임">'+
        '<label class="label" for="create-person">공동체에서 쓸 내 이름</label>'+
        '<input class="field" id="create-person" maxlength="10" value="'+esc(S.draftPerson||nick())+'" placeholder="이름을 적어 주세요">'+
        '<div class="row"><span>끝나는 날 정하기</span><button class="switch'+(S.limited?' on':'')+'" data-a="limit" role="switch" aria-checked="'+S.limited+'"><span></span></button></div>'+
        (S.limited?'<div class="seg">'+[1,3,6,12].map(m=>'<button data-a="months" data-v="'+m+'" class="'+(S.months===m?'on':'')+'">'+m+'개월<small>'+krday(addMonthsStr(m))+'까지</small></button>').join('')+'</div>':'')+
        agree()+(S.sheetError?'<p class="error" role="alert">'+esc(S.sheetError)+'</p>':'')+
        '<div class="row"><button class="btn ghost" data-a="close">취소</button><button class="btn" data-a="create"'+(S.busy?' disabled':'')+'>동의하고 만들기</button></div></section></div>';
    }
    return '';
  }
  function render(){
    let inside='';
    if(S.page==='off')inside='<div class="card"><h1>코이데 공동체는 곧 열려요.</h1><a class="btn ghost" href="note.html">코이데 노트로</a></div>';
    else if(S.page==='login')inside=login();
    else if(S.page==='list')inside=list();
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
  async function loadList(){
    S.page='load';S.error='';render();
    try{const a=await kApi('community_mine');S.list=a.list||[];S.places=a.places??3;S.page='list';}
    catch(e){if(e.code==='login'&&!demo){S.page='login';S.loginProviders=await window.KoideSb.providers();}
      else{S.page='list';S.error=err(e);}}
    if(q.has('new') && S.page==='list'){const u=new URL(location.href);u.searchParams.delete('new');history.replaceState(null,'',u.pathname+u.search+u.hash);if(S.places>0){S.sheet='create';S.limited=false;S.draftName='';S.draftPerson=nick();}else S.msg='세 곳이 다 찼어요.';render();}
    render();
  }
  function open(id){
    if(!id)return;
    location.href='index.html'+(demo?'?demo&c=':'?c=')+encodeURIComponent(id);
  }
  async function loadInvite(){
    if(!S.invite)return loadList();
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
    }finally{S.busy=false;render();}
  }
  const $v=id=>$(id)?.value||'';
  async function init(){
    const mode=scene==='off'?'off':scene==='login'?'login':null;
    if(mode==='off'){S.page='off';return render();}
    if(!demo&&!(CFG.COMMUNITY==='on'&&window.KoideSb.ready())){S.page='off';return render();}
    if(demo){
      const d=await fake();
      if(scene==='invite'||scene==='expired')S.invite=d.initialInvite();
      if(mode==='login'){S.page='login';return render();}
      if(q.get('c'))return open(q.get('c'));
      return S.invite?loadInvite():loadList();
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
      return S.invite?loadInvite():loadList();
    }catch(e){S.page='login';S.error=err(e);S.loginProviders=await window.KoideSb.providers();render();}
  }
  document.addEventListener('input',ev=>{const id=ev.target.id;if(id==='create-name')S.draftName=ev.target.value;else if(id==='create-person')S.draftPerson=ev.target.value;else if(id==='join-person')S.draftJoin=ev.target.value;});
  document.addEventListener('click',async ev=>{
    const b=ev.target.closest('[data-a]');if(!b)return;
    if(ev.target.closest('[data-stop]')&&!b.closest('[data-stop]'))return;
    const a=b.dataset.a,v=b.dataset.v;
    if(a==='none')return;
    if(a==='close'){if(ev.target.closest('[data-stop]')&&!b.closest('[data-stop]'))return;S.sheet='';S.sheetError='';return render();}
    if(a==='back'){clearInvite();S.sheet='';return loadList();}
    if(a==='new'){S.sheet='create';S.sheetError='';S.limited=false;S.draftName='';S.draftPerson=nick();return render();}
    if(a==='limit'){S.limited=!S.limited;return render();}
    if(a==='months'){S.months=Number(v);return render();}
    if(a==='open')return open(v);
    if(a==='oauth')return busy(async()=>window.KoideSb.oauth(v));
    if(a==='reset'){(await fake()).reset();clearInvite();return loadList();}
    if(a==='create'){
      const name=$v('create-name'),person=$v('create-person');
      return busy(async()=>{
      const res=await kApi('community_create',{p_name:name,p_person:person,p_months:S.limited?S.months:null});
      remember(person.trim());S.draftName='';S.draftPerson='';S.sheet='';await open(res.id);
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
