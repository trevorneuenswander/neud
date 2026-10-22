/**
 * Graphic data namespace registry (editor UI copy).
 * Keep in sync with desktop/src/packages/sema/graphic-data-registry.ts
 */

export type GraphicDataLeaf = {
  kind: "leaf";
  id: string;
  label: string;
  path: string;
  binding: string;
};

export type GraphicDataGroup = {
  kind: "group";
  id: string;
  label: string;
  children: GraphicDataNode[];
};

export type GraphicDataNode = GraphicDataLeaf | GraphicDataGroup;

export type GraphicDataNamespace = {
  id: string;
  label: string;
  status: "ready" | "reserved";
  root: GraphicDataGroup;
};

function leaf(id: string, label: string, path: string, binding: string): GraphicDataLeaf {
  return { kind: "leaf", id, label, path, binding };
}

function group(id: string, label: string, children: GraphicDataNode[]): GraphicDataGroup {
  return { kind: "group", id, label, children };
}

export const SEMA_SCHEDULE_DATA_NAMESPACE: GraphicDataNamespace = {
  id: "schedule",
  label: "SEMA Schedule",
  status: "ready",
  root: group("schedule", "SEMA Schedule", [
    group("schedule.now", "NOW", [
      leaf("schedule.now.title", "Title", "schedule.now.title", "now.title"),
      leaf(
        "schedule.now.description",
        "Description",
        "schedule.now.description",
        "now.description",
      ),
    ]),
    group("schedule.next", "NEXT", [
      leaf("schedule.next.title", "Title", "schedule.next.title", "next.title"),
      leaf(
        "schedule.next.description",
        "Description",
        "schedule.next.description",
        "next.description",
      ),
    ]),
    group("schedule.later", "LATER", [
      leaf("schedule.later.title", "Title", "schedule.later.title", "later.title"),
      leaf(
        "schedule.later.description",
        "Description",
        "schedule.later.description",
        "later.description",
      ),
    ]),
  ]),
};

export const AUCTION_DATA_NAMESPACE: GraphicDataNamespace = {
  id: "auction",
  label: "Auction",
  status: "reserved",
  root: group("auction", "Auction", []),
};

export const GRAPHIC_DATA_NAMESPACES: GraphicDataNamespace[] = [
  SEMA_SCHEDULE_DATA_NAMESPACE,
  AUCTION_DATA_NAMESPACE,
];

export function flattenDataLeaves(node: GraphicDataNode): GraphicDataLeaf[] {
  if (node.kind === "leaf") return [node];
  return node.children.flatMap(flattenDataLeaves);
}

export function listReadyDataLeaves(): GraphicDataLeaf[] {
  return GRAPHIC_DATA_NAMESPACES.filter((ns) => ns.status === "ready").flatMap((ns) =>
    flattenDataLeaves(ns.root),
  );
}

export function normalizeDataBindingPath(path: string | undefined | null): string | undefined {
  if (!path || typeof path !== "string") return undefined;
  const trimmed = path.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("schedule.")) {
    return trimmed.slice("schedule.".length);
  }
  return trimmed;
}
