// 이용 통계 보내기 공용 부품(코이데 교회·공동체·노트가 함께 쓴다). 서버 usage_track에 보낼 한 줄을 만든다.
//  보내는 칸은 app·ev·device·standalone, 그리고 client_at(일이 일어난 시각)·n(머문 초 하나)·ver(화면 판)뿐이다(서버 030이 허용한 칸).
//  글·이름·교회·가정을 받는 자리는 일부러 만들지 않는다. 켜고 끄는 게이트(USAGE 'on', koide-usage-off)는 부르는 쪽이 먼저 확인한다.
(function () {
  'use strict';
  // 서비스워커 사본 이름(koide-v208)에서 뽑은 판. 파일이 읽히자마자 한 번만 물어 변수에 둔다
  let VER = '';
  const READY = (async () => {
    try {
      const ks = (window.caches && await caches.keys()) || [];
      let max = 0;
      ks.forEach(k => { const m = /^koide-v(\d+)$/.exec(k); if (m && +m[1] > max) max = +m[1]; });
      if (max > 0) VER = ('v' + max).slice(0, 20);
    } catch (e) { VER = ''; }
  })();
  const ver = () => VER;
  // 판 읽기가 끝나면(최대 1초) 풀린다
  const ready = () => Promise.race([READY, new Promise(r => setTimeout(r, 1000))]);
  function build(ev, o) {
    o = o || {};
    const w = window.innerWidth || 0;
    const row = {
      app: 'koide', ev: String(ev),
      device: w < 640 ? 'phone' : w < 1024 ? 'tablet' : 'pc',
      standalone: !!((window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true),
    };
    if (typeof o.at === 'string' && o.at) row.client_at = o.at;
    const n = Math.round(Number(o.n));
    if (o.n != null && isFinite(n) && n >= 0 && n <= 86400) row.n = n;
    if (VER) row.ver = VER;
    return row;
  }
  window.KoideUsageFields = { build, ver, ready };
})();
