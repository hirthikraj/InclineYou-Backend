package com.inclineyou.inclineyou_backend.core.trainer.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** {@code GET} and {@code PATCH /v1/trainers/me} — the trainer's own profile. */
public record TrainerResponse(
        String id,
        String phone,
        String name,
        String upiVpa,
        String experienceBand,
        List<String> specialities,
        List<String> certifications,
        List<String> languages,
        boolean setupComplete,
        Instant setupCompletedAt,
        String gymName,
        Map<String, Object> preferences,
        /* ---- identity (V33). Null means never answered. ---- */
        String headline,
        String bio,
        /** Canonical watch URL. */
        String introVideoUrl,
        /**
         * The 11-character id out of {@code introVideoUrl}, derived not
         * stored. It is on the wire so a card that wants a thumbnail or an
         * `<iframe>` does not re-implement the parse in TypeScript — which
         * is the same argument that put `label` and `variables` on the
         * nudge-template wire rather than in a copy on each half.
         */
        String introVideoId,
        /* ---- where and how (V34). Null / empty means never answered. ---- */
        /** Verbatim, as pasted. Not canonicalised — see V34. */
        String mapLink,
        List<String> trainingModes,
        List<String> serviceAreas,
        /* ---- where to look (V35). Null means never answered. ---- */
        /** Canonical profile URL. */
        String instagramUrl,
        /** Canonical CHANNEL URL — not a video. */
        String youtubeUrl,
        /**
         * {@code @handle} out of whichever of the two is set, derived not
         * stored — on the wire for the same reason {@code introVideoId} is,
         * so a card that wants to render the handle rather than the URL does
         * not re-implement the parse. Null for a {@code /channel/UC…} URL,
         * which genuinely has no handle to show.
         */
        String instagramHandle,
        String youtubeHandle,
        /* ---- the account (V36). Null means never answered. ---- */
        /**
         * A contact address, not a login. Appended LAST, like every field
         * before it, because a response field's position is part of the
         * additive contract every older build reads by name.
         */
        String email,
        /* ---- V6. Null means never asked; "undisclosed" is an answer. ---- */
        String gender,
        /* ---- V8. The directory place gymName was picked from; null for free text or no gym. ---- */
        GymPlaceView gymPlace
) {}
