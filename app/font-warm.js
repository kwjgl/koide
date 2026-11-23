// 글꼴 미리 받아 두기(2026-11-23). 구글 글꼴은 한글이 약 100개 조각으로 나뉘어 있어서, 탭을 처음 눌러 처음 보는 글자가 나올 때마다
// 조각을 받고 글씨체가 바뀌느라 화면이 깜빡였다(특히 처음 접속해 처음 누를 때). 그래서 앱이 다 열린 뒤 놀고 있을 때,
// 자주 쓰는 한글 조각만 천천히 미리 받아 둔다(조각 하나 13KB쯤, 모두 1MB 남짓이고 브라우저가 한 번 받으면 남겨 둔다). 나머지 조각은 예전처럼 필요할 때 받는다.
(function () {
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
  // 구글이 글자 빈도순으로 묶은 '자주 쓰는 한글 조각'(조각마다 낱개 범위가 많고 한글 음절이 30자 넘게 든다)만 고른다.
  // 한글을 순서대로 자른 나머지 조각(범위가 몇 개뿐)은 거의 안 쓰이니 건드리지 않는다
  function common(ranges) {
    var h = 0;
    for (var j = 0; j < ranges.length; j++) h += Math.max(0, Math.min(ranges[j][1], 0xD7A3) - Math.max(ranges[j][0], 0xAC00) + 1);
    return ranges.length >= 60 && h >= 30;
  }
  function warm() {
    if (!document.fonts || !document.fonts.forEach || (navigator.connection && navigator.connection.saveData)) return;
    var todo = [];
    document.fonts.forEach(function (f) { if (f.status === 'unloaded' && common(parse(f.unicodeRange))) todo.push(f); });
    var i = 0;
    (function next() {
      if (i >= todo.length) return;
      var f = todo[i++];
      f.load().catch(function () {}).then(function () { setTimeout(next, 150); });
    })();
  }
  function start() { (window.requestIdleCallback || function (fn) { setTimeout(fn, 1500); })(function () { setTimeout(warm, 800); }); }
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();
