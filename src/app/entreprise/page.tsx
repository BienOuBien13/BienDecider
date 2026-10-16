import { CompanyProfileForm } from "@/components/company-profile-form";
import { DeleteAccountSection } from "@/components/delete-account-section";
import { redirect } from "next/navigation";
import { getSessionCompany } from "@/lib/session";

export default async function EntreprisePage() {
  const company = await getSessionCompany();
  if (!company) redirect("/login");
  if (!company.name) redirect("/onboarding");
  return (
    <CompanyProfileForm>
      <DeleteAccountSection requiresPassword={Boolean(company.passwordHash)} />
    </CompanyProfileForm>
  );
}