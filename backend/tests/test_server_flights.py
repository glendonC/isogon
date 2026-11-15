"""The regions answer and each region's calendar are built once however many ask at once, a second asker waiting
for the first; and health never waits on them or on reading the FIRMS row counts."""
from __future__ import annotations

from collections import OrderedDict
import threading
import time
import unittest
from unittest import mock

from backend import server as S


def _bare_store() -> S.IsogonDataStore:
    """A store holding only what the regions answer, the calendars and health read (no fields, no baseline run)."""
    store = S.IsogonDataStore.__new__(S.IsogonDataStore)
    store._lock = threading.Lock()
    store._runs = OrderedDict()
    store.box_index = mock.Mock()
    store.field_meta = {"terrain_source": "test"}
    store.calibrator = mock.Mock()
    store.calibrator.diagnostics.to_dict.return_value = {}
    return store


def _together(n: int, fn) -> list:
    out: list = []
    threads = [threading.Thread(target=lambda: out.append(fn())) for _ in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)
    return out


def _counts(n: int) -> dict:
    return {"downloaded_rows": n, "downloaded_files": 1, "rows_in_region_boxes": {}}


class SingleFlightTests(unittest.TestCase):
    def test_a_region_s_calendar_is_built_once_by_askers_at_once(self) -> None:
        store, built = _bare_store(), []

        def slow_calendar(rid: str) -> dict:
            built.append(rid)
            time.sleep(0.3)
            return {"region": rid}

        rid = next(iter(S.REGION_COUNTRY))
        with mock.patch.object(S, "firms_calendar", slow_calendar), \
                mock.patch.object(S.IsogonDataStore, "region_rows_key", lambda self, r, max_age_s=10.0: "rows"), \
                mock.patch.object(S.IsogonDataStore, "real_run_starts", lambda self, r, cal, key: {"starts": []}):
            answers = _together(6, lambda: store.firms_calendar_payload(rid))
        self.assertEqual(built, [rid])
        self.assertEqual(len(answers), 6)
        self.assertEqual(len({body for body, _ in answers}), 1)

    def test_the_regions_answer_is_built_once_shared_and_built_again_when_rows_change(self) -> None:
        store, builds, rows = _bare_store(), [], {"key": "rows"}

        def slow_places(starts_of, index=None, **_kw) -> dict:
            builds.append(1)
            time.sleep(0.3)
            return {"places": [{"id": "p", "rows": rows["key"]}]}

        with mock.patch.object(S, "places_payload", slow_places), \
                mock.patch.object(S.IsogonDataStore, "region_rows_key", lambda self, r, max_age_s=10.0: rows["key"]), \
                mock.patch.object(S.IsogonDataStore, "box_index_key", lambda self, max_age_s=10.0: "index"):
            answers = _together(5, store.regions_full_payload)
            self.assertEqual(len(builds), 1)
            self.assertEqual(len(answers), 5)
            self.assertEqual(len(set(answers)), 1)
            self.assertIn(b'"schema_version": "1.1.0"', answers[0])
            store.regions_full_payload()
            self.assertEqual(len(builds), 1)
            rows["key"] = "rows changed"
            self.assertIn(b"rows changed", store.regions_full_payload())
            self.assertEqual(len(builds), 2)

    def test_health_answers_at_once_while_the_regions_are_built_and_its_counts_are_read_again_behind_it(self) -> None:
        store, reads = _bare_store(), []

        def slow_summary() -> dict:
            reads.append(1)
            time.sleep(0.8)
            return _counts(len(reads))

        with mock.patch.object(S, "firms_cache_summary", slow_summary):
            self.assertEqual(store.firms_counts()["downloaded_rows"], 1)    # the first read (before the port opens)
            region = f"calendar {next(iter(S.REGION_COUNTRY))}"
            with store._flight("regions"), store._flight(region):            # a regions build and a calendar under way
                t = time.monotonic()
                self.assertEqual(store.health_payload()["downloaded_firms_rows"], 1)
                self.assertLess(time.monotonic() - t, 0.3)
            # Stale counts answer at once and are read again in the background, by one reader however many ask.
            store._firms_counts = (time.monotonic() - 60.0, store._firms_counts[1])
            t = time.monotonic()
            for _ in range(5):
                self.assertEqual(store.health_payload()["downloaded_firms_rows"], 1)
            self.assertLess(time.monotonic() - t, 0.3)
            deadline = time.monotonic() + 5.0
            while store.firms_counts()["downloaded_rows"] != 2 and time.monotonic() < deadline:
                time.sleep(0.05)
            self.assertEqual(store.firms_counts()["downloaded_rows"], 2)
            self.assertEqual(len(reads), 2)


if __name__ == "__main__":
    unittest.main()
