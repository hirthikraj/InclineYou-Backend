package com.inclineyou.inclineyou_backend.shared.wire;

import java.util.List;

/**
 * A bounded list on the 1.1 wire — {@code {"items": […]}}, never a bare array
 * (api-contract *Conventions · Lists*). Bounded means the caller can never get
 * more than a screenful by construction: working hours, the roster, the live
 * packs. The envelope costs nothing now and is what lets a cursor or a total be
 * added later without breaking anyone.
 */
public record Items<T>(List<T> items) {

    public static <T> Items<T> of(List<T> items) {
        return new Items<>(items);
    }
}
