import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { homeFor } from "@/lib/constants";

export default async function Home() {
  const profile = await getProfile();
  redirect(homeFor(profile.role));
}
