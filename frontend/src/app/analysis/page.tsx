import { Suspense } from "react";
import AnalysisDashboard from "@/components/AnalysisDashboard";

export default function AnalysisPage() {
  return (
    <Suspense>
      <AnalysisDashboard />
    </Suspense>
  );
}
