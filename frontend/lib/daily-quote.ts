export interface PhilosophyQuote {
  id: string;
  text: string;
  /** translation: 실제 인용(번역). reflection: 사상을 풀어 쓴 문장 (인용으로 표기하지 않는다) */
  kind: "translation" | "reflection";
  /** 저자 (없으면 카뮈 『시지프 신화』 묶음) */
  author?: string;
  /** 출처 (책·시·편지). 없으면 저자만 표기 */
  source?: string;
  meaning?: string;
  question?: string;
}

/** 인용 한 줄. 출처가 불확실하게 전해지는 말은 저자 뒤에 "(전해지는 말)" 을 붙인다 */
function q(id: string, text: string, author: string, source?: string): PhilosophyQuote {
  return { id, text, kind: "translation", author, source };
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

  /* ---------- 위로와 귀감이 되는 문장 100 ---------- */
  // 스토아 · 카뮈 · 프랭클 · 니체
  q("marcus-already-happened", "이미 일어난 일은 바꿀 수 없다. 그러나 그 일이 남은 삶을 어떻게 지배할지는 아직 결정되지 않았다.", "마르쿠스 아우렐리우스"),
  q("camus-rock", "바위가 굴러떨어졌다고 해서, 그것을 밀어 올린 인간의 삶까지 사라지는 것은 아니다.", "알베르 카뮈"),
  q("seneca-lost", "이미 잃어버린 것을 슬퍼하느라 아직 내게 남아 있는 것까지 잃지 마라.", "세네카"),
  q("camus-summer", "한겨울에 나는 마침내 내 안에 꺼지지 않는 여름이 있음을 알았다.", "알베르 카뮈", "「티파사에 돌아오다」"),
  q("camus-despair-love", "삶에 대한 절망 없이는 삶에 대한 사랑도 없다.", "알베르 카뮈"),
  q("camus-happiness", "행복이 무엇으로 이루어졌는지 계속 묻기만 한다면 결코 행복해질 수 없다.", "알베르 카뮈"),
  q("frankl-attitude", "인간에게서 모든 것을 빼앗아 갈 수 있어도 마지막 하나는 남는다. 어떤 상황에서든 자신의 태도를 선택할 자유다.", "빅터 프랭클", "『죽음의 수용소에서』"),
  q("frankl-life-expects", "내가 삶에 무엇을 기대하느냐가 아니라, 삶이 나에게 무엇을 기대하느냐가 문제다.", "빅터 프랭클", "『죽음의 수용소에서』"),
  q("nietzsche-why", "살아야 할 이유를 아는 사람은 거의 어떤 상황도 견딜 수 있다.", "프리드리히 니체"),
  q("nietzsche-stronger", "나를 죽이지 못하는 것은 나를 더 강하게 만든다.", "프리드리히 니체", "『우상의 황혼』"),
  q("nietzsche-chaos", "춤추는 별을 낳으려면 자기 안에 혼돈을 품고 있어야 한다.", "프리드리히 니체", "『차라투스트라는 이렇게 말했다』"),
  q("epictetus-judgment", "사람을 괴롭히는 것은 일 자체가 아니라, 그 일에 대한 생각이다.", "에픽테토스", "『엥케이리디온』"),
  q("epictetus-control", "네 뜻대로 되지 않는 것에 매달리지 말고, 네 뜻대로 할 수 있는 것에 마음을 쏟아라.", "에픽테토스", "『엥케이리디온』"),
  q("epictetus-difficulty", "어려움이야말로 그 사람이 누구인지 보여 준다.", "에픽테토스", "『담화록』"),
  q("marcus-morning", "새벽에 일어나기 싫을 때 이렇게 말하라. 나는 사람의 일을 하러 일어난다.", "마르쿠스 아우렐리우스", "『명상록』"),
  q("marcus-thoughts", "영혼은 그 생각의 빛깔로 물든다.", "마르쿠스 아우렐리우스", "『명상록』"),
  q("marcus-obstacle", "길을 막는 것이 곧 길이 된다.", "마르쿠스 아우렐리우스", "『명상록』"),
  q("marcus-be-good", "좋은 사람이란 어떤 사람인지 따지느라 시간을 쓰지 말고, 그런 사람이 되라.", "마르쿠스 아우렐리우스", "『명상록』"),
  q("seneca-imagination", "우리는 현실보다 상상 속에서 더 자주 고통받는다.", "세네카", "『루킬리우스에게 보내는 편지』"),
  q("seneca-port", "어느 항구로 가는지 모르는 사람에게는 어떤 바람도 순풍이 아니다.", "세네카", "『루킬리우스에게 보내는 편지』"),
  q("seneca-dare", "어려워서 시도하지 못하는 것이 아니라, 시도하지 않기 때문에 어려운 것이다.", "세네카", "『루킬리우스에게 보내는 편지』"),
  q("ovid-endure", "견뎌라, 그리고 버텨라. 이 고통이 언젠가 너를 이롭게 하리라.", "오비디우스", "『사랑의 노래』"),
  q("virgil-remember", "언젠가 이 일들마저 기쁘게 떠올릴 날이 오리라.", "베르길리우스", "『아이네이스』"),
  q("horace-day", "오늘을 붙잡아라. 내일은 될 수 있는 한 조금만 믿어라.", "호라티우스", "『송가』"),

  // 동양의 고전과 스승
  q("confucius-pine", "날이 추워진 뒤에야 소나무와 잣나무가 늦게 시듦을 안다.", "공자", "『논어』"),
  q("laozi-step", "천 리 길도 발밑의 한 걸음에서 시작된다.", "노자", "『도덕경』"),
  q("laozi-soft", "부드럽고 약한 것이 굳세고 강한 것을 이긴다.", "노자", "『도덕경』"),
  q("dhammapada-hate", "미움은 미움으로 사라지지 않는다. 미움은 오직 사랑으로 사라진다.", "『법구경』"),
  q("dhammapada-self", "전장에서 천 명을 이기는 것보다 자기 자신을 이기는 사람이 참된 승리자다.", "『법구경』"),
  q("rumi-wound", "상처는 빛이 네 안으로 들어오는 자리다.", "루미"),
  q("dalai-help", "할 수 있다면 남을 도와라. 할 수 없다면 적어도 해치지는 말라.", "달라이 라마"),
  q("thich-slow", "미소 짓고, 숨 쉬고, 천천히 가라.", "틱낫한"),
  q("thich-lotus", "진흙 없이는 연꽃도 없다.", "틱낫한"),
  q("beopjeong-possession", "무소유란 아무것도 갖지 않는 것이 아니라 불필요한 것을 갖지 않는 것이다.", "법정", "『무소유』"),
  q("beopjeong-moment", "삶은 소유물이 아니라 순간순간의 있음이다.", "법정"),
  q("tagore-clouds", "구름이 내 삶에 떠다니는 것은 비나 폭풍을 몰고 오기 위해서가 아니라, 저녁 하늘에 빛깔을 더하기 위해서다.", "라빈드라나트 타고르", "『길 잃은 새들』"),
  q("gibran-sorrow", "슬픔이 당신을 깊이 파낼수록, 그만큼 더 많은 기쁨을 담을 수 있다.", "칼릴 지브란", "『예언자』"),
  q("gibran-pain", "고통은 당신의 이해를 감싸고 있던 껍질이 깨지는 것이다.", "칼릴 지브란", "『예언자』"),

  // 우리 시
  q("yun-path", "그리고 나한테 주어진 길을 걸어가야겠다.", "윤동주", "「서시」"),
  q("yun-stars", "별을 노래하는 마음으로 모든 죽어 가는 것을 사랑해야지.", "윤동주", "「서시」"),
  q("han-silence", "님은 갔지마는 나는 님을 보내지 아니하였습니다.", "한용운", "「님의 침묵」"),
  q("lee-wilderness", "내 여기 가난한 노래의 씨를 뿌려라.", "이육사", "「광야」"),

  // 문학
  q("rilke-questions", "마음속 풀리지 않는 모든 것에 인내를 가지고, 질문 그 자체를 사랑해 보라.", "라이너 마리아 릴케", "『젊은 시인에게 보내는 편지』"),
  q("rilke-fear", "우리를 두렵게 하는 모든 것은, 가장 깊은 곳에서는 우리의 사랑을 바라는 무력한 무엇인지도 모른다.", "라이너 마리아 릴케", "『젊은 시인에게 보내는 편지』"),
  q("hugo-night", "아무리 어두운 밤도 끝나고, 해는 다시 떠오른다.", "빅토르 위고", "『레 미제라블』"),
  q("dostoevsky-suffering", "내가 두려워하는 것은 단 하나, 내 고통에 걸맞은 사람이 되지 못하는 것이다.", "표도르 도스토옙스키"),
  q("tolstoy-change", "모두가 세상을 바꾸려 하지만, 자기 자신을 바꾸려는 사람은 없다.", "레프 톨스토이"),
  q("goethe-haste", "서두르지 말라, 그러나 쉬지도 말라.", "요한 볼프강 폰 괴테"),
  q("goethe-bread", "눈물 젖은 빵을 먹어 보지 않은 사람은 삶의 참맛을 모른다.", "요한 볼프강 폰 괴테", "『빌헬름 마이스터의 수업시대』"),
  q("hesse-egg", "새는 알에서 나오려고 투쟁한다. 알은 세계다.", "헤르만 헤세", "『데미안』"),
  q("hesse-path", "모든 사람의 삶은 자기 자신에게로 가는 길이다.", "헤르만 헤세", "『데미안』"),
  q("kafka-despair", "절망하지 말라. 절망하지 않는다는 사실에도 절망하지 말라.", "프란츠 카프카", "일기"),
  q("proust-eyes", "진정한 발견의 여정은 새로운 풍경을 찾는 것이 아니라 새로운 눈을 갖는 것이다.", "마르셀 프루스트", "『잃어버린 시간을 찾아서』"),
  q("exupery-invisible", "가장 중요한 것은 눈에 보이지 않아.", "앙투안 드 생텍쥐페리", "『어린 왕자』"),
  q("exupery-rose", "네 장미를 그토록 소중하게 만든 건, 네가 장미를 위해 쓴 시간이야.", "앙투안 드 생텍쥐페리", "『어린 왕자』"),
  q("murakami-storm", "폭풍이 지나가고 나면, 그 폭풍에서 빠져나온 당신은 들어갈 때의 당신이 아닐 것이다.", "무라카미 하루키", "『해변의 카프카』"),
  q("dickinson-hope", "희망은 깃털 달린 것, 영혼에 내려앉아 말 없는 노래를 부르며 결코 멈추지 않는다.", "에밀리 디킨슨"),
  q("whitman-multitudes", "나는 크다. 나는 무수한 것을 품고 있다.", "월트 휘트먼", "『풀잎』"),
  q("shakespeare-night", "날이 밝지 않는 밤은 없다.", "윌리엄 셰익스피어", "『맥베스』"),
  q("shakespeare-grief", "슬픔에 말을 주어라. 말하지 못한 슬픔은 꽉 찬 가슴에 속삭여 그것을 터뜨린다.", "윌리엄 셰익스피어", "『맥베스』"),
  q("dante-stars", "그리하여 우리는 밖으로 나와 다시 별들을 보았다.", "단테 알리기에리", "『신곡』"),
  q("milton-mind", "마음은 그 자체로 하나의 장소여서, 지옥을 천국으로도 천국을 지옥으로도 만들 수 있다.", "존 밀턴", "『실낙원』"),
  q("wilde-stars", "우리는 모두 시궁창에 있지만, 그중 몇몇은 별을 바라보고 있다.", "오스카 와일드", "『윈더미어 부인의 부채』"),
  q("montgomery-tomorrow", "내일은 아직 아무 실수도 하지 않은 새로운 날이에요.", "루시 모드 몽고메리", "『빨강 머리 앤』"),
  q("alcott-storm", "나는 폭풍이 두렵지 않다. 내 배를 다루는 법을 배우고 있으니까.", "루이자 메이 올컷", "『작은 아씨들』"),
  q("bronte-bird", "나는 새가 아니에요. 어떤 그물도 나를 가둘 수 없어요. 나는 자유 의지를 가진 사람이에요.", "샬럿 브론테", "『제인 에어』"),
  q("twain-courage", "용기란 두려움이 없는 것이 아니라, 두려움에 맞서고 그것을 다스리는 것이다.", "마크 트웨인"),
  q("beckett-fail", "다시 시도하라. 다시 실패하라. 더 낫게 실패하라.", "사뮈엘 베케트", "『최악을 향하여』"),
  q("carver-beloved", "그래도 이 삶에서 원하던 것을 얻었는가? 그렇다. 무엇을 원했는가? 나를 사랑받는 사람이라 부르는 것, 이 땅에서 사랑받는다고 느끼는 것.", "레이먼드 카버", "「만년의 단상」"),
  q("morrison-fly", "날고 싶다면, 너를 짓누르는 것을 내려놓아야 한다.", "토니 모리슨", "『솔로몬의 노래』"),
  q("baldwin-face", "마주한다고 모든 것을 바꿀 수는 없다. 하지만 마주하기 전에는 아무것도 바꿀 수 없다.", "제임스 볼드윈"),
  q("woolf-peace", "삶을 피해서는 평화를 찾을 수 없다.", "버지니아 울프", "『댈러웨이 부인』"),
  q("oliver-life", "말해 보라, 당신의 하나뿐인 거칠고 소중한 삶으로 무엇을 할 생각인가?", "메리 올리버", "「여름날」"),

  // 삶을 건너온 사람들
  q("keller-doors", "행복의 문 하나가 닫히면 다른 문이 열린다. 다만 우리는 닫힌 문만 오래 바라보느라 열린 문을 보지 못한다.", "헬렌 켈러"),
  q("keller-overcoming", "세상은 고통으로 가득하지만, 그것을 이겨 낸 이야기로도 가득하다.", "헬렌 켈러"),
  q("keller-together", "혼자서는 할 수 있는 일이 적지만, 함께라면 많은 일을 할 수 있다.", "헬렌 켈러"),
  q("keller-friend", "빛 속을 혼자 걷느니, 어둠 속을 친구와 함께 걷겠다.", "헬렌 켈러"),
  q("anne-good", "그 모든 일에도 불구하고, 나는 여전히 사람들의 마음이 본래 선하다고 믿는다.", "안네 프랑크", "『안네의 일기』"),
  q("angelou-defeated", "많은 패배를 겪겠지만, 패배한 사람이 되어서는 안 된다.", "마야 안젤루"),
  q("angelou-feel", "사람들은 당신이 한 말과 행동은 잊어도, 당신이 느끼게 해 준 감정은 잊지 않는다.", "마야 안젤루"),
  q("mlk-staircase", "계단 전체가 보이지 않아도 첫 계단을 내디뎌라.", "마틴 루터 킹"),
  q("mlk-light", "어둠은 어둠을 몰아낼 수 없다. 오직 빛만이 할 수 있다.", "마틴 루터 킹", "『사랑의 힘』"),
  q("roosevelt-consent", "누구도 당신의 동의 없이는 당신을 작게 만들 수 없다.", "엘리너 루스벨트"),
  q("roosevelt-fear", "매일 당신을 두렵게 하는 일을 하나씩 하라.", "엘리너 루스벨트"),
  q("mandela-rise", "삶의 가장 큰 영광은 결코 넘어지지 않는 데 있지 않고, 넘어질 때마다 다시 일어나는 데 있다.", "넬슨 만델라"),
  q("mandela-impossible", "모든 것은 이루어지기 전까지는 불가능해 보인다.", "넬슨 만델라"),
  q("douglass-struggle", "투쟁 없이는 진보도 없다.", "프레더릭 더글러스"),
  q("tutu-good", "네가 있는 곳에서 작은 선을 행하라. 그 작은 선들이 모여 세상을 뒤덮는다.", "데즈먼드 투투"),
  q("teresa-small", "우리는 위대한 일을 할 수는 없다. 다만 위대한 사랑으로 작은 일을 할 수 있을 뿐이다.", "마더 테레사"),
  q("wiesel-indifference", "사랑의 반대는 미움이 아니라 무관심이다.", "엘리 위젤"),
  q("weil-attention", "관심은 가장 드물고 순수한 형태의 너그러움이다.", "시몬 베유"),
  q("maclaren-kind", "친절하라. 네가 만나는 모든 사람은 저마다 힘든 싸움을 하고 있다.", "이안 매클라렌"),
  q("chaplin-tragedy", "인생은 가까이서 보면 비극이지만, 멀리서 보면 희극이다.", "찰리 채플린"),
  q("chaplin-laugh", "웃음 없는 하루는 낭비한 하루다.", "찰리 채플린"),
  q("einstein-bicycle", "인생은 자전거 타기와 같다. 균형을 잡으려면 계속 움직여야 한다.", "알베르트 아인슈타인", "아들에게 보낸 편지"),
  q("kierkegaard-backwards", "삶은 뒤돌아볼 때에만 이해되지만, 앞을 보며 살아가야 한다.", "쇠렌 키르케고르", "일기"),
  q("pascal-heart", "마음에는 이성이 알지 못하는 이유가 있다.", "블레즈 파스칼", "『팡세』"),
  q("emerson-day", "하루를 마쳤으면 거기서 놓아 주라. 할 수 있는 만큼 했다. 내일은 새로운 날이다.", "랠프 월도 에머슨"),
  q("thoreau-dream", "꿈을 향해 자신 있게 나아가라. 상상해 온 그 삶을 살아라.", "헨리 데이비드 소로", "『월든』"),
  q("tenboom-worry", "걱정은 내일의 슬픔을 비우지 못한다. 오늘의 힘을 비울 뿐이다.", "코리 텐 붐"),
  q("proverb-pass", "이 또한 지나가리라.", "옛 격언"),
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

/** 화면 아래 출처 한 줄 */
export function quoteSourceLabel(quote: PhilosophyQuote): string {
  if (quote.author) return quote.source ? `${quote.author} · ${quote.source}` : quote.author;
  return quote.kind === "translation" ? "알베르 카뮈 · 『시지프 신화』" : "『시지프 신화』의 사상을 풀어 쓴 문장";
}

export function millisecondsUntilNextQuote(now = new Date()): number {
  const shifted = now.getTime() + SEOUL_OFFSET_MS;
  return DAY_MS - ((shifted % DAY_MS + DAY_MS) % DAY_MS);
}
