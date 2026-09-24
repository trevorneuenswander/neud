import { DisplayWindowFitClient } from "@/components/displays/DisplayWindowFitClient";
import {
  parseDisplayWindowFitDimensions,
  parseDisplayWindowFitTarget,
} from "@/lib/displays/display-window-fit";

type DisplayWindowFitPageProps = {
  searchParams: Promise<{
    target?: string;
    width?: string;
    height?: string;
  }>;
};

export default async function DisplayWindowFitPage({
  searchParams,
}: DisplayWindowFitPageProps) {
  const query = await searchParams;
  const target = parseDisplayWindowFitTarget(query.target);
  const { displayWidth, displayHeight } = parseDisplayWindowFitDimensions(
    query.width,
    query.height,
  );

  if (!target) {
    return null;
  }

  return (
    <DisplayWindowFitClient
      targetUrl={target}
      displayWidth={displayWidth}
      displayHeight={displayHeight}
    />
  );
}
