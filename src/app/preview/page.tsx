import { redirect } from "next/navigation";
import type { Route } from "next";

export default function PreviewPage() {
  redirect("/preview/board" as Route);
}
