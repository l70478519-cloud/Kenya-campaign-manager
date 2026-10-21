ALTER TABLE message_campaigns ADD COLUMN IF NOT EXISTS recipient_list text;
ALTER TABLE message_deliveries ALTER COLUMN member_id DROP NOT NULL;
