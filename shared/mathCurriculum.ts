// Source: haemil-mathbank dist/curriculum.js (962d6c8), Linear HAE-8, and CheckCheck teacher textbook contents.
export type Curriculum = {
  term: string;
  units: { name: string; smalls: string[] }[];
};
export const MIDDLE3_SECOND_TERM_SWITCH_DATE = "2027-01-01";
const middle3SecondTerm2026: Curriculum = {
  term: "중3-2",
  units: [
    {
      name: "삼각비",
      smalls: ["삼각비의 뜻", "30°, 45°, 60°의 삼각비의 값", "예각의 삼각비의 값"],
    },
    {
      name: "삼각비의 활용",
      smalls: ["삼각비의 활용 - 길이 구하기", "삼각비의 활용 - 넓이 구하기"],
    },
    {
      name: "원과 직선",
      smalls: ["원의 현에 관한 성질", "원의 접선에 관한 성질"],
    },
    {
      name: "원주각",
      smalls: ["원주각의 성질", "원주각의 활용"],
    },
    {
      name: "통계",
      smalls: ["산포도", "상자그림", "산점도와 상관관계"],
    },
  ],
};
const middle3SecondTerm2027: Curriculum = {
  term: "중3-2",
  units: [
    {
      name: "삼각비",
      smalls: ["삼각비의 뜻", "30°, 45°, 60°의 삼각비의 값", "예각의 삼각비의 값"],
    },
    {
      name: "삼각비의 활용",
      smalls: ["삼각비의 활용 - 길이 구하기", "삼각비의 활용 - 넓이 구하기"],
    },
    {
      name: "원과 직선",
      smalls: ["원의 현에 관한 성질", "원의 접선에 관한 성질"],
    },
    {
      name: "원주각",
      smalls: ["원주각과 그 성질", "원에 내접하는 사각형의 성질", "원의 접선과 현이 이루는 각"],
    },
    {
      name: "통계",
      smalls: ["대푯값", "산포도", "산점도와 상관관계"],
    },
  ],
};
export const mathCurriculum: Curriculum[] = [
  {
    term: "중1-1",
    units: [
      {
        name: "소인수분해",
        smalls: ["소수와 합성수", "소인수분해", "최대공약수", "최소공배수"],
      },
      {
        name: "정수와 유리수",
        smalls: [
          "정수와 유리수의 뜻",
          "절댓값과 수의 대소 관계",
          "정수와 유리수의 덧셈",
          "정수와 유리수의 뺄셈",
          "정수와 유리수의 곱셈",
          "정수와 유리수의 나눗셈",
        ],
      },
      {
        name: "문자의 사용과 식",
        smalls: [
          "문자의 사용",
          "식의 값",
          "일차식의 계산 (1)",
          "일차식의 계산 (2)",
        ],
      },
      {
        name: "일차방정식",
        smalls: [
          "방정식과 항등식",
          "일차방정식",
          "일차방정식의 활용 (1)",
          "일차방정식의 활용 (2)",
        ],
      },
      {
        name: "좌표평면과 그래프",
        smalls: [
          "순서쌍과 좌표",
          "그래프와 그 해석",
          "정비례의 뜻과 그래프",
          "정비례 관계의 그래프의 성질",
          "반비례의 뜻과 그래프",
          "반비례 관계의 그래프의 성질",
        ],
      },
    ],
  },
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
    term: "중2-1",
    units: [
      {
        name: "유리수와 순환소수",
        smalls: ["순환소수", "유리수의 소수 표현", "순환소수의 분수 표현"],
      },
      {
        name: "식의 계산",
        smalls: [
          "지수법칙",
          "단항식의 곱셈과 나눗셈",
          "다항식의 덧셈과 뺄셈",
          "단항식과 다항식의 계산",
        ],
      },
      {
        name: "일차부등식",
        smalls: ["부등식의 뜻과 성질", "일차부등식의 풀이", "일차부등식의 활용"],
      },
      {
        name: "연립일차방정식",
        smalls: [
          "연립일차방정식과 그 해",
          "연립일차방정식의 풀이",
          "여러 가지 연립일차방정식",
          "연립일차방정식의 활용",
        ],
      },
      {
        name: "일차함수와 그래프 (1)",
        smalls: ["함수의 뜻", "일차함수의 뜻과 그래프", "x절편, y절편", "기울기"],
      },
      {
        name: "일차함수와 그래프 (2)",
        smalls: [
          "일차함수의 그래프의 성질",
          "일차함수의 식 구하기",
          "일차함수의 활용",
        ],
      },
      {
        name: "일차함수와 일차방정식의 관계",
        smalls: [
          "일차함수와 일차방정식",
          "일차함수의 그래프와 연립일차방정식의 해",
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
  {
    term: "중3-1",
    units: [
      {
        name: "제곱근과 실수",
        smalls: [
          "제곱근의 뜻과 표현",
          "제곱근의 성질",
          "제곱근의 성질의 활용",
          "무리수와 실수",
          "실수의 대소 관계",
        ],
      },
      {
        name: "근호를 포함한 식의 계산",
        smalls: [
          "근호를 포함한 식의 곱셈과 나눗셈 (1)",
          "근호를 포함한 식의 곱셈과 나눗셈 (2)",
          "근호를 포함한 식의 덧셈과 뺄셈",
        ],
      },
      {
        name: "다항식의 곱셈",
        smalls: ["다항식의 곱셈", "곱셈 공식의 활용"],
      },
      {
        name: "인수분해",
        smalls: ["인수분해의 뜻", "인수분해 공식", "인수분해 공식의 활용"],
      },
      {
        name: "이차방정식",
        smalls: [
          "이차방정식의 뜻",
          "인수분해를 이용한 이차방정식의 풀이",
          "제곱근을 이용한 이차방정식의 풀이",
          "근의 공식을 이용한 이차방정식의 풀이",
          "이차방정식의 활용 (1)",
          "이차방정식의 활용 (2)",
        ],
      },
      {
        name: "이차함수와 그 그래프 (1)",
        smalls: [
          "이차함수의 뜻",
          "이차함수 y=ax²의 그래프",
          "이차함수 y=ax²+q, y=a(x-p)²의 그래프",
          "이차함수 y=a(x-p)²+q의 그래프",
        ],
      },
      {
        name: "이차함수와 그 그래프 (2)",
        smalls: [
          "이차함수 y=ax²+bx+c의 그래프",
          "이차함수의 식 구하기",
          "이차함수의 최댓값과 최솟값",
        ],
      },
    ],
  },
  middle3SecondTerm2027,
];
/** 2026년까지는 기존 목차를 쓰고 2027년부터 개정 목차를 쓴다. */
export function mathCurriculumForDate(date: string): Curriculum[] {
  if (date >= MIDDLE3_SECOND_TERM_SWITCH_DATE) return mathCurriculum;
  return mathCurriculum.map(course =>
    course.term === "중3-2" ? middle3SecondTerm2026 : course
  );
}
export const progressStates = ["waiting", "active", "complete", "skipped"] as const;
export type ProgressState = (typeof progressStates)[number];
export const progressLabels: Record<ProgressState, string> = {
  waiting: "대기",
  active: "진행 중",
  complete: "완료",
  skipped: "건너뜀",
};
export const assessmentKeys = ["preliminary", "practicePreliminary", "final1", "final2"] as const;
export const assessmentLabels = {
  preliminary: "중단원 예비 평가",
  practicePreliminary: "실력문제 예비 평가",
  final1: "1차 최종 평가",
  final2: "2차 최종 평가",
};
