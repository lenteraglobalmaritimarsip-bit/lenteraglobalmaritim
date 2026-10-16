UPDATE ports
SET channel_depth_meters = ROUND(channel_depth_meters);

ALTER TABLE ports
  MODIFY COLUMN channel_depth_meters INT NOT NULL DEFAULT 0;
