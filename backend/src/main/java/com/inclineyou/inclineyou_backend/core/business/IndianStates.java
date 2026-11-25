package com.inclineyou.inclineyou_backend.core.business;

import java.util.List;

/**
 * India's 28 states and 8 union territories, as a business address names them. Stored by NAME (V46 {@code state}), because
 * that is what prints on a bill; the web's {@code lib/business/states.ts} is the same list, and a value off it is refused.
 */
public final class IndianStates {

    public static final List<String> ALL = List.of(
            "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh",
            "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana",
            "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep",
            "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry",
            "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
            "West Bengal");

    private IndianStates() {}
}
