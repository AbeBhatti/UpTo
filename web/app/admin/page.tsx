import { AdminConsole } from "./_components/AdminConsole";

export const metadata = { title: "Admin · UpTo" };

/** Outside the (app) shell on purpose: a moderation tool, not a student screen. */
export default function AdminPage() {
  return <AdminConsole />;
}
