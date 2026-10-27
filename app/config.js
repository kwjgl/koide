// 코이데 앱 설정. 계정을 만든 뒤 docs/setup.md 순서대로 채운다.
// API_URL이 비어 있으면 데모 모드: 서버 코드(apps-script/Code.js)를 이 브라우저 안에서 돌린다.
window.KOIDE_CONFIG = {
  // Apps Script 웹 앱 주소 (배포 > 웹 앱 URL). 예: https://script.google.com/macros/s/…/exec
  //  교회 코드를 쓰면(HUB_URL) 이 기기가 들어간 교회의 서버 주소로 바뀐다(아래). 여기 적힌 주소는 교회 코드 전부터 쓰던 교회 서버다
  API_URL: 'https://script.google.com/macros/s/AKfycbyHCoWVMdWtKzaoago9cDYEZBOApu23dM61j_QkhFLT0cpzCunEGT3Fda8rxxs0iwqn/exec',
  // 기본 서버(apps-script/hub) 웹 앱 주소. 비어 있으면 교회 코드 없이 예전처럼 위 서버 하나로 로그인한다
  HUB_URL: 'https://script.google.com/macros/s/AKfycbxzOsJrAvxkVn4iyfXhXwN-zodjeH8OJ3qeHYAE2MRdFJWiZCWdFHGEU1jYwODeaT0c/exec',
  // 카카오 개발자 앱의 REST API 키 (로그인 화면 주소에 들어가는 공개 값. Client Secret은 여기 넣지 않는다)
  KAKAO_REST_KEY: '797c76e7cc40eb0fb93ca86e6d1bb62e',
  // 카카오에 등록한 이 앱의 주소. 예: https://koide.koinobia.com/app/
  REDIRECT_URI: 'https://koide.koinobia.com/app/'
};
// 교회 코드로 들어간 기기: 그 교회 서버로 이야기한다(공동체·기도 노트 모두). ?demo로 연 데모는 그대로
(() => {
  const C = window.KOIDE_CONFIG;
  if (!C.HUB_URL || /[?&]demo(&|=|$)/.test(location.search)) return;
  try { const u = localStorage.getItem('koide-church-url'); if (u) C.API_URL = u; } catch (e) { /* 기기 저장소를 못 쓰면 기본 주소 */ }
})();
