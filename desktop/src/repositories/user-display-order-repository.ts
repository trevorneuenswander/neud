import type { LocalDatabase } from "../database/connection";

export type UserDisplayOrderRow = {
  userId: string;
  projectId: string;
  displayId: string;
  sortIndex: number;
  updatedAt: string;
};

type OrderRow = {
  user_id: string;
  project_id: string;
  display_id: string;
  sort_index: number;
  updated_at: string;
};

function mapRow(row: OrderRow): UserDisplayOrderRow {
  return {
    userId: row.user_id,
    projectId: row.project_id,
    displayId: row.display_id,
    sortIndex: row.sort_index,
    updatedAt: row.updated_at,
  };
}

export class UserDisplayOrderRepository {
  constructor(private readonly db: LocalDatabase) {}

  listForUserProject(userId: string, projectId: string): UserDisplayOrderRow[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM user_display_order
         WHERE user_id = ? AND project_id = ?
         ORDER BY sort_index ASC, updated_at ASC`,
      )
      .all(userId, projectId) as OrderRow[];
    return rows.map(mapRow);
  }

  saveOrder(userId: string, projectId: string, displayIds: string[]): number {
    const now = new Date().toISOString();
    const deleteStmt = this.db.prepare(
      `DELETE FROM user_display_order WHERE user_id = ? AND project_id = ?`,
    );
    const insertStmt = this.db.prepare(
      `INSERT INTO user_display_order (user_id, project_id, display_id, sort_index, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    );

    this.db.transaction(() => {
      deleteStmt.run(userId, projectId);
      displayIds.forEach((displayId, index) => {
        insertStmt.run(userId, projectId, displayId, index + 1, now);
      });
    });

    return displayIds.length;
  }

  removeForDisplay(displayId: string): void {
    this.db
      .prepare("DELETE FROM user_display_order WHERE display_id = ?")
      .run(displayId);
  }

  removeForProject(projectId: string): void {
    this.db
      .prepare("DELETE FROM user_display_order WHERE project_id = ?")
      .run(projectId);
  }
}
