-- ============================================================
-- MICROSOFT AUTHENTICATOR MFA
-- Adds TOTP-based authenticator support to users.
-- Run against the same database used by the backend.
-- It is idempotent and compatible with MySQL 8.
-- ============================================================

DROP PROCEDURE IF EXISTS instalar_microsoft_authenticator_mfa;
DELIMITER $$

CREATE PROCEDURE instalar_microsoft_authenticator_mfa()
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'usuarios'
          AND COLUMN_NAME = 'mfa_enabled'
    ) THEN
        IF EXISTS (
            SELECT 1
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'usuarios'
              AND COLUMN_NAME = 'foto_perfil_url'
        ) THEN
            ALTER TABLE usuarios
                ADD COLUMN mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE AFTER foto_perfil_url;
        ELSE
            ALTER TABLE usuarios
                ADD COLUMN mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE AFTER email;
        END IF;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'usuarios'
          AND COLUMN_NAME = 'mfa_secret_encrypted'
    ) THEN
        ALTER TABLE usuarios
            ADD COLUMN mfa_secret_encrypted TEXT NULL AFTER mfa_enabled;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'usuarios'
          AND COLUMN_NAME = 'mfa_pending_secret_encrypted'
    ) THEN
        ALTER TABLE usuarios
            ADD COLUMN mfa_pending_secret_encrypted TEXT NULL AFTER mfa_secret_encrypted;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'usuarios'
          AND COLUMN_NAME = 'mfa_enabled_at'
    ) THEN
        ALTER TABLE usuarios
            ADD COLUMN mfa_enabled_at DATETIME NULL AFTER mfa_pending_secret_encrypted;
    END IF;
END$$

DELIMITER ;
CALL instalar_microsoft_authenticator_mfa();
DROP PROCEDURE IF EXISTS instalar_microsoft_authenticator_mfa;
