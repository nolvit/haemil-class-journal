/** Curated random suggestions become editable, explicit order text before submission. */
export const imagination = {
  top: [
    "소매 속에서 작은 별자리가 반짝이는 자정빛 후드티",
    "구름을 실로 짠 듯 폭신하고 오로라빛 안감이 있는 재킷",
    "움직일 때마다 고래 그림이 헤엄치는 남색 맨투맨",
    "햇살을 모아 둔 주머니가 달린 레몬빛 바람막이",
  ],
  bottom: [
    "은하수 자수가 흐르는 검정 와이드 팬츠",
    "접힌 주름마다 노을빛이 번지는 반짝이는 스커트",
    "주머니에서 작은 종이별이 떠오르는 카고 바지",
    "바다 물결처럼 푸른 그라데이션의 데님 팬츠",
  ],
  shoes: [
    "발자국마다 작은 별빛이 잠깐 남는 운동화",
    "투명한 밑창 속에 작은 우주가 담긴 하이탑",
    "구름 모양 끈과 달빛 버클이 달린 부츠",
    "걸을 때 물방울 무늬가 반짝이는 민트색 스니커즈",
  ],
  hair: [
    "끝부분만 새벽 오로라처럼 빛나는 검정 쉼표머리",
    "작은 별핀 두 개를 꽂은 은하빛 보라색 단발",
    "햇빛을 받으면 청록빛이 도는 자연스러운 웨이브",
    "노을빛 한 가닥이 섞인 바람에 살짝 흩날리는 머리",
  ],
  background: [
    "고래 모양 구름이 떠다니는 하늘 위 기차역",
    "책장을 넘기면 별자리가 피어나는 공중 도서관",
    "유리 돔 너머로 해파리가 빛나는 해저 정원",
    "달빛 우편함이 늘어선 보랏빛 구름 산책길",
  ],
  accessory: [
    "오늘의 기분에 따라 색이 바뀌는 작은 행성 목걸이",
    "나비 홀로그램이 떠오르는 손목시계",
    "작은 구름이 들어 있는 투명 유리 귀걸이",
    "별가루를 담은 미니 가방",
  ],
  pet: [
    "어깨에 앉은 손바닥 크기의 별빛 아기 용",
    "꼬리에 작은 토성 고리가 떠 있는 우주 고양이",
    "발밑에서 구름처럼 둥둥 떠다니는 솜사탕 여우",
    "머리 위에서 천천히 헤엄치는 작은 하늘 고래",
  ],
  pose: [
    "한 손으로 작은 달을 가볍게 받치고 미소 짓기",
    "펫과 하이파이브하며 한쪽 발을 살짝 들기",
    "바람에 재킷이 날리며 손끝으로 별자리를 그리기",
    "종이비행기를 날리고 고개를 살짝 돌려 웃기",
  ],
  extra: [
    "그림자는 날개 달린 나비 모양으로, 얼굴은 또렷하게",
    "주변에 작은 종이별 세 개가 떠 있고 색감은 민트와 보라",
    "반짝임은 은은하게, 눈에 별 하나가 비친 듯 표현",
    "동화책 표지처럼 따뜻한 빛으로, 글자는 넣지 않기",
  ],
} as const;
export type ImaginationField = keyof typeof imagination;
export function randomSuggestion(
  field: ImaginationField,
  current = "",
  random = Math.random
) {
  const choices = imagination[field].filter(value => value !== current);
  return choices[
    Math.min(
      choices.length - 1,
      Math.max(0, Math.floor(random() * choices.length))
    )
  ];
}
export const imaginationFields = [
  ["top", "상의"],
  ["bottom", "하의"],
  ["shoes", "신발"],
  ["hair", "헤어"],
  ["background", "배경"],
  ["pet", "펫"],
  ["pose", "자세"],
  ["extra", "기타 요구사항"],
] as const;
