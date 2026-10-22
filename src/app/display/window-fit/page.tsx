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
    surface?: string;
    cursor?: string;
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
      surface={
        query.surface === "computer" ? "computer" : query.surface === "decklink" ? "decklink" : "preview"
      }
      hideCursor={query.cursor === "none"}
    />
  );
}
