export type KkomiStage = "guarded" | "warming" | "trusting" | "close";
export type KkomiAction = "idle" | "greet" | "touch" | "hug" | "tickle" | "talk" | "snack" | "feed" | "sleep" | "praise" | "love";

export function kkomiStage(affinity = 0): KkomiStage {
  if (!Number.isFinite(affinity) || affinity < 3) return "guarded";
  if (affinity < 8) return "warming";
  if (affinity < 16) return "trusting";
  return "close";
}

const lines: Record<KkomiStage, Record<Exclude<KkomiAction, "feed">, readonly string[]>> = {
  guarded: {
    idle: ["여기가 햇볕이 제일 잘 들어.", "…뭐 봐? 내 꼬리 처음 봐?"],
    greet: ["꼬미야. 이름은 한 번만 말해 줄 거야.", "왔어? 신발 소리가 낯설어서 봤어."],
    touch: ["카앜! …깜짝이야. 손부터 보여 줘.", "카앜! 귀는 아직이야."],
    hug: ["카앜! 오늘은 이만큼 떨어져 앉자.", "안는 건 아직. 옆에 앉는 건 괜찮아."],
    tickle: ["카앜! 거긴 간지럽단 말이야!", "잠깐, 발바닥은 반칙이야!"],
    talk: ["…듣고 있어. 귀가 이쪽을 향했잖아.", "말해 봐. 여기까진 들리니까."],
    snack: ["킁… 거기 놓고 가. 한 입만 먹어 볼게.", "이거 내 거야? …그릇은 두고 가."],
    sleep: ["잘 거야. 불은 조금만 낮춰 줘.", "눈만 감는 거야. …잘 자."],
    praise: ["네가 한 거 봤어. …제법이더라.", "흥, 그건 잘했어. 두 번은 안 말해."],
    love: ["담요 끝 잡아. …혼자 덮기엔 길거든.", "여기 앉아도 돼. 딱 꼬리 한 뼘만큼."],
  },
  warming: {
    idle: ["네 발소리는 이제 구별해.", "그 자리 비워 뒀어. 앉든가."],
    greet: ["또 왔네. …이번엔 안 놀랐어.", "네 발소리 같더라. 맞혔지?"],
    touch: ["거기 말고… 턱 밑. 딱 한 번이야.", "손, 아까처럼 천천히 줘 봐."],
    hug: ["잠깐이면 돼. 후드 구겨지니까 살살.", "팔은 이만큼만. …응, 그 정도."],
    tickle: ["앗, 푸흣… 웃은 거 못 본 거야.", "간지럽잖아! …한 번만 더."],
    talk: ["아까 하던 얘기, 조금 더 들어도 돼.", "여기선 작게 말해도 다 들려."],
    snack: ["또 그거야? …사실 그게 제일 맛있어.", "그릇 여기 둬. 오늘은 옆에서 먹을래."],
    sleep: ["나 먼저 잘게. 네 자리도 남겨 뒀어.", "불 끄기 전에 꼬리만 좀 빼 줄래?"],
    praise: ["헤매다가도 다시 해 봤잖아. 그거, 꽤 멋졌어.", "오늘 네 편 들어 줄 만하네. 잘했어."],
    love: ["추우면 조금 더 붙어. 딱 내 어깨까지만.", "네 손 시리네. 내 소매 빌려줄까?"],
  },
  trusting: {
    idle: ["같이 앉아 있으니 방이 덜 썰렁해.", "네 옆에선 나도 귀를 좀 내려놔."],
    greet: ["왔네. 이쪽으로 와. 볕이 아직 남았어.", "오늘은 내가 먼저 마중 나왔어."],
    touch: ["응, 거기. 네 손인 줄 알았어.", "골골… 이번엔 들켜도 뭐, 괜찮아."],
    hug: ["오늘은 조금 더 이러고 있자.", "나도 팔 둘러도 돼? …따뜻하다."],
    tickle: ["푸흐, 이번엔 내 차례다. 손 내 봐!", "알았어, 항복! 이리 와서 같이 웃자."],
    talk: ["오늘 네 얘기 듣고 싶었어.", "말이 잘 안 나오면 여기서 같이 쉬자."],
    snack: ["같이 먹자. 이쪽이 더 바삭해.", "네가 좋아하는 건 어떤 맛이야? 내 것도 나눠 줄게."],
    sleep: ["눈 감아도 돼. 나도 옆에서 좀 쉴게.", "졸리면 내 어깨 빌려. …하암, 나도."],
    praise: ["네가 얼마나 망설이다 해냈는지 봤어. 잘했어.", "오늘 네 마음을 챙긴 거, 나는 그게 참 좋아."],
    love: ["꼭 말해야 알아? …응, 너 좋아해.", "내가 슬쩍 기댈게. 너도 기대고 싶으면 그래."],
  },
  close: {
    idle: ["등 좀 빌릴래. 너도 편한 쪽으로 기대.", "네 옆에서 조는 버릇이 생겼어."],
    greet: ["왔어? 오늘은 내가 네 얘기 들어 주는 날.", "이리 와. 너랑 나눠 쬐려고 볕 좋은 데 골랐어."],
    touch: ["골골… 네 손 닿으면 귀가 먼저 알아.", "좋아. 이번엔 내가 네 손에 먼저 기댈래."],
    hug: ["오늘은 내가 먼저 안아도 돼?", "폭. 오늘은 우리 둘 다 어깨 힘 좀 빼자."],
    tickle: ["아하하, 오늘은 네가 이겼어!", "간지럼은 무승부야. 자, 화해의 앞발."],
    talk: ["네 얘기 들려줘. 내 얘기도 조금 하고 싶어.", "말해도 좋고, 가만있어도 좋아. 옆에 있을게."],
    snack: ["반 나눠 먹자. 맛있는 건 너랑 같이 먹고 싶어.", "지난번엔 네가 줬잖아. 오늘 첫입은 네 거야."],
    sleep: ["잘 자. 나도 네 옆에서 편하게 잘 것 같아.", "이불 잡아. 나란히 한숨 자자."],
    praise: ["네가 네 속도로 걸어가는 게 좋아. 오늘도 잘했어.", "네가 내게 다정한 만큼 너한테도 다정했으면 해. 참 잘했어."],
    love: ["오늘은 내가 네 쪽으로 갈게. 많이 좋아해.", "네 옆이라 마음이 놓여. 너도 내 옆에서 푹 쉬어."],
  },
};

const talkReplies: Record<string, readonly [string, string, string, string]> = {
  tired: ["…피곤해 보여. 저 의자 써.", "네 자리 좀 데워 놨어. 잠깐 앉아.", "오늘은 말할 힘도 아껴. 내가 옆에 있을게.", "내 어깨 빌려. 둘이 같이 좀 쉬자."],
  happy: ["좋은 일 있어? …귀가 저절로 움직였어.", "그렇게 좋았어? 나도 살짝 궁금하네.", "네 목소리가 들떠서 나까지 웃겨.", "같이 웃자. 네가 신나면 내 꼬리도 먼저 알아."],
  sad: ["…휴지 여기 있어. 눈 마주치지 말까?", "울어도 돼. 나 창밖 보고 있을게.", "조금 가까이 앉아도 될까? 같이 있고 싶어.", "말로 다 못 해도 괜찮아. 손 내밀면 잡을게."],
  anxious: ["귀 쫑긋하고 있을게. 천천히 말해.", "말이 엉켜도 들을 수 있어. 천천히 해.", "네가 편한 만큼만 얘기해. 같이 앉아 있자.", "내 손 잡을래? 네가 숨 고르는 동안 같이 있을게."],
  bored: ["…내 꼬리 따라 눈 굴리는 건 허락할게.", "창가로 와. 뭔가 재밌는 게 지나갈지도.", "볕 드는 데까지 산책할까? 너랑 가고 싶어.", "재밌는 게 없으면 우리 둘이 하나 찾아보자."],
};

const stageIndex: Record<KkomiStage, number> = { guarded: 0, warming: 1, trusting: 2, close: 3 };

export function kkomiLine(action: KkomiAction, affinity = 0, seed = 0, talkMood?: string | null): string {
  const stage = kkomiStage(affinity);
  if (action === "talk" && talkMood && Object.prototype.hasOwnProperty.call(talkReplies, talkMood)) {
    return talkReplies[talkMood][stageIndex[stage]];
  }
  const choices = lines[stage][action === "feed" ? "snack" : action];
  const index = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) % choices.length : 0;
  return choices[index];
}
