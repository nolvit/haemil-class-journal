// Source: haemil-mathbank dist/curriculum.js (962d6c8) and Linear HAE-8 textbook contents.
export type Curriculum = {
  term: string;
  units: { name: string; smalls: string[] }[];
};
export const mathCurriculum: Curriculum[] = [
  {
    term: "중1-2",
    units: [
      {
        name: "기본 도형",
        smalls: ["점, 선, 면", "각", "위치 관계", "평행선의 성질"],
      },
      {
        name: "작도와 합동",
        smalls: ["간단한 도형의 작도", "삼각형의 작도", "삼각형의 합동 조건"],
      },
      {
        name: "평면도형",
        smalls: [
          "다각형",
          "삼각형의 내각과 외각",
          "다각형의 내각과 외각",
          "원과 부채꼴",
          "부채꼴의 호의 길이와 넓이",
        ],
      },
      {
        name: "입체도형",
        smalls: [
          "다면체",
          "회전체",
          "기둥의 겉넓이와 부피",
          "뿔의 겉넓이와 부피",
          "구의 겉넓이와 부피",
        ],
      },
      {
        name: "자료의 정리와 해석",
        smalls: [
          "대푯값",
          "줄기와 잎 그림",
          "도수분포표",
          "히스토그램과 도수분포다각형",
          "상대도수와 그 그래프",
        ],
      },
    ],
  },
  {
    term: "중2-2",
    units: [
      {
        name: "삼각형의 성질",
        smalls: [
          "이등변삼각형의 성질",
          "직각삼각형의 합동 조건",
          "삼각형의 외심",
          "삼각형의 내심",
        ],
      },
      {
        name: "사각형의 성질",
        smalls: [
          "평행사변형",
          "평행사변형이 되기 위한 조건",
          "여러 가지 사각형",
          "여러 가지 사각형 사이의 관계",
          "평행선과 넓이",
        ],
      },
      {
        name: "도형의 닮음",
        smalls: [
          "닮음의 뜻과 성질",
          "닮은 도형의 넓이의 비와 부피의 비",
          "삼각형의 닮음 조건",
        ],
      },
      {
        name: "닮음의 응용",
        smalls: [
          "삼각형과 평행선",
          "삼각형의 두 변의 중점을 연결한 선분의 성질",
          "평행선 사이의 선분의 길이의 비",
          "삼각형의 무게중심",
        ],
      },
      {
        name: "피타고라스 정리",
        smalls: [
          "피타고라스 정리",
          "피타고라스 정리의 성질",
          "피타고라스 정리의 활용",
        ],
      },
      {
        name: "경우의 수",
        smalls: ["사건과 경우의 수", "여러 가지 경우의 수"],
      },
      { name: "확률", smalls: ["확률의 뜻과 성질", "확률의 계산"] },
    ],
  },
];
export const progressStates = ["waiting", "active", "complete"] as const;
export type ProgressState = (typeof progressStates)[number];
export const progressLabels: Record<ProgressState, string> = {
  waiting: "대기",
  active: "진행 중",
  complete: "완료",
};
export const assessmentKeys = ["preliminary", "final1", "final2"] as const;
export const assessmentLabels = {
  preliminary: "중단원 예비 평가",
  final1: "1차 최종 평가",
  final2: "2차 최종 평가",
};
