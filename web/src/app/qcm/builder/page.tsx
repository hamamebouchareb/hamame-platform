import QcmBuilderClient from "./QcmBuilderClient";

export default async function QcmBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  return <QcmBuilderClient initialMode={mode === "exam" ? "exam" : "practice"} />;
}
