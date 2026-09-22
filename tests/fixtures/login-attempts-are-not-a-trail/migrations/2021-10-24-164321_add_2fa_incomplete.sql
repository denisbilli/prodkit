CREATE TABLE twofactor_incomplete (
  user_uuid     CHAR(36)  NOT NULL,
  device_uuid   CHAR(36)  NOT NULL,
  device_name   TEXT      NOT NULL,
  login_time    TIMESTAMP NOT NULL,
  ip_address    TEXT      NOT NULL,
  PRIMARY KEY (user_uuid, device_uuid)
);
