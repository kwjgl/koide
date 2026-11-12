// 새 코이데 공동체에서 노트와 같은 Supabase 로그인 세션을 쓴다. 앱에는 비밀 키를 넣지 않는다.
window.KoideSb = (() => {
  const C = window.KOIDE_CONFIG || {};
  const base = () => String(C.SUPABASE_URL || '').replace(/\/+$/, '');
  const ready = () => !!(C.SUPABASE_URL && C.SUPABASE_KEY);
  let client = null, pending = null;
  const fail = (code, message) => ({ code, message });
  async function instance() {
    if (client) return client;
    if (!ready()) throw fail('net', '로그인 설정이 없어요.');
    if (!pending) pending = new Promise((resolve, reject) => {
      const boot = () => {
        try {
          client = window.supabase.createClient(base(), C.SUPABASE_KEY, {
            auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, storageKey: 'koide-note-sb' }
          });
          resolve(client);
        } catch (e) { pending = null; reject(fail('net', '로그인 도구를 불러오지 못했어요.')); }
      };
      if (window.supabase && window.supabase.createClient) return boot();
      const s = document.createElement('script'); s.src = 'vendor/supabase.js'; s.onload = boot;
      s.onerror = () => { pending = null; reject(fail('net', '로그인 도구를 불러오지 못했어요. 인터넷을 확인해 주세요.')); };
      document.head.appendChild(s);
    });
    return pending;
  }
  async function session() {
    let r;
    try { r = await (await instance()).auth.getSession(); }
    catch (e) { if (e && e.code) throw e; throw fail('net', '서버가 답하지 않아요. 잠시 뒤 다시 해 주세요.'); }
    if (r.error && /Retryable|fetch/i.test((r.error.name || '') + (r.error.message || '')))
      throw fail('net', '서버가 답하지 않아요. 잠시 뒤 다시 해 주세요.');
    return r.data && r.data.session || null;
  }
  async function rpc(name, args = {}) {
    const s = await session();
    if (!s) throw fail('login', '로그인이 필요해요.');
    const ctl = new AbortController(), stop = setTimeout(() => ctl.abort(), 60000);
    let res, body;
    try {
      res = await fetch(base() + '/rest/v1/rpc/' + encodeURIComponent(name), {
        method: 'POST', signal: ctl.signal,
        headers: { apikey: C.SUPABASE_KEY, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify(args || {})
      });
    } catch (e) { throw fail('net', '서버가 답하지 않아요. 잠시 뒤 다시 해 주세요.'); }
    finally { clearTimeout(stop); }
    try { const t = await res.text(); body = t ? JSON.parse(t) : null; } catch (e) { body = null; }
    if (res.status === 401 || res.status === 403 || (body && (String(body.code) === '28000' || body.message === 'login')))
      throw fail('login', '로그인이 필요해요.');
    const m = body && typeof body.message === 'string' && /^(bad|busy): ([\s\S]*)$/.exec(body.message);
    if (m) throw fail(m[1], m[2]);
    if (!res.ok) throw fail('bad', '서버가 받지 못했어요. 잠시 뒤 다시 해 주세요.');
    return body;
  }
  async function providers() {
    try {
      const ctl = new AbortController(), stop = setTimeout(() => ctl.abort(), 6000);
      let res;
      try { res = await fetch(base() + '/auth/v1/settings', { headers: { apikey: C.SUPABASE_KEY }, signal: ctl.signal }); }
      finally { clearTimeout(stop); }
      const r = await res.json(), e = r && r.external || {};
      const list = ['kakao', 'google', 'apple'].filter(k => e[k]);
      return list.length ? list : ['kakao'];
    } catch (e) { return ['kakao']; }
  }
  async function oauth(provider) {
    if (!['kakao', 'google', 'apple'].includes(provider)) throw fail('bad', '로그인 방법을 고를 수 없어요.');
    try { localStorage.setItem('koide-koinonia-resume', 'login'); localStorage.setItem('koide-note-last-provider', provider); }
    catch (e) { /* 저장이 안 되어도 현재 주소로 복귀한다 */ }
    const q = new URLSearchParams(location.search);
    ['code', 'error', 'error_code', 'error_description'].forEach(k => q.delete(k));
    const qs = q.toString();
    const dest = location.origin + location.pathname + (qs ? '?' + qs : '');
    const r = await (await instance()).auth.signInWithOAuth({ provider, options: { redirectTo: dest } });
    if (r.error) throw fail('bad', '로그인 화면을 열지 못했어요.');
  }
  const logos = {
    kakao: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 18.75c-.591 0-1.1697-.0413-1.7317-.1209-.5626.3965-3.813 2.6797-4.1198 2.7225 0 0-.1258.0489-.2328-.0141s-.0876-.2282-.0876-.2282c.0322-.2198.8426-3.0183.992-3.5333-2.7452-1.36-4.5701-3.7686-4.5701-6.5135C2.25 6.8168 6.6152 3.375 12 3.375s9.75 3.4418 9.75 7.6875c0 4.2457-4.3652 7.6875-9.75 7.6875z"/></svg>',
    google: '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>',
    apple: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>'
  };
  return { ready, session, rpc, providers, oauth, logos };
})();
