import { redirect } from "next/navigation";

// The public storefront is the site homepage; the admin portal lives at /portal.
export default function Home() {
  redirect("/shop");
}
