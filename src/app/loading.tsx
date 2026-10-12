import { PageStatus } from "@/components/page-status";

export default function Loading() {
  return <PageStatus loading title="Chargement en cours" message="Votre page est en cours de préparation." />;
}