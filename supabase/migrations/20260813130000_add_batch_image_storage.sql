/*
# Photo storage for inward batches (Supabase Storage)

Creates a public bucket `batch-images` and gives the anon/authenticated roles
just enough permission to upload and read batch photos:

- SELECT on the bucket's objects (reading photos)
- INSERT on the bucket's objects (uploading a photo)

No UPDATE/DELETE — once a photo is attached to a batch it cannot be replaced or
removed by the app, keeping the ledger trustworthy. Photos are only ever added.

This is idempotent: safe to run more than once, and safe to run on a project
that already has the bucket (e.g. created in the dashboard).
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('batch-images', 'batch-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "batch_images_public_read" ON storage.objects;
CREATE POLICY "batch_images_public_read"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'batch-images');

DROP POLICY IF EXISTS "batch_images_anon_insert" ON storage.objects;
CREATE POLICY "batch_images_anon_insert"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (
    bucket_id = 'batch-images'
    -- Only images, and only up to 10 MB: protects the free storage quota
    -- from abuse (anyone holding the public anon key can attempt uploads).
    AND COALESCE((metadata->>'size')::bigint, 0) <= 10485760
    AND lower(COALESCE((metadata->>'mimetype'), '')) LIKE 'image/%'
  );
