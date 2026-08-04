"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserDisplayOrderRepository = void 0;
function mapRow(row) {
    return {
        userId: row.user_id,
        projectId: row.project_id,
        displayId: row.display_id,
        sortIndex: row.sort_index,
        updatedAt: row.updated_at,
    };
}
class UserDisplayOrderRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    listForUserProject(userId, projectId) {
        const rows = this.db
            .prepare(`SELECT * FROM user_display_order
         WHERE user_id = ? AND project_id = ?
         ORDER BY sort_index ASC, updated_at ASC`)
            .all(userId, projectId);
        return rows.map(mapRow);
    }
    saveOrder(userId, projectId, displayIds) {
        const now = new Date().toISOString();
        const deleteStmt = this.db.prepare(`DELETE FROM user_display_order WHERE user_id = ? AND project_id = ?`);
        const insertStmt = this.db.prepare(`INSERT INTO user_display_order (user_id, project_id, display_id, sort_index, updated_at)
       VALUES (?, ?, ?, ?, ?)`);
        this.db.transaction(() => {
            deleteStmt.run(userId, projectId);
            displayIds.forEach((displayId, index) => {
                insertStmt.run(userId, projectId, displayId, index + 1, now);
            });
        });
        return displayIds.length;
    }
    removeForDisplay(displayId) {
        this.db
            .prepare("DELETE FROM user_display_order WHERE display_id = ?")
            .run(displayId);
    }
    removeForProject(projectId) {
        this.db
            .prepare("DELETE FROM user_display_order WHERE project_id = ?")
            .run(projectId);
    }
}
exports.UserDisplayOrderRepository = UserDisplayOrderRepository;
