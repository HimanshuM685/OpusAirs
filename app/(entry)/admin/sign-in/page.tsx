import AdminSignInForm from "./form";

export default async function AdminSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  return <AdminSignInForm unconfigured={params.error === "unconfigured"} />;
}
