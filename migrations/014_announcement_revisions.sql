CREATE TABLE announcement_revisions (
 id bigserial PRIMARY KEY,
 announcement_id bigint NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
 version integer NOT NULL,
 title text NOT NULL,
 body text NOT NULL,
 visual_payload jsonb NOT NULL,
 edited_by text NOT NULL,
 edited_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(announcement_id,version)
);
