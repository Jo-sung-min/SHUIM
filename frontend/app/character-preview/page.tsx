import type { Metadata } from "next";
import PaperCharacterPreview from "@/components/beach/PaperCharacterPreview";

export const metadata: Metadata = {
  title: "몽실 만나기",
  robots: { index: false, follow: false },
};

export default function CharacterPreviewPage() {
  return <PaperCharacterPreview />;
}
