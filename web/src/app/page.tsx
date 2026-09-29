import { redirect } from "next/navigation";

/**
 * The app has no public marketing surface yet, so the root just hands off to the
 * dashboard. Signed-out visitors are bounced on to /login from there by
 * useRequireAuth, which keeps the auth decision in one place.
 */
export default function Home() {
  redirect("/dashboard");
}
