import Link from "next/link";

import { EmptyState } from "@/components/leap/EmptyState";
import { Button } from "@/components/ui/button";

export default function DashboardNotFound() {
  return (
    <div className="pt-2">
      <h1 className="sr-only">Page not found</h1>
      <EmptyState
        title="This page does not exist"
        body="The link may be old or mistyped. Your matches are a click away."
        action={<Button nativeButton={false} render={<Link href="/jobs" />}>Go to Jobs</Button>}
      />
    </div>
  );
}
