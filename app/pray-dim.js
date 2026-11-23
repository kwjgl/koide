/* 기도하기 '저절로 어둡게': 가만히 30초면 화면이 어두워지고, 화면을 만지면 다시 밝아진다. 공동체(index.html)와 기도 노트(note.html)가 함께 쓴다. 모양은 pray-dim.css와 짝.
   앱이 init으로 ① 기도 화면 요소(el) ② 지금 어두워질 수 있는 때인지(enabled) ③ 만져서 깨어났을 때 할 일(onWake)을 알려 주고, 화면을 다시 그릴 때마다 sync를 부른다.
   어두운 동안 자동으로 다음 장으로 넘어가도 어두운 채로 있는다(눈부시지 않게). 이전·다음·기도했어요 같은 것은 먼저 깨어난 뒤에 누르게 한다(깨우려고 만진 것이 단추를 누르지 않게) */
window.KoidePrayDim = (() => {
  const SEC = 30;
  let cfg = null, dim = false, timer = 0, wakeAt = 0;
  const can = () => !!(cfg && cfg.enabled());
  const paint = () => { const e = cfg && cfg.el(); if (e) e.classList.toggle('dim', dim && can()); };
  // 가만히 있은 때부터 30초를 다시 센다
  function arm() {
    clearTimeout(timer); timer = 0;
    if (!can() || dim) return;
    timer = setTimeout(() => { timer = 0; if (can()) { dim = true; paint(); } }, SEC * 1000);
  }
  // 화면을 다시 그린 뒤: 어두워질 수 없는 때(첫 안내·마친 화면·닫음·꺼 둠)면 밝게 돌리고, 그 밖에는 어두운 상태를 그대로 입힌다
  function sync() {
    if (!can()) { clearTimeout(timer); timer = 0; dim = false; } else if (!dim && !timer) arm();
    paint();
  }
  function touch() {
    if (!can()) return;
    if (dim) { dim = false; wakeAt = Date.now(); paint(); if (cfg.onWake) cfg.onWake(); }
    arm();
  }
  ['pointerdown', 'touchstart', 'keydown', 'wheel'].forEach(t => document.addEventListener(t, touch, { capture: true, passive: true }));
  // 깨우려고 만진 손가락이 떼어질 때 생기는 '눌림'은 아래 단추에 닿지 않게 막는다
  document.addEventListener('click', e => { if (Date.now() - wakeAt < 500) { e.stopPropagation(); e.preventDefault(); } }, true);
  return { init(c) { cfg = c; }, sync, isDim: () => dim && can() };
})();
