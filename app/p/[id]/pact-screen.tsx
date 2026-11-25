"use client";

import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { PactView } from "./pact-view";

/** The router keeps this screen alive after you leave it. Opening the pact again starts clean (no menu or sheet left open); going back to it doesn't. */
export function PactScreen(props: ComponentProps<typeof PactView>) {
  const { bfcacheId } = useRouter();
  return <PactView key={`${props.b.pact.id}-${bfcacheId}`} {...props} />;
}
