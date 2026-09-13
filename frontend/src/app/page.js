import { Suspense } from "react";
import Landing from "@/components/landing/Landing.jsx";

export const metadata = {
  title: "Stack Board",
  description: "Real-time collaborative task boards with an AI planning agent and semantic search.",
};

// Landing uses useSearchParams (Google OAuth callback), which needs Suspense.
export default function Home() {
  return (
    <Suspense fallback={null}>
      <Landing />
    </Suspense>
  );
}
