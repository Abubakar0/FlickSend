import "../receive.css";
import { isDevelopmentAuthFixtureEnabled } from "../../auth/config";
import { developmentPersonById } from "../../people/people-types";
import { ReceiveTransfersBoundary } from "../receive-transfers-boundary";
import { ReceiveWorkspace } from "../receive-workspace";

export default async function ReceivePage({
  params,
  searchParams
}: Readonly<{
  params: Promise<{ session: string }>;
  searchParams: Promise<{ as?: string }>;
}>) {
  const [{ session }, { as }] = await Promise.all([params, searchParams]);
  if (!isDevelopmentAuthFixtureEnabled()) return <ReceiveWorkspace session={session} />;
  return (
    <ReceiveTransfersBoundary
      currentPersonId={developmentPersonById(as ?? "alex-morgan").id}
      session={session}
    />
  );
}
