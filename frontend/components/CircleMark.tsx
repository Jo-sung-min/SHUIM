"use client";

import type { ComponentType, SVGProps } from "react";
import {
  IconBook, IconBriefcase, IconClover, IconCoffee, IconFilm, IconFlame, IconGamepad, IconHeart, IconLeaf, IconLotus,
  IconMoon, IconMusic, IconPalette, IconPaw, IconPlane, IconRun, IconStar, IconSun,
} from "@/components/Icons";
import type { Circle } from "@/lib/circles";
import { fluentName } from "@/lib/fluent-icons";
import { FluentSvg, useFluentIcon } from "./FluentIcon";
import styles from "@/app/c/circle.module.css";

/** 예전 기본 아이콘 18개. 이미 고른 소로우가 있어 계속 그린다 (새로 고르는 건 Fluent 아이콘 찾기: "fl:<이름>") */
export const CIRCLE_ICONS: { id: string; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { id: "coffee", label: "미식", Icon: IconCoffee },
  { id: "leaf", label: "쉼", Icon: IconLeaf },
  { id: "heart", label: "마음", Icon: IconHeart },
  { id: "star", label: "별", Icon: IconStar },
  { id: "moon", label: "밤", Icon: IconMoon },
  { id: "sun", label: "아침", Icon: IconSun },
  { id: "book", label: "공부", Icon: IconBook },
  { id: "briefcase", label: "일", Icon: IconBriefcase },
  { id: "run", label: "운동", Icon: IconRun },
  { id: "gamepad", label: "게임", Icon: IconGamepad },
  { id: "music", label: "음악", Icon: IconMusic },
  { id: "film", label: "영화", Icon: IconFilm },
  { id: "palette", label: "취미", Icon: IconPalette },
  { id: "plane", label: "여행", Icon: IconPlane },
  { id: "paw", label: "반려", Icon: IconPaw },
  { id: "lotus", label: "돌봄", Icon: IconLotus },
  { id: "clover", label: "행운", Icon: IconClover },
  { id: "flame", label: "힘", Icon: IconFlame },
];
export const circleIconOf = (id?: string | null) => CIRCLE_ICONS.find((icon) => icon.id === id);

/** 소로우 머리글자 (이름의 첫 글자) — 아이콘이 없을 때 */
export const circleInitial = (name: string) => name.replace(/\s*소로우$/, "").slice(0, 1);

/** Fluent 아이콘: 그 분류 조각을 받는 동안은 빈 마크(머리글자가 번쩍였다 바뀌지 않게), 없는 이름이면 머리글자 */
function FluentMarkIcon({ name, fallback }: { name: string; fallback: string }) {
  const row = useFluentIcon(name);
  if (row === "missing") return <>{fallback}</>;
  return row ? <FluentSvg row={row} /> : null;
}

/** 소로우 마크: 올린 사진 → 아이콘(Fluent·예전 기본) → 머리글자 순으로 보여 준다. 목록과 소로우 머리에서 같이 쓴다 */
export function CircleMark({ c, preview }: { c: Pick<Circle, "name" | "icon" | "iconUrl">; preview?: string | null }) {
  const image = preview ?? c.iconUrl;
  const fluent = fluentName(c.icon);
  const icon = fluent ? null : circleIconOf(c.icon);
  return (
    <span className={styles.mark} data-image={image ? "" : undefined} aria-hidden="true">
      {image ? <img src={image} alt="" />
        : fluent ? <FluentMarkIcon name={fluent} fallback={circleInitial(c.name)} />
        : icon ? <icon.Icon /> : circleInitial(c.name)}
    </span>
  );
}
