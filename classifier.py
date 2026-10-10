"""
Deterministic lab-value classifier.

This is Layer 1 of the pipeline: rules decide the tier, the AI never does.
It reads all thresholds from reference_ranges.json (the single source of truth)
and assigns NORMAL / BORDERLINE / CRITICAL by plain comparison. No model calls.

NOTE ON DATA: the reference ranges this reads are ILLUSTRATIVE PLACEHOLDERS for
a portfolio/demo. The thresholds are deliberately kept in an editable config
file (not in this code) so a qualified clinical SME can own and update them
without touching logic. Do not use for real medical interpretation as-is.

Usage:
    from classifier import Classifier
    clf = Classifier("reference_ranges.json")
    result = clf.classify("Potassium", 6.1, age=47, sex="M")
    # -> {"tier": "CRITICAL", ...}
"""

import json
from typing import Optional


class Classifier:
    def __init__(self, ranges_path: str):
        with open(ranges_path, "r") as f:
            data = json.load(f)
        self.tests = {}
        self.alias_map = {}
        for t in data["tests"]:
            key = t["test_name"].strip().lower()
            self.tests[key] = t
            self.alias_map[key] = key
            for alias in t.get("aliases", []):
                self.alias_map[alias.strip().lower()] = key

    def _resolve(self, test_name: str) -> Optional[str]:
        """Map a test name or alias to its canonical key."""
        return self.alias_map.get(test_name.strip().lower())

    def _pick_range(self, test: dict, age: Optional[int], sex: Optional[str]) -> Optional[dict]:
        """Pick the range row matching this patient's sex and age bracket.
        Prefers a sex-specific row; falls back to 'ANY'. Returns None if nothing matches."""
        sex = (sex or "ANY").strip().upper()
        candidates = []
        for r in test["ranges"]:
            r_sex = r["sex"].strip().upper()
            sex_ok = (r_sex == sex) or (r_sex == "ANY")
            if age is None:
                age_ok = True
            else:
                age_ok = r["age_min"] <= age <= r["age_max"]
            if sex_ok and age_ok:
                # score: exact sex match beats ANY, so we can prefer it
                score = 1 if r_sex == sex and r_sex != "ANY" else 0
                candidates.append((score, r))
        if not candidates:
            return None
        candidates.sort(key=lambda x: x[0], reverse=True)
        return candidates[0][1]

    def classify(self, test_name: str, value: float,
                 age: Optional[int] = None, sex: Optional[str] = None) -> dict:
        """
        Returns:
            {
              "test_name": <canonical name>,
              "value": <value>,
              "tier": "NORMAL"|"BORDERLINE"|"CRITICAL"|"UNKNOWN",
              "direction": "...",
              "range_used": {...} or None,
              "reason": "<which cutoff fired>",
              "needs_review": bool   # True when we couldn't classify confidently
            }
        """
        key = self._resolve(test_name)
        if key is None:
            return {"test_name": test_name, "value": value, "tier": "UNKNOWN",
                    "reason": "test not in reference table", "needs_review": True,
                    "range_used": None}

        test = self.tests[key]
        r = self._pick_range(test, age, sex)
        if r is None:
            return {"test_name": test["test_name"], "value": value, "tier": "UNKNOWN",
                    "reason": "no matching age/sex range", "needs_review": True,
                    "range_used": None}

        try:
            v = float(value)
        except (TypeError, ValueError):
            return {"test_name": test["test_name"], "value": value, "tier": "UNKNOWN",
                    "reason": "value not numeric", "needs_review": True, "range_used": r}

        direction = test["direction"]
        tier, reason = self._apply_rules(v, r, direction)

        return {
            "test_name": test["test_name"],
            "value": v,
            "unit": test.get("unit"),
            "tier": tier,
            "direction": direction,
            "range_used": r,
            "reason": reason,
            "needs_review": tier == "UNKNOWN",
        }

    @staticmethod
    def _apply_rules(v: float, r: dict, direction: str) -> tuple:
        """Core comparison logic. Order matters: check CRITICAL first, then BORDERLINE, then NORMAL.

        CRITICAL triggers once a value crosses the borderline cutoff (borderline_low/high) --
        that is the actual BORDERLINE/CRITICAL boundary in this 3-tier model. critical_low/high
        are also checked so a row that sets them tighter than the borderline cutoff still works.
        """
        cl, ch = r.get("critical_low"), r.get("critical_high")
        bl, bh = r.get("borderline_low"), r.get("borderline_high")
        nl, nh = r.get("normal_min"), r.get("normal_max")

        # CRITICAL checks
        if direction in ("two_sided", "high_bad"):
            if bh is not None and v > bh:
                return "CRITICAL", f"value > borderline_high ({bh})"
            if ch is not None and v >= ch:
                return "CRITICAL", f"value >= critical_high ({ch})"
        if direction in ("two_sided", "low_bad"):
            if bl is not None and v < bl:
                return "CRITICAL", f"value < borderline_low ({bl})"
            if cl is not None and v <= cl:
                return "CRITICAL", f"value <= critical_low ({cl})"

        # BORDERLINE checks (outside normal but not critical)
        if direction in ("two_sided", "high_bad") and nh is not None and v > nh:
            return "BORDERLINE", f"value > normal_max ({nh})"
        if direction in ("two_sided", "low_bad") and nl is not None and v < nl:
            return "BORDERLINE", f"value < normal_min ({nl})"

        # If we got here, it's within normal bounds on the relevant side(s)
        return "NORMAL", "within normal range"


if __name__ == "__main__":
    import sys
    clf = Classifier("reference_ranges.json")
    # quick smoke test against known-answer cases
    cases = [
        ("Potassium", 6.1, 47, "M", "CRITICAL"),
        ("Fasting Glucose", 92, 47, "M", "NORMAL"),
        ("LDL Cholesterol", 128, 47, "M", "BORDERLINE"),
        ("HDL Cholesterol", 36, 47, "M", "BORDERLINE"),
        ("HbA1c", 6.7, 47, "M", "CRITICAL"),
        ("Hemoglobin", 9.8, 47, "M", "CRITICAL"),
        ("eGFR", 58, 47, "M", "BORDERLINE"),
        ("Sodium", 138, 47, "M", "NORMAL"),
        ("Blood Pressure (Systolic)", 148, 47, "M", "CRITICAL"),
    ]
    passed = 0
    for name, val, age, sex, expected in cases:
        got = clf.classify(name, val, age, sex)["tier"]
        ok = got == expected
        passed += ok
        print(f"[{'PASS' if ok else 'FAIL'}] {name}={val}: got {got}, expected {expected}")
    print(f"\n{passed}/{len(cases)} smoke cases passed")
