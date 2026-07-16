SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS approval_task_decisions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_id VARCHAR(160) NOT NULL,
    task_type VARCHAR(60) NOT NULL,
    task_title VARCHAR(255) NOT NULL,
    task_context VARCHAR(255) NULL,
    source_url VARCHAR(500) NULL,
    decision_status ENUM(
        'pending_review',
        'in_review',
        'approved',
        'rejected',
        'changes_requested',
        'resolved'
    ) NOT NULL DEFAULT 'pending_review',
    priority VARCHAR(40) NOT NULL DEFAULT 'normal',
    notes TEXT NULL,
    decided_by INT NULL,
    decided_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_approval_task_decisions_task (task_id),
    INDEX idx_approval_task_decisions_status (decision_status),
    INDEX idx_approval_task_decisions_type (task_type),
    INDEX idx_approval_task_decisions_decider (decided_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS approval_task_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    task_id VARCHAR(160) NOT NULL,
    task_type VARCHAR(60) NOT NULL,
    event_type VARCHAR(60) NOT NULL DEFAULT 'decision',
    previous_status VARCHAR(60) NULL,
    new_status VARCHAR(60) NOT NULL,
    comment TEXT NULL,
    actor_id INT NULL,
    actor_name VARCHAR(255) NULL,
    metadata JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_approval_task_events_task (task_id, created_at),
    INDEX idx_approval_task_events_actor (actor_id),
    INDEX idx_approval_task_events_status (new_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
