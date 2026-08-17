/*
# Allow storage photo rollback and deletion

Allows the anon and authenticated roles to delete orphaned/rollback images in the `batch-images` bucket when an inward batch creation fails or when an unused batch is safely deleted.
*/

DROP POLICY IF EXISTS "batch_images_anon_delete" ON storage.objects;
CREATE POLICY "batch_images_anon_delete"
  ON storage.objects FOR DELETE TO anon, authenticated
  USING (bucket_id = 'batch-images');
