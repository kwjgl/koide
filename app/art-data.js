/* 이달의 그림(나만 보는 그림) 장면 목록: 달마다 제목, 주인공, 소품(이름·자리·너비).
 * 공동체 앱(index.html)의 이달의 그림과 기도 노트(note.html)의 이달의 정원이 함께 쓴다.
 * 그림 세트 이름은 년차-월(1-10: 1년차 10월). 1년차는 2026년 9월 ~ 2027년 8월. 그 해 그림이 아직 없으면 같은 달의 1년차 그림 */
window.KOIDE_ART = (() => {
  const sceneKey = mm => { const [y, mo] = mm.split('-').map(Number), key = (Math.floor(((y - 2026) * 12 + mo - 9) / 12) + 1) + '-' + mo; return SCENES[key] ? key : '1-' + mo; };
  const SCENES = {
    '1-9': { title: '9월 광야의 만나', hero: '만나', heroW: 20, heroMv: 'mv-breathe', heroFlip: false, heroHead: 0,
      props: [['quail', '메추라기', 170, 104, 22, 'mv-breathe'], ['tent', '장막', 222, 90, 60], ['basket', '바구니', 70, 142, 26], ['rock-spring', '반석의 샘물', 56, 98, 62],
        ['cloud-pillar', '구름기둥', 292, 86, 26, 'mv-float'], ['jar', '항아리', 116, 98, 22], ['staff', '지팡이', 140, 94, 12]] },
    '1-10': { title: '10월 선한 목자', hero: '양', heroW: 22, heroMv: 'mv-breathe', heroFlip: true, heroHead: .27, unit: '마리',
      props: [['tree', '나무', 38, 98, 72, 'mv-sway'], ['well', '샘물', 108, 96, 64], ['flowers', '꽃밭', 282, 106, 40], ['tent', '목자의 천막', 214, 88, 58],
        ['hay', '건초더미', 60, 142, 28], ['dog', '양치기 개', 188, 104, 22], ['rock', '쉼터 바위', 160, 88, 26]] },
    '1-11': { title: '11월 추수감사', hero: '곡식 단', heroW: 18, heroMv: 'mv-sway', heroFlip: false, heroHead: 0,
      props: [['basket', '이삭 바구니', 70, 142, 30], ['sickle', '낫', 226, 104, 20], ['threshing-floor', '타작마당', 176, 94, 64], ['jar', '항아리', 96, 100, 24],
        ['sparrow', '참새', 122, 102, 18, 'mv-breathe'], ['apple-tree', '사과나무', 38, 98, 70, 'mv-sway'], ['cart', '수레', 272, 100, 50]] },
    // 12월은 배경의 땅이 아래쪽 마을 앞에만 있어서, 주인공 별은 밤하늘에 흩뿌리고(sky) 소품은 마을 앞에 줄지어 둔다
    '1-12': { title: '12월 베들레헴의 별', hero: '별', heroW: 13, heroMv: 'mv-float', heroFlip: false, heroHead: 0, sky: true,
      props: [['stable', '마구간', 52, 140, 62], ['manger', '구유', 140, 147, 34], ['camel', '낙타', 258, 143, 52, 'mv-breathe'], ['lamp', '등불', 180, 147, 16],
        ['gift-box', '선물 상자', 212, 148, 26], ['shepherd-staff', '목자 지팡이', 298, 147, 12], ['lamb', '작은 양', 100, 148, 26, 'mv-breathe']] },
    // 1월은 새싹이 배경 밭고랑을 따라 난다(rows: 고랑 선. 오른쪽으로 갈수록 올라가고, 아래 고랑일수록 더 기운다)
    '1-1': { title: '1월 씨 뿌리는 사람', hero: '새싹', heroW: 17, heroMv: 'mv-sway', heroFlip: true, heroHead: 0,
      rows: { Y: [92, 100, 110, 122, 136], T: .36 }, plan: { rows: [92, 100, 110, 122, 136], gap: 1.25 },
      props: [['seed-bag', '씨앗 주머니', 70, 142, 26], ['watering-can', '물뿌리개', 252, 142, 28], ['scarecrow', '허수아비', 162, 94, 30, 'mv-sway'], ['sparrow', '참새', 196, 96, 16, 'mv-breathe'],
        ['fence', '나무 울타리', 270, 98, 62], ['sunflower', '해바라기', 36, 98, 28, 'mv-sway'], ['small-cart', '작은 수레', 106, 100, 44]] },
    '1-2': { title: '2월 노아의 방주', hero: '동물 한 쌍', heroW: 22, heroMv: 'mv-breathe', heroFlip: true, heroHead: 0, unit: '쌍',
      props: [['ark', '방주', 208, 94, 82], ['dove', '비둘기', 118, 42, 24, 'mv-float'], ['olive-branch', '올리브 가지', 138, 100, 20, 'mv-sway'], ['rainbow', '무지개', 66, 84, 72],
        ['ladder', '사다리', 256, 100, 16], ['puddle', '물웅덩이', 92, 142, 46], ['cloud', '구름', 282, 38, 46, 'mv-float']] },
    // 3월은 배경 왼쪽의 큰 나무에 둥지와 그네를 단다
    // 3월은 배경을 왼쪽 아래 기준으로 1.25배 키워서 큰 나무를 더 크게 보이게 한다(bgZoom). 둥지와 그네는 그 나무에 단다
    '1-3': { title: '3월 겨자씨', hero: '작은 새', heroW: 17, heroMv: 'mv-breathe', heroFlip: true, heroHead: .2, bgZoom: 1.25,
      props: [['nest', '둥지', 74, 34, 26], ['branch', '나뭇가지', 152, 102, 30], ['mustard-flower', '겨자꽃', 112, 98, 26, 'mv-sway'], ['birdhouse', '새집', 240, 96, 28],
        ['feather', '깃털', 196, 142, 16, 'mv-float'], ['butterfly', '나비', 214, 50, 16, 'mv-float'], ['swing', '그네', 122, 64, 26, 'mv-sway']] },
    '1-4': { title: '4월 부활의 아침', hero: '흰 백합', heroW: 15, heroMv: 'mv-sway', heroFlip: true, heroHead: 0,
      props: [['rolled-stone', '굴려진 돌', 60, 96, 46], ['butterfly', '나비', 130, 54, 18, 'mv-float'], ['dawn-sun', '새벽 해', 196, 50, 34], ['olive-tree', '올리브 나무', 276, 100, 66, 'mv-sway'],
        ['perfume-jar', '향유 병', 100, 100, 14], ['garden-path', '정원 길', 166, 110, 96], ['sparrow', '참새', 222, 102, 16, 'mv-breathe']] },
    // 5월은 큰 반석을 배경처럼 처음부터 깔고(base), 그 윗면에 집들을 구획대로 올린다. 그래서 모으는 소품은 반석을 뺀 6개
    //  plan.oval: 반석 윗면(가운데 x, 가운데 y, 가로 반지름, 세로 반지름). 집과 소품은 이 안에만 선다
    '1-5': { title: '5월 반석 위의 집', hero: '작은 집', heroW: 12, heroMv: '', heroFlip: true, heroHead: 0, unit: '채',
      base: ['rock', 160, 152, 330, 104],
      plan: { rows: [61, 68, 76, 85, 94], gap: 1.2, size: y => 10 + (y - 60) * .3, oval: [160, 75, 142, 22] },
      props: [['well', '우물', 48, 80, 13], ['garden', '텃밭', 272, 84, 22], ['clothesline', '빨랫줄', 100, 66, 20, 'mv-sway'],
        ['puppy', '강아지', 226, 92, 9, 'mv-breathe'], ['flowerpot', '화분', 130, 92, 7], ['lamp', '등불', 196, 64, 8]] },
    // 6월은 포도가 포도원 언덕 위쪽 줄까지 생긴다
    '1-6': { title: '6월 포도나무', hero: '포도송이', heroW: 15, heroMv: 'mv-sway', heroFlip: true, heroHead: 0, unit: '송이', plan: { rows: [80, 88, 97, 107, 118, 130, 144] },
      props: [['grape-leaf', '포도 잎', 62, 142, 22, 'mv-sway'], ['basket', '바구니', 110, 100, 34], ['trellis', '덩굴 시렁', 220, 96, 62], ['ladder', '사다리', 262, 98, 20],
        ['jar', '항아리', 40, 98, 24], ['bird', '새', 205, 41, 14, 'mv-breathe'], ['bucket', '물통', 290, 142, 20]] },
    // 7월은 작은 배를 호수 위에, 갈매기를 하늘에 띄운다
    '1-7': { title: '7월 오병이어', hero: '빵과 물고기', heroW: 22, heroMv: 'mv-breathe', heroFlip: true, heroHead: 0,
      props: [['twelve-baskets', '열두 바구니', 230, 100, 56], ['lunchbox', '아이의 도시락', 120, 100, 24], ['small-boat', '작은 배', 78, 69, 40, 'mv-float'], ['mat', '풀밭 돗자리', 164, 143, 52],
        ['water-bottle', '물병', 272, 143, 18], ['seagull', '갈매기', 198, 36, 22, 'mv-float'], ['hill-path', '언덕 길', 30, 112, 40]] },
    '1-8': { title: '8월 그물 가득', hero: '물고기', heroW: 20, heroMv: 'mv-breathe', heroFlip: true, heroHead: 0, unit: '마리',
      props: [['fishing-boat', '고깃배', 242, 88, 54, 'mv-float'], ['net', '그물', 130, 100, 46], ['oar', '노', 196, 104, 24], ['shell', '조개', 60, 143, 18],
        ['seagull', '갈매기', 100, 40, 22, 'mv-float'], ['campfire', '모닥불', 290, 141, 24], ['rock', '바위', 40, 98, 46]] },
    // 2년차 (2027년 9월 ~ 2028년 8월). heroes: 주인공이 여러 장이면 돌아가며(3월 들꽃 네 가지 색)
    '2-1': { title: '1월 예수님의 세례', hero: '물방울', heroW: 9, heroMv: 'mv-float', heroFlip: false, heroHead: 0,
      props: [['light-beam', '열린 하늘의 빛줄기', 160, 60, 62], ['reeds', '요단강 갈대', 28, 110, 26, 'mv-sway'], ['stepping-stones', '징검다리', 100, 94, 46], ['riverside-tree', '강가 나무', 286, 102, 62, 'mv-sway'],
        ['dove', '비둘기', 206, 38, 20, 'mv-float'], ['water-jar', '물항아리', 232, 140, 22], ['pebbles', '조약돌', 70, 142, 34]] },
    '2-2': { title: '2월 바람은 임의로 불매', hero: '바람개비', heroW: 15, heroMv: 'mv-sway', heroFlip: true, heroHead: 0,
      props: [['kite', '연', 232, 42, 32, 'mv-float'], ['swaying-reeds', '흔들리는 갈대', 26, 106, 34, 'mv-sway'], ['weathervane', '풍향계', 272, 100, 34], ['oil-lamp', '밤의 등잔', 62, 140, 26],
        ['flying-leaves', '날리는 나뭇잎', 168, 66, 30, 'mv-float'], ['wind-bell', '풍경', 284, 138, 14, 'mv-sway'], ['cloud', '구름', 118, 30, 50, 'mv-float']] },
    '2-3': { title: '3월 창조의 첫 아침', hero: '들꽃', heroW: 12, heroMv: 'mv-sway', heroFlip: true, heroHead: 0, unit: '송이', heroes: ['hero', 'hero-2', 'hero-3', 'hero-4'],
      props: [['sun', '해', 112, 46, 26], ['fruit-tree', '열매 나무', 290, 104, 58, 'mv-sway'], ['leaping-fish', '뛰는 물고기', 70, 88, 24, 'mv-float'], ['fawn', '아기 사슴', 202, 106, 24, 'mv-breathe'],
        ['bird-pair', '새 한 쌍', 252, 108, 26, 'mv-breathe'], ['crescent-moon', '초승달', 272, 32, 18], ['cloud', '구름', 196, 28, 46, 'mv-float']] },
    '2-4': { title: '4월 호산나, 종려 가지', hero: '종려 가지', heroW: 15, heroMv: 'mv-sway', heroFlip: true, heroHead: 0,
      props: [['donkey-colt', '어린 나귀', 172, 104, 26, 'mv-breathe'], ['spread-cloak', '펼친 겉옷', 140, 132, 40], ['city-gate', '성문', 250, 94, 52], ['olive-tree', '올리브 나무', 36, 102, 56, 'mv-sway'],
        ['stone-path', '돌길', 204, 147, 70], ['water-pot', '물동이', 92, 104, 16], ['fig-tree', '무화과나무', 296, 110, 50, 'mv-sway']] },
    '2-5': { title: '5월 참새 한 마리도', hero: '참새', heroW: 15, heroMv: 'mv-breathe', heroFlip: true, heroHead: .2, unit: '마리',
      props: [['lily', '백합', 18, 140, 18, 'mv-sway'], ['nest', '둥지', 236, 63, 18], ['feed-bowl', '모이 그릇', 200, 122, 26], ['birdhouse', '새집', 40, 100, 24],
        ['clothesline', '빨랫줄', 150, 84, 54, 'mv-sway'], ['wildflower-pot', '들꽃 화분', 300, 106, 20], ['two-coins', '동전 두 닢', 120, 143, 14]] },
    '2-6': { title: '6월 오순절', hero: '작은 등불', heroW: 10, heroMv: '', heroFlip: false, heroHead: 0,
      props: [['upper-window', '열린 다락방 창', 110, 80, 30], ['curtain', '바람에 날리는 휘장', 200, 82, 30, 'mv-sway'], ['wheat-sheaf', '밀 단', 152, 102, 20, 'mv-sway'], ['bread-basket', '빵 바구니', 110, 143, 30],
        ['flags', '여러 나라 깃발', 262, 98, 30, 'mv-sway'], ['tent', '천막', 268, 130, 56], ['well', '우물', 50, 141, 34]] },
    '2-7': { title: '7월 생명수의 강', hero: '강가 나무', heroW: 20, heroMv: 'mv-sway', heroFlip: true, heroHead: 0, unit: '그루',
      props: [['spring', '샘', 280, 100, 40], ['fish-school', '물고기 떼', 92, 86, 40, 'mv-float'], ['waterwheel', '물레방아', 150, 100, 40], ['duck', '오리', 204, 76, 20, 'mv-float'],
        ['egret', '백로', 30, 104, 18, 'mv-breathe'], ['healing-leaf', '약이 되는 잎', 250, 141, 20, 'mv-sway'], ['water-bottle', '물병', 110, 142, 14]] },
    // 8월은 바다가 땅이다(구획 예외): 작은 배를 물결 위 줄마다 띄운다
    '2-8': { title: '8월 바다를 잔잔케 하심', hero: '작은 배', heroW: 22, heroMv: 'mv-float', heroFlip: true, heroHead: .1, unit: '척', plan: { rows: [78, 86, 95, 105, 116, 128, 142] },
      props: [['calm-waves', '잔잔한 물결', 150, 94, 60, 'mv-float'], ['clearing-cloud', '걷히는 구름', 90, 34, 56, 'mv-float'], ['seagull', '갈매기', 190, 44, 22, 'mv-float'], ['evening-star', '저녁 별', 252, 26, 12],
        ['net', '그물', 262, 148, 30], ['pillow', '고물의 베개', 296, 146, 22], ['oar', '노', 300, 134, 18]] },
    '2-9': { title: '9월 성령의 열매', hero: '열매', heroW: 11, heroMv: '', heroFlip: false, heroHead: 0, unit: '개', heroes: ['hero', 'hero-2', 'hero-3', 'hero-4', 'hero-5', 'hero-6', 'hero-7', 'hero-8', 'hero-9'],
      props: [['orchard-tree', '과일나무', 40, 100, 56, 'mv-sway'], ['basket', '바구니', 130, 142, 24], ['ladder', '사다리', 72, 102, 14], ['beehive', '벌집', 280, 104, 24],
        ['watering-can', '물뿌리개', 240, 142, 24], ['garden-gate', '정원 문', 200, 86, 40], ['butterfly', '나비', 170, 50, 16, 'mv-float']] },
    '2-10': { title: '10월 다니엘과 사자', hero: '아기 사자', heroW: 18, heroMv: 'mv-breathe', heroFlip: true, heroHead: .2, unit: '마리',
      props: [['sealed-stone', '봉인된 돌문', 40, 62, 26], ['moon', '달', 250, 30, 22], ['open-window', '예루살렘 쪽으로 열린 창', 150, 82, 30], ['palm-tree', '종려나무', 290, 102, 34, 'mv-sway'],
        ['oil-lamp', '등잔', 90, 142, 22], ['scroll', '두루마리', 210, 142, 26], ['royal-seal', '왕의 인장', 150, 144, 16]] },
    '2-11': { title: '11월 한 해를 관 씌우시니', hero: '감', heroW: 11, heroMv: '', heroFlip: false, heroHead: 0,
      props: [['persimmon-tree', '감나무', 36, 102, 58, 'mv-sway'], ['magpie', '까치', 56, 58, 16, 'mv-breathe'], ['rice-sheaf', '볏단', 280, 100, 22, 'mv-sway'], ['grain-cart', '곡식 수레', 230, 96, 44],
        ['ditch', '물 대는 도랑', 150, 92, 60], ['basket', '바구니', 110, 142, 26], ['jar-terrace', '장독대', 290, 142, 40]] },
    '2-12': { title: '12월 말씀이 육신이 되어', hero: '촛불', heroW: 9, heroMv: '', heroFlip: false, heroHead: 0,
      props: [['stable', '마구간', 50, 102, 52], ['empty-manger', '짚 깔린 빈 구유', 100, 120, 30], ['star', '별 하나', 170, 24, 14, 'mv-float'], ['donkey', '나귀', 240, 104, 26, 'mv-breathe'],
        ['lit-window', '불 켜진 창', 290, 104, 22], ['shepherd-staff', '목자 지팡이', 200, 108, 10], ['scroll', '두루마리', 150, 144, 24]] }
  };
  return { SCENES, sceneKey };
})();
