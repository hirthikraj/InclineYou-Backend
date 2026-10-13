-- V14 · the invite card says when the link stops working (api-contract 1.2, inv-a1).
--
-- invite_card() answered everything the invite page draws except `expiresAt`, which the contract promises and which the
-- caller cannot read for itself: the page is opened with no session, so client_invite is behind row-level security and
-- the only door is this SECURITY DEFINER function. Replaced in place with one more key; the signature, the grants and every
-- other answer are unchanged (CREATE OR REPLACE keeps the privileges V11 gave it), and invite_card_by_id() reads it too.
CREATE OR REPLACE FUNCTION invite_card(p_token_hash varchar) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE inv client_invite%ROWTYPE; tr record;
BEGIN
    SELECT * INTO inv FROM client_invite WHERE token_hash = p_token_hash;
    IF NOT FOUND OR inv.status IN ('declined', 'revoked') OR (inv.status = 'pending' AND inv.expires_at <= now()) THEN
        RETURN jsonb_build_object('state', 'expired');
    END IF;
    IF inv.status = 'accepted' THEN
        RETURN jsonb_build_object('state', 'used');
    END IF;
    SELECT t.name, b.headline, b.bio, b.intro_video_url, b.certifications, b.specialities, b.languages,
           b.instagram_url, b.youtube_url
      INTO tr
      FROM trainer t LEFT JOIN trainer_business b ON b.trainer_id = t.id
     WHERE t.id = inv.trainer_id;
    RETURN jsonb_build_object(
        'state', 'valid', 'invite_id', inv.id,
        'phone_masked', repeat('•', 5) || right(inv.phone, 4),
        'expires_at', (extract(epoch FROM inv.expires_at) * 1000)::bigint,
        'trainer', jsonb_build_object('name', tr.name, 'headline', tr.headline, 'bio', tr.bio, 'intro_video_url', tr.intro_video_url,
                                      'certifications', tr.certifications, 'specialities', tr.specialities, 'languages', tr.languages,
                                      'instagram_url', tr.instagram_url, 'youtube_url', tr.youtube_url));
END $$;
