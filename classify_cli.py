"""
Stdin/stdout JSON bridge to Classifier, for the Next.js API layer to invoke as a subprocess.

Input (stdin), JSON:
    {
      "age": 47,
      "sex": "M",
      "items": [ {"test_name": "Potassium", "value": "6.1"}, ... ]
    }

Output (stdout), JSON: a list of classify() result dicts, same order as "items".
Never raises on a per-item basis -- a bad item becomes an UNKNOWN/needs_review entry
instead of aborting the whole batch.
"""

import json
import sys

from classifier import Classifier


def main() -> None:
    payload = json.loads(sys.stdin.read())
    age = payload.get("age")
    sex = payload.get("sex")
    items = payload.get("items", [])

    clf = Classifier("reference_ranges.json")

    results = []
    for item in items:
        test_name = item.get("test_name", "")
        value = item.get("value")
        try:
            result = clf.classify(test_name, value, age=age, sex=sex)
        except Exception as e:  # noqa: BLE001 - last-resort guard, never abort the batch
            result = {
                "test_name": test_name,
                "value": value,
                "tier": "UNKNOWN",
                "reason": f"classification error: {e}",
                "needs_review": True,
                "range_used": None,
            }
        results.append(result)

    json.dump(results, sys.stdout)


if __name__ == "__main__":
    main()
