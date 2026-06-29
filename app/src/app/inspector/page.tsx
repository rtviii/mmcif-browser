import { redirect } from "next/navigation";

// The inspector is now the default page; keep the old /inspector URL working.
export default function InspectorPage() {
  redirect("/");
}
