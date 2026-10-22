export interface PhilosophyQuote {
  id: string;
  text: string;
  kind: "translation" | "reflection";
  meaning: string;
  question: string;
}

/** User-selected wording. Reflections must not be attributed as verbatim quotations. */
export const PHILOSOPHY_QUOTES: readonly PhilosophyQuote[] = [
  {
    id: "happy-sisyphus",
    text: "우리는 시지프가 행복하다고 상상해야 한다.",
    kind: "translation",
    meaning: "끝없이 바위를 밀어 올리는 순간에도, 자신의 삶을 바라보는 태도는 스스로 선택할 수 있어요.",
    question: "오늘 내가 선택할 수 있는 태도는 무엇일까요?",
  },
  {
    id: "the-ascent",
    text: "정상에 이르기 위한 투쟁 그 자체만으로도 인간의 마음을 가득 채우기에 충분하다.",
    kind: "translation",
    meaning: "도착하기 전의 시간에도 삶은 있어요. 걸어가는 과정에서 마음을 채우는 것을 발견할 수 있죠.",
    question: "결과를 기다리는 동안, 내 마음을 채워 준 것은 무엇인가요?",
  },
  {
    id: "the-question-of-life",
    text: "참으로 진지한 철학적 문제는 오직 하나, 자살이다.",
    kind: "translation",
    meaning: "카뮈는 이 물음에서 출발해, 부조리 속에서도 삶을 이어가는 태도를 찾았어요.",
    question: "삶이 선명하지 않은 날에도 나를 붙잡아 주는 것은 무엇인가요?",
  },
  {
    id: "the-silent-world",
    text: "부조리는 인간의 갈망과 세계의 불합리한 침묵 사이에서 태어난다.",
    kind: "reflection",
    meaning: "우리는 의미와 답을 바라지만, 세계는 침묵하기도 해요. 그 간격을 마주하는 데서 사유가 시작돼요.",
    question: "답이 없는 채로도 품고 갈 수 있는 질문이 있나요?",
  },
  {
    id: "without-certainty",
    text: "희망이 없는 곳에서도 절망할 필요는 없다.",
    kind: "reflection",
    meaning: "미래의 보상이 확실하지 않아도, 지금 이 순간의 삶을 살아갈 수 있다는 생각이에요.",
    question: "확실한 약속이 없어도 오늘 해 보고 싶은 일은 무엇인가요?",
  },
  {
    id: "my-own-fate",
    text: "나의 운명은 나의 것이다.",
    kind: "reflection",
    meaning: "상황을 모두 바꿀 수 없어도, 그것을 대하는 나의 태도와 선택을 돌아볼 수 있어요.",
    question: "바꿀 수 없는 것들 사이에서, 내가 정할 수 있는 것은 무엇인가요?",
  },
  {
    id: "return-to-the-mountain",
    text: "바위는 여전히 굴러떨어지지만, 시지프는 다시 산을 오른다.",
    kind: "reflection",
    meaning: "실패가 반복되는 삶 속에서도 다시 행동하는 인간의 모습을 담은 문장이에요.",
    question: "다시 시작한다면, 나에게 어떤 말을 건네고 싶나요?",
  },
];

const DAY_MS = 86_400_000;
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;
const FIRST_DAY = Date.UTC(2026, 9, 23) / DAY_MS;

/** All readers get the same sentence for a Korean calendar day, including after reload. */
export function dailyQuoteIndex(now = new Date()): number {
  const day = Math.floor((now.getTime() + SEOUL_OFFSET_MS) / DAY_MS);
  return ((day - FIRST_DAY) % PHILOSOPHY_QUOTES.length + PHILOSOPHY_QUOTES.length) % PHILOSOPHY_QUOTES.length;
}

export function dailyQuote(now = new Date()): PhilosophyQuote {
  return PHILOSOPHY_QUOTES[dailyQuoteIndex(now)];
}

export function millisecondsUntilNextQuote(now = new Date()): number {
  const shifted = now.getTime() + SEOUL_OFFSET_MS;
  return DAY_MS - ((shifted % DAY_MS + DAY_MS) % DAY_MS);
}
