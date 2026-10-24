import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const control = sqliteTable('control', { id: integer('id').primaryKey(), ownerId: text('owner_id').notNull(), revision: integer('revision').notNull().default(0), lastMutation: text('last_mutation').notNull().default('') });
export const records = sqliteTable('records', { id: text('id').primaryKey(), kind: text('kind').notNull(), data: text('data').notNull() }, t=>[index('records_kind').on(t.kind)]);
export const audit = sqliteTable('audit', { id: text('id').primaryKey(), actorId: text('actor_id').notNull(), action: text('action').notNull(), detail: text('detail').notNull(), createdAt: text('created_at').notNull() },t=>[index('audit_created').on(t.createdAt)]);

export const credentials = sqliteTable('auth_credentials', {
 employeeId: text('employee_id').primaryKey(), loginId: text('login_id').notNull().unique(),
 pinHash: text('pin_hash').notNull(), salt: text('salt').notNull(), version: text('version').notNull(),
 enabled: integer('enabled').notNull().default(1), updatedAt: integer('updated_at').notNull()
});
export const sessions = sqliteTable('auth_sessions', {
 tokenHash: text('token_hash').primaryKey(), employeeId: text('employee_id').notNull(),
 version: text('version').notNull(), expiresAt: integer('expires_at').notNull(), lastSeen: integer('last_seen').notNull()
}, t=>[index('auth_sessions_employee').on(t.employeeId)]);
export const attempts = sqliteTable('auth_attempts', {
 key: text('key').primaryKey(), count: integer('count').notNull(), expiresAt: integer('expires_at').notNull()
});

export const auditChanges = sqliteTable('audit_changes', {
 id:text('id').primaryKey(),auditId:text('audit_id').notNull(),kind:text('kind').notNull(),recordId:text('record_id').notNull(),beforeData:text('before_data'),afterData:text('after_data')
},t=>[index('audit_changes_event').on(t.auditId)]);
export const backups = sqliteTable('backups', {
 id:text('id').primaryKey(),status:text('status').notNull(),createdAt:text('created_at').notNull(),actorId:text('actor_id').notNull(),reason:text('reason').notNull(),sourceRevision:integer('source_revision').notNull(),progress:text('progress').notNull(),version:integer('version').notNull().default(0)
},t=>[index('backups_created').on(t.createdAt)]);
export const backupParts = sqliteTable('backup_parts', {
 id:text('id').primaryKey(),backupId:text('backup_id').notNull(),partId:text('part_id').notNull(),kind:text('kind').notNull(),objectKey:text('object_key').notNull(),size:integer('size').notNull().default(0),sha256:text('sha256').notNull().default(''),metadata:text('metadata').notNull().default('{}'),status:text('status').notNull()
},t=>[index('backup_parts_backup').on(t.backupId)]);
export const restoreJobs = sqliteTable('restore_jobs', {
 id:text('id').primaryKey(),backupId:text('backup_id').notNull(),actorId:text('actor_id').notNull(),status:text('status').notNull(),createdAt:text('created_at').notNull(),expectedRevision:integer('expected_revision').notNull(),safetyBackupId:text('safety_backup_id').notNull(),progress:text('progress').notNull()
});
