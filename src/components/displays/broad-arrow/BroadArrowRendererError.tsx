type BroadArrowRendererErrorProps = {
  rendererKey: string;
};

export function BroadArrowRendererError({ rendererKey }: BroadArrowRendererErrorProps) {
  return (
    <div className="flex aspect-video items-center justify-center rounded-md border border-dashed border-red-500/40 bg-background/70 px-4 text-center text-sm text-red-300">
      <div>
        <p className="font-medium">Unknown Broad Arrow renderer</p>
        <p className="mt-1 font-mono text-xs text-muted">{rendererKey}</p>
      </div>
    </div>
  );
}
