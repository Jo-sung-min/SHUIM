import type { SVGProps } from "react";
import {
  IconBook, IconBriefcase, IconBubble, IconBubbles, IconClover, IconCoffee, IconCoin, IconGamepad, IconLeaf, IconLotus,
  IconMoon, IconMusic, IconPalette, IconPaw, IconPlane, IconRain, IconRun, IconSmile, IconTag, IconTool, IconUsers,
} from "./Icons";

type Icon = (p: SVGProps<SVGSVGElement>) => React.JSX.Element;

/** 기본 카테고리 → 선형 아이콘 */
const BUILTIN: Record<string, Icon> = { mind: IconSmile, body: IconMoon, relation: IconUsers, money: IconCoin, work: IconBriefcase, etc: IconTag };
/**
 * 사용자 카테고리는 저장된 이모지 값을 그대로 두고(서버·AI 프롬프트가 쓴다) 화면에서만 같은 선 아이콘으로 바꿔 그린다.
 * 모르는 값은 태그 아이콘.
 */
const BY_EMOJI: Record<string, Icon> = {
  "🌱": IconLeaf, "📚": IconBook, "🎨": IconPalette, "🏃": IconRun, "🧘": IconLotus, "🎮": IconGamepad,
  "🍀": IconClover, "✈️": IconPlane, "🐾": IconPaw, "☕": IconCoffee, "🎵": IconMusic, "🛠️": IconTool,
  "📌": IconTag, "🫧": IconSmile, "🌙": IconMoon, "🤝": IconUsers, "💰": IconCoin, "💼": IconBriefcase,
};
/** 외침 카테고리 → 선형 아이콘 */
const SHOUT: Record<string, Icon> = {
  misfortune: IconRain, anxiety: IconBubbles, money: IconCoin, work: IconBriefcase, relation: IconUsers, body: IconMoon, "small-win": IconLeaf, free: IconBubble,
};

export function CategoryIcon({ id, emoji, size = 16, className = "" }: { id?: string; emoji?: string; size?: number; className?: string }) {
  const Icon = (id && BUILTIN[id]) || (emoji && BY_EMOJI[emoji]) || IconTag;
  return <Icon className={`cat-ico ${className}`.trim()} style={{ width: size, height: size }} />;
}

export function ShoutCatIcon({ id, size = 16, className = "" }: { id: string; size?: number; className?: string }) {
  const Icon = SHOUT[id] ?? IconBubble;
  return <Icon className={`cat-ico ${className}`.trim()} style={{ width: size, height: size }} />;
}
