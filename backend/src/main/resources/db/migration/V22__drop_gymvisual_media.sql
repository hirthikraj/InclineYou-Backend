-- Removes the © Gym visual media from the seeded library.
--
-- The exercise *data* — names, body parts, equipment, targets, instructions — is
-- MIT and stays exactly as it is. The pictures were never ours: both the 180×180
-- thumbnails and the 180×180 animation GIFs are © Gym visual, redistributed
-- upstream under a written permission granted to that repository and not to us.
-- Rather than ship them while a licence is outstanding, they come out.
--
-- The columns stay. `image_url` and `video_url` have existed since V1, the
-- schema is additive-only, and a trainer's own exercise may yet carry a picture —
-- what was licensed is the content, not the column. So this clears values and
-- drops nothing.
--
-- `updated_at` is bumped deliberately. These rows are already on devices with the
-- media URLs written into them; without a new timestamp the sync cursor skips
-- them and every phone keeps rendering the frames we just decided not to serve.
-- Retirement has to travel the same way the seed did.
--
-- Matched on the `gymvisual-` prefix rather than on `source_id IS NOT NULL`,
-- which would also sweep the 873 free-exercise-db rows V21 retired. Those hold
-- public-domain photographs, so there is no licence reason to touch them — and
-- touching them would bump `updated_at` on 873 already-deleted rows and push all
-- of them down every device's sync cursor to change nothing anyone can see.
UPDATE exercise
   SET image_url  = NULL,
       video_url  = NULL,
       -- `mediaSize` recorded the 180×180 cap we were honouring, and `attribution`
       -- carried the notice. Neither has anything to describe once the media is
       -- gone, and leaving a copyright line on a row with no copyrighted content
       -- is a claim about the data that is not true.
       metadata   = metadata - 'attribution' - 'mediaSize',
       updated_at = NOW()
 WHERE source_id LIKE 'gymvisual-%'
   AND (
        image_url IS NOT NULL
     OR video_url IS NOT NULL
     OR metadata ? 'attribution'
     OR metadata ? 'mediaSize'
   );
