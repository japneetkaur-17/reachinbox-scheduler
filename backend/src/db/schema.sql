-- All timestamps are stored in UTC (DATETIME(3) = millisecond precision).

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  google_id     VARCHAR(64)  NOT NULL UNIQUE,
  email         VARCHAR(255) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  avatar_url    VARCHAR(1024) NULL,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

-- Slack connection per user (tenant). Deleting the row = disconnected.
CREATE TABLE IF NOT EXISTS slack_connections (
  user_id       INT UNSIGNED PRIMARY KEY,
  team_name     VARCHAR(255) NULL,
  channel       VARCHAR(255) NULL,
  webhook_url   VARCHAR(1024) NOT NULL,
  access_token  VARCHAR(512) NULL,
  connected_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_slack_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Pool of Ethereal SMTP mailboxes used to send.
CREATE TABLE IF NOT EXISTS senders (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  smtp_host     VARCHAR(255) NOT NULL DEFAULT 'smtp.ethereal.email',
  smtp_port     INT NOT NULL DEFAULT 587,
  smtp_user     VARCHAR(255) NOT NULL,
  smtp_pass     VARCHAR(255) NOT NULL,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

-- One row per "Compose -> Schedule" action.
CREATE TABLE IF NOT EXISTS campaigns (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED NOT NULL,
  subject           VARCHAR(998) NOT NULL,
  body              MEDIUMTEXT   NOT NULL,
  start_time        DATETIME(3)  NOT NULL,
  delay_between_ms  INT UNSIGNED NOT NULL,
  hourly_limit      INT UNSIGNED NOT NULL,
  total_recipients  INT UNSIGNED NOT NULL,
  created_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_campaign_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- One row per recipient. This row is the source of truth for idempotency.
CREATE TABLE IF NOT EXISTS emails (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  campaign_id       INT UNSIGNED NOT NULL,
  user_id           INT UNSIGNED NOT NULL,
  sender_id         INT UNSIGNED NOT NULL,
  recipient         VARCHAR(320) NOT NULL,
  seq               INT UNSIGNED NOT NULL,
  scheduled_at      DATETIME(3)  NOT NULL,
  status            ENUM('scheduled','processing','sent','failed') NOT NULL DEFAULT 'scheduled',
  attempts          INT UNSIGNED NOT NULL DEFAULT 0,
  reschedule_count  INT UNSIGNED NOT NULL DEFAULT 0,
  claimed_at        DATETIME(3)  NULL,
  sent_at           DATETIME(3)  NULL,
  message_id        VARCHAR(512) NULL,
  preview_url       VARCHAR(1024) NULL,
  error             TEXT NULL,
  created_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_campaign_recipient (campaign_id, recipient),
  KEY idx_user_status_sched (user_id, status, scheduled_at),
  KEY idx_status_sched (status, scheduled_at),
  CONSTRAINT fk_email_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_email_sender FOREIGN KEY (sender_id) REFERENCES senders(id)
);
