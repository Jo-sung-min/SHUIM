import { Suspense } from "react";
import OutingSpace from "@/components/outing/OutingSpace";
export default function OutingSpacePage() { return <Suspense fallback={<p role="status">함께 갈 풍경을 준비하고 있어요.</p>}><OutingSpace /></Suspense>; }
