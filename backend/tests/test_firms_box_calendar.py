"""The calendar of any box, the month medians, this month so far, and the places registry.

The first tests write a small country file of made-up rows into a temporary cache (no row of it was observed by a
satellite) and always run. The others read the real cache and skip without it.
"""

from __future__ import annotations

import datetime as _dt
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.firms import archive as fa  # noqa: E402
from backend.firms.box_index import BoxIndex, build  # noqa: E402
from backend.firms.current_month import CurrentMonth  # noqa: E402
from backend.firms.real_calendar import box_calendar, firms_calendar, month_climatology, parse_box  # noqa: E402

HEADER = "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type\n"


def _row(lat: float, lon: float, date: str, sat: str = "Terra", dn: str = "D", typ: int = 0) -> str:
    return f"{lat},{lon},310,1.0,1.0,{date},1830,{sat},MODIS,80,61.03,290,12.5,{dn},{typ}\n"


def _write_country_file(cache: Path, rows: list[str]) -> Path:
    raw = cache / "raw" / "modis" / "2024" / "modis_2024_Testland.csv"
    raw.parent.mkdir(parents=True, exist_ok=True)
    body = (HEADER + "".join(rows)).encode("utf-8")
    raw.write_bytes(body)
    fa._write_manifest(raw, {"sha256": __import__("hashlib").sha256(body).hexdigest(), "rows": len(rows)})
    return raw


class BoxIndexTests(unittest.TestCase):
    def test_counts_match_a_plain_count_and_left_out_kinds_are_apart(self) -> None:
        rows = [
            _row(40.0, -121.0, "2024-07-03"), _row(40.0, -121.0, "2024-07-03", dn="N"),
            _row(40.5, -121.5, "2024-07-04", sat="Aqua"), _row(40.1, -121.1, "2024-08-01", typ=2),
            _row(40.2, -121.2, "2024-08-02", typ=3), _row(40.3, -121.3, "2024-08-03", typ=1),
            _row(45.0, -121.0, "2024-07-03"), _row(40.0, -100.0, "2024-07-03"),     # outside the box
        ]
        with tempfile.TemporaryDirectory() as tmp:
            cache = Path(tmp)
            _write_country_file(cache, rows)
            self.assertEqual(build(cache, log=lambda *_: None)["built"], 1)
            counts, left_out, n, countries = BoxIndex(cache).monthly_counts((-122.0, 39.5, -120.5, 41.0))
            self.assertEqual(n, 6)
            self.assertEqual(countries, ["Testland"])
            self.assertEqual(counts["2024-07"]["Terra"]["day"], 1)
            self.assertEqual(counts["2024-07"]["Terra"]["night"], 1)
            self.assertEqual(counts["2024-07"]["Aqua"]["day"], 1)
            self.assertEqual({k: counts["2024-08"]["Terra"][k] for k in ("static", "offshore", "volcano", "day")},
                             {"static": 1, "offshore": 1, "volcano": 1, "day": 0})
            self.assertEqual(left_out, {"static": {"Terra": 1}, "offshore": {"Terra": 1}, "volcano": {"Terra": 1}})
            # an index is rebuilt when its file changes, and only then
            self.assertEqual(build(cache, log=lambda *_: None)["built"], 0)
            _write_country_file(cache, rows[:2])
            self.assertEqual(build(cache, log=lambda *_: None)["built"], 1)
            self.assertEqual(BoxIndex(cache).monthly_counts((-122.0, 39.5, -120.5, 41.0))[2], 2)

    def test_boxes_are_checked(self) -> None:
        self.assertEqual(parse_box("-121.6,39.6,-120.8,40.3"), (-121.6, 39.6, -120.8, 40.3))
        for bad in ("1,2,3", "a,b,c,d", "nan,1,2,3", "inf,1,2,3", "-120,40,-121,41", "0,0,25,1", "0,0,0.01,0.01",
                    "-200,0,-190,1"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                parse_box(bad)

    def test_month_medians_and_ranks(self) -> None:
        recs = [{"year": 2000 + i, "month": 9, "harmonized_mean": v} for i, v in enumerate([0.0, 1.0, 3.0, 2.0])]
        recs.append({"year": 2004, "month": 9, "harmonized_mean": None})
        clim = {c["month"]: c for c in month_climatology(recs)}
        self.assertEqual(clim[9]["median"], 1.5)
        self.assertEqual(clim[9]["years"], 4)
        self.assertIsNone(clim[1]["median"])


class _Reply(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class CurrentMonthTests(unittest.TestCase):
    """This month so far, with a stand-in for the area API: the key never leaves the request URL."""

    KEY = "0123456789abcdef0123456789abcdef"

    def _calendar(self) -> dict:
        return {"bbox": [-121.6, 39.6, -120.8, 40.3], "box_area_km2": 4775.0, "place": {"kind": "box"},
                "harmonization_method": {"ratio_terra_aqua": {"ratio": 4.0, "p10": 3.0, "p90": 5.0}},
                "month_climatology": [{"month": 11, "median": 0.1, "p10": 0.0, "p90": 0.5, "first_year": 2000, "last_year": 2025}],
                "units": {"harmonized_mean": "suomi_npp_equivalent_hotspots_per_1000km2_day"}}

    def _opener(self, seen: list[str]):
        def opener(url: str):
            seen.append(url)
            if "mapkey_status" in url:
                return _Reply(json.dumps({"current_transactions": 10, "transaction_limit": 5000}).encode())
            body = HEADER
            if "/MODIS_NRT/" in url and url.endswith("2026-11-01"):
                body += _row(40.0, -121.0, "2026-11-02", sat="T") + _row(40.0, -121.0, "2026-11-03", sat="A")
                body += _row(40.0, -121.0, "2026-11-14", sat="A")       # today: not counted
            return _Reply(body.encode())
        return opener

    def test_the_month_so_far_is_harmonized_and_no_stored_file_or_answer_holds_the_key(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            seen: list[str] = []
            cm = CurrentMonth(Path(tmp) / "data" / "cache" / "firms", opener=self._opener(seen), key_reader=lambda: self.KEY,
                              clock=lambda: _dt.date(2026, 11, 14))
            out = cm.read({"kind": "box"}, self._calendar())
            self.assertEqual(out["status"], "ready", out)
            self.assertEqual(out["days"], {"first": "2026-11-01", "last": "2026-11-13", "counted": 13, "in_month": 30})
            self.assertEqual(out["modis"]["rows"], 2)
            rate = 2 / 4.775 / 13
            self.assertAlmostEqual(out["harmonized_mean"], round(rate * 4.0, 4))
            self.assertAlmostEqual(out["anomaly"], round(round(rate * 4.0, 4) - 0.1, 4))
            self.assertTrue(any(self.KEY in u for u in seen))                  # the key is used in requests
            self.assertNotIn(self.KEY, json.dumps(out))                         # and never answered
            for f in Path(tmp).rglob("*"):
                if f.is_file():
                    self.assertNotIn(self.KEY, f.read_text(encoding="utf-8"), f.name)
            n = len(seen)
            cm.read({"kind": "box"}, self._calendar())                         # chunks come from the cache
            self.assertEqual(len([u for u in seen[n:] if "/api/area/" in u]), 0)

    def test_without_a_key_or_with_a_large_box_nothing_is_fetched(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            seen: list[str] = []
            cm = CurrentMonth(Path(tmp), opener=self._opener(seen), key_reader=lambda: "", clock=lambda: _dt.date(2026, 11, 14))
            self.assertEqual(cm.read({}, self._calendar())["status"], "no key")
            big = {**self._calendar(), "bbox": [-125.0, 30.0, -115.0, 40.0]}
            cm.key_reader = lambda: self.KEY
            self.assertEqual(cm.read({}, big)["status"], "box too large")
            self.assertEqual(seen, [])


class PlacesRegistryTests(unittest.TestCase):
    def test_every_named_fire_is_sourced_dated_and_inside_its_region(self) -> None:
        import datetime as dt

        from backend.firms.places import load_places, named_fire_entry

        blind = []
        for region, r in load_places()["regions"].items():
            w, s, e, n = fa.region_box(region)
            for f in r["named_fires"]:
                with self.subTest(fire=f["id"]):
                    lon, lat = f["point"]
                    self.assertTrue(w <= lon <= e and s <= lat <= n)
                    first = dt.date.fromisoformat(f["first_day"])
                    if f["last_day"] is not None:
                        self.assertLessEqual(first, dt.date.fromisoformat(f["last_day"]))
                    for k in ("source", "point_source", "area_source", "last_day_source"):
                        if k in f:
                            self.assertTrue(f[k].startswith("https://"))
                    self.assertIn(f["burned_area"]["unit"], ("acres", "hectares"))
                    if f["blind_test_fire"]:
                        blind.append((region, first.year))
                    else:
                        self.assertNotEqual(first.year, 2021)   # no other 2021 fire of a test region is offered
                    entry = named_fire_entry(f)
                    self.assertEqual(list(parse_box(entry["calendar"].split("box=")[1])), entry["box"])
        self.assertEqual(sorted(blind), [("evia_greece", 2021), ("lytton_bc", 2021), ("plumas_ca", 2021)])

    def test_featured_fires_and_the_default_follow_their_rules(self) -> None:
        from backend.firms.places import featured_periods, places_payload

        def st(day: str, px: int, busiest: bool = True) -> dict:
            return {"start": day, "modis_pixels_in_box": px, "busiest_in_month": busiest}

        starts = [st("2012-08-02", 300), st("2012-08-10", 394), st("2012-09-20", 10, False),
                  st("2021-07-18", 1700), st("2021-08-03", 1749), st("2020-09-25", 175)]
        named = [{"id": "dixie", "name": "Dixie Fire", "first_day": "2021-07-13", "last_day": "2021-10-25",
                  "point": [-121.39, 39.87], "blind_test_fire": True, "source": "https://example.org/dixie"}]
        got = featured_periods("plumas_ca", starts, named, [-121.44, 39.86, -120.92, 40.24])
        self.assertEqual([p["label"] for p in got], ["July and August 2021", "August 2012", "September 2020"])
        self.assertEqual((got[0]["name"], got[0]["blind_test_fire"], got[0]["default_start"]), ("Dixie Fire", True, "2021-08-03"))
        self.assertEqual((got[1]["name"], got[1]["default_start"], got[1]["size"]["modis_pixels_in_box"]), (None, "2012-08-10", 394))
        self.assertEqual([s["start"] for s in got[1]["run_starts"]], ["2012-08-02", "2012-08-10"])
        self.assertIsNone(got[1]["to_the_model"])
        out = places_payload(lambda region: starts if region == "plumas_ca" else [])
        self.assertEqual((out["default"]["featured_fire"], out["default"]["start"]), ("plumas_ca:2012-08", "2012-08-10"))
        self.assertEqual(out["default"]["chosen_by"], "while the model's roles are not served")


def _real_cache() -> bool:
    return (fa.FIRMS_CACHE_DIR / "raw" / "modis").is_dir() and (fa.FIRMS_CACHE_DIR / "extract" / "plumas_ca").is_dir()


@unittest.skipUnless(_real_cache(), "the FIRMS country files are not cached")
class RealBoxCalendarTests(unittest.TestCase):
    def test_a_box_on_a_region_counts_what_the_region_counts(self) -> None:
        """Every platform's rows of every month, left-out kinds included, equal the region extract's."""
        box = parse_box(",".join(str(v) for v in fa.region_box("evia_greece")))
        b, a = box_calendar(box), firms_calendar("evia_greece")
        self.assertEqual(b["place"]["countries"], ["Greece"])
        for ra, rb in zip(a["records"], b["records"]):
            for plat, ca in ra["raw_counts"].items():
                if plat == "NOAA-21" or ca is None:
                    continue
                cb = rb["raw_counts"][plat]
                self.assertEqual(ca["total"] + ca["static_excluded"] + ca["offshore_on_sea_excluded"],
                                 cb["total"] + cb["static_excluded"] + cb["offshore_excluded"] + cb["volcano_excluded"],
                                 (ra["year_month"], plat))
        for r in b["records"]:
            if r["harmonized_mean"] is not None and r["month_median"] is not None:
                self.assertAlmostEqual(r["anomaly"], round(r["harmonized_mean"] - r["month_median"], 4), places=4)
        self.assertEqual(len(b["month_climatology"]), 12)


@unittest.skipUnless(_real_cache(), "the FIRMS country files are not cached")
class RoutesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from backend.tests import test_server_http as http_tests

        http_tests._base()
        cls.req = staticmethod(http_tests._req)

    def _get(self, path: str) -> tuple[int, dict]:
        status, _, raw = self.req(path)
        return status, json.loads(raw)

    def test_the_shapes(self) -> None:
        status, cal = self._get("/api/calendar?source=firms&box=23.05,38.68,23.55,39.04")
        self.assertEqual(status, 200, cal)
        self.assertEqual(cal["place"]["kind"], "box")
        self.assertIsNone(cal["region_id"])
        for k in ("records", "annual_summary", "month_climatology", "harmonization_method", "summary_metrics", "current_month"):
            self.assertIn(k, cal)
        for k in ("month_median", "anomaly", "anomaly_ratio", "month_rank", "month_years", "raw_counts"):
            self.assertIn(k, cal["records"][-1])
        status, reg = self._get("/api/calendar?source=firms&region_id=evia_greece")
        self.assertEqual(reg["place"]["kind"], "region")
        status, places = self._get("/api/regions")
        self.assertIn("presets", places)
        ids = {p["id"]: p for p in places["places"]}
        self.assertEqual(ids["evia_greece"]["rows"], "firms")
        self.assertEqual(ids["blue_mountains_au"]["rows"], "simulated")
        self.assertEqual(ids["evia_greece"]["years"]["country_files"][0], 2000)
        self.assertEqual(ids["evia_greece"]["starts"]["count"], len(self._get("/api/runs/starts?region_id=evia_greece&source=firms")[1]["starts"]))
        self.assertIn("default", places)
        self.assertIn("Greece", places["box_calendar"]["countries"])
        self.assertEqual(self._get("/api/calendar?source=firms&box=1,2,3")[0], 400)
        self.assertEqual(self._get("/api/calendar?source=firms&box=10,10,11,11")[0], 404)
        self.assertEqual(self._get("/api/calendar?source=firms&box=23,38,24,39&region_id=evia_greece")[0], 400)
        self.assertEqual(self._get("/api/calendar/current?source=firms&box=1,2,3")[0], 400)


if __name__ == "__main__":
    unittest.main()
