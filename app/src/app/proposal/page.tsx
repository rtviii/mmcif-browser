import type { Metadata } from "next";
import ProposalPage from "@/components/proposal/ProposalPage";

export const metadata: Metadata = {
  title: "Encoding heterogeneity · mmCIF Browser",
  description:
    "A stage-by-stage walkthrough of the proposed mmCIF heterogeneity extension, from the minimal file to the open frontier, with interactive 3D viewers and real CIF blocks.",
};

export default function Page() {
  return <ProposalPage />;
}
