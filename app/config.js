// 코이데 앱 설정. 계정을 만든 뒤 docs/setup.md 순서대로 채운다.
// API_URL이 비어 있으면 데모 모드: 서버 코드(apps-script/Code.js)를 이 브라우저 안에서 돌린다.
window.KOIDE_CONFIG = {
  // Apps Script 웹 앱 주소 (배포 > 웹 앱 URL). 예: https://script.google.com/macros/s/…/exec
  API_URL: 'https://script.google.com/macros/s/AKfycbyHCoWVMdWtKzaoago9cDYEZBOApu23dM61j_QkhFLT0cpzCunEGT3Fda8rxxs0iwqn/exec',
  // 카카오 개발자 앱의 REST API 키 (로그인 화면 주소에 들어가는 공개 값. Client Secret은 여기 넣지 않는다)
  KAKAO_REST_KEY: '797c76e7cc40eb0fb93ca86e6d1bb62e',
  // 카카오에 등록한 이 앱의 주소. 예: https://아이디.github.io/pray-for/app/
  REDIRECT_URI: 'https://kwjgl.github.io/koide/app/'
};
