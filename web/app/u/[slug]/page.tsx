import { SharedUpTo } from "./SharedUpTo";

export const metadata = { title: "An Up-To · UpTo" };

/** Public: outside the (app) shell, so people without an account see it cleanly. */
export default async function SharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <SharedUpTo slug={slug} />;
}
