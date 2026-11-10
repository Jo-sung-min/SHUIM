"use client";

import dynamic from "next/dynamic";

const ChibiLab = dynamic(() => import("@/components/chibi/ChibiLab"), { ssr: false });

export default function ChibiLabPage() {
  return <ChibiLab />;
}
