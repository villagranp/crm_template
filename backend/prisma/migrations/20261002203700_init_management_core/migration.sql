-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'LOCKED');

-- CreateEnum
CREATE TYPE "identity_provider" AS ENUM ('LOCAL', 'ENTRA_ID');

-- CreateEnum
CREATE TYPE "data_scope" AS ENUM ('OWN', 'TEAM', 'TERRITORY', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "assignment_effect" AS ENUM ('GRANT', 'DENY');

-- CreateEnum
CREATE TYPE "menu_option_kind" AS ENUM ('LINK', 'GROUP');

-- CreateEnum
CREATE TYPE "approval_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('IN_APP', 'EMAIL');

-- CreateEnum
CREATE TYPE "parameter_type" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'DATE');

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "parent_id" UUID,
    "manager_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "email_normalized" VARCHAR(320) NOT NULL,
    "first_name" VARCHAR(80) NOT NULL,
    "last_name" VARCHAR(80) NOT NULL,
    "display_name" VARCHAR(160) NOT NULL,
    "job_title" VARCHAR(120),
    "phone" VARCHAR(40),
    "avatar_url" VARCHAR(500),
    "locale" VARCHAR(10) NOT NULL DEFAULT 'es-MX',
    "time_zone" VARCHAR(60) NOT NULL DEFAULT 'America/Mexico_City',
    "status" "user_status" NOT NULL DEFAULT 'INVITED',
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "identity_provider" NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "tenant_id" VARCHAR(100),
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_credentials" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "algorithm" VARCHAR(40) NOT NULL DEFAULT 'argon2id',
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "password_changed_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" VARCHAR(128) NOT NULL,
    "replaced_by_id" UUID,
    "user_agent" VARCHAR(400),
    "ip_address" VARCHAR(45),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_reason" VARCHAR(120),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "email_attempted" VARCHAR(320) NOT NULL,
    "provider" "identity_provider" NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "failure_reason" VARCHAR(80),
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(400),
    "correlation_id" VARCHAR(64),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(120) NOT NULL,
    "resource" VARCHAR(60) NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(400),
    "module_id" UUID,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(400),
    "data_scope" "data_scope" NOT NULL DEFAULT 'OWN',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "user_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "effect" "assignment_effect" NOT NULL DEFAULT 'GRANT',
    "reason" VARCHAR(300) NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("user_id","permission_id")
);

-- CreateTable
CREATE TABLE "app_modules" (
    "id" UUID NOT NULL,
    "key" VARCHAR(60) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(400),
    "icon" VARCHAR(60),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "app_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_options" (
    "id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "parent_id" UUID,
    "key" VARCHAR(80) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "description" VARCHAR(400),
    "icon" VARCHAR(60),
    "kind" "menu_option_kind" NOT NULL DEFAULT 'LINK',
    "path" VARCHAR(200),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "required_permission_id" UUID,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "menu_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_menu_options" (
    "role_id" UUID NOT NULL,
    "menu_option_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,

    CONSTRAINT "role_menu_options_pkey" PRIMARY KEY ("role_id","menu_option_id")
);

-- CreateTable
CREATE TABLE "user_menu_options" (
    "user_id" UUID NOT NULL,
    "menu_option_id" UUID NOT NULL,
    "effect" "assignment_effect" NOT NULL DEFAULT 'GRANT',
    "reason" VARCHAR(300) NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,

    CONSTRAINT "user_menu_options_pkey" PRIMARY KEY ("user_id","menu_option_id")
);

-- CreateTable
CREATE TABLE "system_parameters" (
    "id" UUID NOT NULL,
    "key" VARCHAR(120) NOT NULL,
    "value" TEXT NOT NULL,
    "type" "parameter_type" NOT NULL DEFAULT 'STRING',
    "group" VARCHAR(60) NOT NULL DEFAULT 'general',
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(500),
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "system_parameters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogs" (
    "id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(400),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "catalogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_items" (
    "id" UUID NOT NULL,
    "catalog_id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "label" VARCHAR(160) NOT NULL,
    "metadata" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequences" (
    "id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "prefix" VARCHAR(20) NOT NULL DEFAULT '',
    "pattern" VARCHAR(80) NOT NULL DEFAULT '{prefix}-{year}-{seq}',
    "padding" INTEGER NOT NULL DEFAULT 5,
    "current_value" INTEGER NOT NULL DEFAULT 0,
    "reset_policy" VARCHAR(10) NOT NULL DEFAULT 'NONE',
    "period_key" VARCHAR(10),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_files" (
    "id" UUID NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum" VARCHAR(128),
    "owner_type" VARCHAR(80),
    "owner_id" VARCHAR(64),
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "channel" "notification_channel" NOT NULL DEFAULT 'IN_APP',
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "link" VARCHAR(300),
    "severity" VARCHAR(20) NOT NULL DEFAULT 'info',
    "read_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "resource_type" VARCHAR(80) NOT NULL,
    "resource_id" VARCHAR(64) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "reason" VARCHAR(1000),
    "status" "approval_status" NOT NULL DEFAULT 'PENDING',
    "requested_by_id" UUID NOT NULL,
    "payload" JSONB,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_steps" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "approver_id" UUID,
    "approver_role_id" UUID,
    "status" "approval_status" NOT NULL DEFAULT 'PENDING',
    "comment" VARCHAR(1000),
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "correlation_id" VARCHAR(64) NOT NULL,
    "event" VARCHAR(100) NOT NULL,
    "subject_id" VARCHAR(128),
    "subject_email" VARCHAR(320),
    "resource_type" VARCHAR(100),
    "resource_id" VARCHAR(128),
    "ip_address" VARCHAR(45),
    "changes" JSONB,
    "metadata" JSONB,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teams_code_key" ON "teams"("code");

-- CreateIndex
CREATE INDEX "idx_teams_parent_id" ON "teams"("parent_id");

-- CreateIndex
CREATE INDEX "idx_teams_is_active" ON "teams"("is_active");

-- CreateIndex
CREATE INDEX "idx_team_members_user_id" ON "team_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_team_members_team_user" ON "team_members"("team_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_normalized_key" ON "users"("email_normalized");

-- CreateIndex
CREATE INDEX "idx_users_status" ON "users"("status");

-- CreateIndex
CREATE INDEX "idx_users_deleted_at" ON "users"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_user_identities_user_id" ON "user_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_identities_provider_subject" ON "user_identities"("provider", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "user_credentials_user_id_key" ON "user_credentials"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_refresh_token_hash_key" ON "user_sessions"("refresh_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_replaced_by_id_key" ON "user_sessions"("replaced_by_id");

-- CreateIndex
CREATE INDEX "idx_user_sessions_user_id_expires_at" ON "user_sessions"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "idx_login_attempts_email_occurred_at" ON "login_attempts"("email_attempted", "occurred_at");

-- CreateIndex
CREATE INDEX "idx_login_attempts_ip_occurred_at" ON "login_attempts"("ip_address", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "idx_password_reset_tokens_user_id" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "idx_permissions_module_id" ON "permissions"("module_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_permissions_resource_action" ON "permissions"("resource", "action");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE INDEX "idx_roles_is_active" ON "roles"("is_active");

-- CreateIndex
CREATE INDEX "idx_role_permissions_permission_id" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "idx_user_roles_role_id" ON "user_roles"("role_id");

-- CreateIndex
CREATE INDEX "idx_user_permissions_permission_id" ON "user_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_modules_key_key" ON "app_modules"("key");

-- CreateIndex
CREATE INDEX "idx_app_modules_sort_order" ON "app_modules"("sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "menu_options_key_key" ON "menu_options"("key");

-- CreateIndex
CREATE INDEX "idx_menu_options_module_id_sort_order" ON "menu_options"("module_id", "sort_order");

-- CreateIndex
CREATE INDEX "idx_menu_options_parent_id" ON "menu_options"("parent_id");

-- CreateIndex
CREATE INDEX "idx_role_menu_options_menu_option_id" ON "role_menu_options"("menu_option_id");

-- CreateIndex
CREATE INDEX "idx_user_menu_options_menu_option_id" ON "user_menu_options"("menu_option_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_parameters_key_key" ON "system_parameters"("key");

-- CreateIndex
CREATE INDEX "idx_system_parameters_group" ON "system_parameters"("group");

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_preferences_user_key" ON "user_preferences"("user_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "catalogs_key_key" ON "catalogs"("key");

-- CreateIndex
CREATE INDEX "idx_catalog_items_catalog_id_sort_order" ON "catalog_items"("catalog_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "uq_catalog_items_catalog_code" ON "catalog_items"("catalog_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "sequences_key_key" ON "sequences"("key");

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_storage_key_key" ON "stored_files"("storage_key");

-- CreateIndex
CREATE INDEX "idx_stored_files_owner" ON "stored_files"("owner_type", "owner_id");

-- CreateIndex
CREATE INDEX "idx_notifications_user_id_read_at" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "approval_requests_code_key" ON "approval_requests"("code");

-- CreateIndex
CREATE INDEX "idx_approval_requests_status_created_at" ON "approval_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "idx_approval_requests_resource" ON "approval_requests"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "idx_approval_steps_approver_status" ON "approval_steps"("approver_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_approval_steps_request_sequence" ON "approval_steps"("request_id", "sequence");

-- CreateIndex
CREATE INDEX "idx_audit_logs_correlation_id" ON "audit_logs"("correlation_id");

-- CreateIndex
CREATE INDEX "idx_audit_logs_subject_id_occurred_at" ON "audit_logs"("subject_id", "occurred_at");

-- CreateIndex
CREATE INDEX "idx_audit_logs_resource" ON "audit_logs"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "idx_audit_logs_event_occurred_at" ON "audit_logs"("event", "occurred_at");

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "user_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "app_modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_options" ADD CONSTRAINT "menu_options_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "app_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_options" ADD CONSTRAINT "menu_options_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "menu_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_options" ADD CONSTRAINT "menu_options_required_permission_id_fkey" FOREIGN KEY ("required_permission_id") REFERENCES "permissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_menu_options" ADD CONSTRAINT "role_menu_options_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_menu_options" ADD CONSTRAINT "role_menu_options_menu_option_id_fkey" FOREIGN KEY ("menu_option_id") REFERENCES "menu_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_menu_options" ADD CONSTRAINT "user_menu_options_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_menu_options" ADD CONSTRAINT "user_menu_options_menu_option_id_fkey" FOREIGN KEY ("menu_option_id") REFERENCES "menu_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "catalogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
