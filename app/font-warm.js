// 글꼴이 도중에 바뀌지 않게 하기(2026-11-23). 구글 글꼴은 한글이 약 100개 조각으로 나뉘어 있어서, 화면에 처음 나오는 글자의 조각이
// 아직 없으면 임시 글꼴로 그렸다가 조각이 도착하는 순간 글씨체가 바뀐다. 그때마다 화면이 깜빡였다(탭을 처음 누를 때 심했다).
// 그래서 앱이 처음 그려지기 전에 '자주 쓰는 한글 조각'과 영문·숫자 조각을 먼저 받고(폰이 한 번 받아 두면 다음부터는 저장된 것을 읽는다),
// 다 받은 뒤에 화면을 보인다. 느린 인터넷에서도 2.5초가 지나면 기다리지 않고 그냥 보인다.
// 조각 하나는 13KB쯤이고 모두 1.3MB 남짓이다. 이 파일은 구글 글꼴 <link> 바로 뒤, 앞선 <head> 안에서 불러야 한다.
(function () {
  var fonts = document.fonts;
  if (!fonts || !fonts.forEach || !document.head) return;
  function parse(r) {
    var out = [];
    String(r || '').split(',').forEach(function (p) {
      var m = p.trim().match(/^U\+([0-9a-f?]+)(?:-([0-9a-f]+))?$/i);
      if (!m) return;
      if (m[1].indexOf('?') >= 0) { out.push([parseInt(m[1].replace(/\?/g, '0'), 16), parseInt(m[1].replace(/\?/g, 'f'), 16)]); return; }
      var a = parseInt(m[1], 16); out.push([a, m[2] ? parseInt(m[2], 16) : a]);
    });
    return out;
  }
  function covers(ranges, c) { for (var j = 0; j < ranges.length; j++) if (c >= ranges[j][0] && c <= ranges[j][1]) return true; return false; }
  // 구글이 글자 빈도순으로 묶은 '자주 쓰는 한글 조각'(조각마다 낱개 범위가 많고 한글 음절이 30자 넘게 든다)과 영문·숫자 조각만 고른다.
  // 한글을 순서대로 자른 나머지 조각(범위가 몇 개뿐)은 거의 안 쓰이니 건드리지 않는다
  function wanted(ranges) {
    var h = 0;
    for (var j = 0; j < ranges.length; j++) h += Math.max(0, Math.min(ranges[j][1], 0xD7A3) - Math.max(ranges[j][0], 0xAC00) + 1);
    return (ranges.length >= 60 && h >= 30) || covers(ranges, 0x41) || covers(ranges, 0x61) || covers(ranges, 0x30);
  }
  var list = [];
  fonts.forEach(function (f) { if (f.status === 'unloaded' && wanted(parse(f.unicodeRange))) list.push(f); });
  if (!list.length) return;
  var root = document.documentElement, done = false;
  var st = document.createElement('style'); st.textContent = 'html.fw body { visibility: hidden; }'; document.head.appendChild(st);
  root.classList.add('fw');
  function show() { if (done) return; done = true; root.classList.remove('fw'); }
  setTimeout(show, 2500);
  Promise.all(list.map(function (f) { return f.load().catch(function () {}); })).then(show, show);
})();
