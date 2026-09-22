CREATE TABLE events (
  uuid              CHAR(36) NOT NULL PRIMARY KEY,
  event_type        INTEGER  NOT NULL,
  user_uuid         CHAR(36),
  org_uuid          CHAR(36),
  cipher_uuid       CHAR(36),
  act_user_uuid     CHAR(36),
  device_type       INTEGER,
  ip_address        TEXT,
  event_date        TIMESTAMP NOT NULL,
  policy_uuid       CHAR(36)
);
