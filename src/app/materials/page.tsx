import { ProjectMaterialsPage } from "@/components/project-context/project-materials-page";

type MaterialsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MaterialsPage({ searchParams }: MaterialsPageProps) {
  const resolvedSearchParams = await searchParams;
  return <ProjectMaterialsPage initialView={resolveInitialView(resolvedSearchParams?.view)} />;
}

function resolveInitialView(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] === "wiki" ? "wiki" : "materials") : value === "wiki" ? "wiki" : "materials";
}
