import { session } from "@/lib/session";
import { Studio } from "@/components/studio";
export default async function Page() {
  return <Studio section="overview" session={await session()} />;
}
