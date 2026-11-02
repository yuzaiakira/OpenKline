import type { Metadata } from "next";
import StudioClient from "./multi-chart-studio-client";

export const metadata: Metadata = {
  title: "OpenKline Studio",
  description: "Internal OpenKline multi-chart Studio for verification and research workflows.",
};

export default function Page() {
  return <StudioClient />;
}
