/**
 * Graphic data namespace registry — extensible tree of bindable fields.
 * SEMA Schedule is implemented; Auction namespace is reserved for later.
 */

export type GraphicDataLeaf = {
  kind: "leaf";
  id: string;
  label: string;
  /** Canonical path, e.g. schedule.now.title */
  path: string;
  /** Runtime binding understood by editable displays (legacy-compatible). */
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
  /** Reserved for future namespaces (e.g. auction). */
  status: "ready" | "reserved";
  root: GraphicDataGroup;
};

function leaf(id: string, label: string, path: string, binding: string): GraphicDataLeaf {
  return { kind: "leaf", id, label, path, binding };
}

function group(id: string, label: string, children: GraphicDataNode[]): GraphicDataGroup {
  return { kind: "group", id, label, children };
}

/** SEMA Schedule: NOW / NEXT / LATER Title + Description */
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

/** Future Auction / BAG bindings — structure only, no leaves yet. */
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

/** Map schedule.now.title or now.title → legacy binding now.title */
export function normalizeDataBindingPath(path: string | undefined | null): string | undefined {
  if (!path || typeof path !== "string") return undefined;
  const trimmed = path.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("schedule.")) {
    return trimmed.slice("schedule.".length);
  }
  return trimmed;
}

export function findLeafByPath(path: string): GraphicDataLeaf | undefined {
  const normalized = path.trim();
  return listReadyDataLeaves().find(
    (leafNode) => leafNode.path === normalized || leafNode.binding === normalized,
  );
}
