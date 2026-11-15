"""The protocol of the fresh test across the world: fixed before anything is read, and splitting by place alone.

No look is run here. These tests hold the protocol to what it says: its text cannot change without the pinned
digest failing, the fitted values it froze are the ones in the tree, the split reads coordinates and nothing else,
no place of validation or of a test is next to a place of another role, no place meets the three first regions, and
the episodes are chosen from MODIS pixel counts, windows and places by the stated order.
"""

from __future__ import annotations

import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.firms import region_box  # noqa: E402
from backend.model import fresh_test as F  # noqa: E402

# The digest of the protocol as committed. A change to its text or constants fails here: the protocol is fixed
# before anything is read, and a new one would be a new protocol with its own name.
PINNED_PROTOCOL_SHA256 = "050449de777c7b8a3d5258f554f2184c83028046fe4b7908a9390c5ab683ced3"

FIRST = [region_box(r) for r in F.FIRST_REGIONS]


def _ep(year: int, pixels: int, start_s: float, west: float = 0.0) -> dict:
    return {"year": year, "modis_pixels_in_box": pixels, "start_s": start_s, "box": [west, 0.0, west + 0.5, 0.5]}


class ProtocolIsFixedTests(unittest.TestCase):
    def test_the_protocol_is_the_one_committed(self) -> None:
        self.assertEqual(F.protocol_sha256(), PINNED_PROTOCOL_SHA256)

    def test_the_fitted_values_are_the_ones_it_froze(self) -> None:
        self.assertEqual(F.values_now(), F.FROZEN_VALUES)
        F.refuse_unfrozen()
        with tempfile.TemporaryDirectory() as tmp:
            for name in F.FROZEN_VALUES:
                shutil.copy(F._FITTED_DIR / name, Path(tmp) / name)
            F.refuse_unfrozen(Path(tmp))
            path = Path(tmp) / "occupancy_params.json"
            path.write_bytes(path.read_bytes() + b"\n")
            with self.assertRaises(ValueError):
                F.refuse_unfrozen(Path(tmp))

    def test_it_states_each_step_and_what_never_happens(self) -> None:
        for key in ("store", "places", "split", "offered_regions", "episodes", "after_the_plan", "scored", "counted", "test_a",
                    "refit", "decision", "test_b", "test_b_methods", "clear_looks", "players", "never"):
            self.assertIn(key, F.PROTOCOL)
        self.assertIn("no other continent makes up the difference", F.PROTOCOL["episodes"])
        self.assertIn("nothing takes its place", F.PROTOCOL["after_the_plan"])
        self.assertIn("committed before test B is looked at", F.PROTOCOL["decision"])
        self.assertIn("None of them takes the headline's place", F.PROTOCOL["test_b_methods"])
        self.assertIn("no method is given any of them", F.PROTOCOL["clear_looks"])
        self.assertEqual(F.CLEAR_SHARE, 0.25)

    def test_its_text_has_no_dash_or_middle_dot(self) -> None:
        text = " ".join(F.PROTOCOL.values()) + " ".join(F.LOOK_NAMES.values())
        for cp in (0x2014, 0x2013, 0x00B7):
            self.assertNotIn(chr(cp), text)


class PlacesTests(unittest.TestCase):
    def test_a_point_lies_in_its_place(self) -> None:
        for lon, lat in ((-121.1, 40.2), (179.99, -89.99), (-180.0, 0.0), (23.4, 38.8), (0.0, 0.0)):
            w, s, e, n = F.place_box(F.place_of(lon, lat))
            self.assertTrue(w <= lon <= e and s <= lat <= n, (lon, lat))
            self.assertAlmostEqual(e - w, F.PLACE_DEG)
        self.assertEqual(F.place_id(F.place_of(-121.1, 40.2)), "p-122.5+40.0")

    def test_the_continents_of_the_countries_fetched_first_and_of_some_borders(self) -> None:
        cases = {
            (-8.0, 40.0): "Europe", (-71.0, -35.0): "South America", (16.0, 62.0): "Europe",
            (25.0, -29.0): "Africa", (67.0, 48.0): "Asia", (-1.0, 7.5): "Africa", (135.0, -25.0): "Oceania",
            (-102.0, 23.0): "North America", (-80.0, 8.5): "North America", (-74.0, 4.0): "South America",
            (33.0, 39.0): "Asia", (46.5, -19.0): "Africa", (45.0, 24.0): "Asia", (145.0, -6.0): "Oceania",
            (110.0, 0.0): "Asia", (40.0, 55.0): "Europe", (90.0, 60.0): "Asia",
        }
        for (lon, lat), want in cases.items():
            self.assertEqual(F.continent_of(lon, lat), want, (lon, lat))

    def test_the_zones_by_latitude(self) -> None:
        self.assertEqual([F.zone_of(v) for v in (0.0, -20.0, 30.0, -40.0, 49.9, 50.0, 65.0)],
                         ["tropical", "tropical", "subtropical", "temperate", "temperate", "boreal", "boreal"])


class SplitTests(unittest.TestCase):
    def test_a_block_s_role_comes_from_its_numbers_alone_in_about_the_stated_shares(self) -> None:
        roles = [F.role_of_block((i, j)) for i in range(36) for j in range(18)]
        self.assertEqual(roles, [F.role_of_block((i, j)) for i in range(36) for j in range(18)])
        share = {r: roles.count(r) / len(roles) for r in F.ROLES}
        self.assertAlmostEqual(share["fitting"], 0.5, delta=0.06)
        for r in ("validation", "test_a", "test_b"):
            self.assertAlmostEqual(share[r], 1.0 / 6.0, delta=0.04)

    def test_no_place_of_validation_or_a_test_is_next_to_a_place_of_another_role(self) -> None:
        kept = {}
        for i in range(144):
            for j in range(16, 66):
                role = F.role_of_place((i, j), FIRST)
                if role is not None:
                    kept[(i, j)] = role
        self.assertGreater(sum(1 for r in kept.values() if r == "test_b"), 200)
        for (i, j), role in kept.items():
            if role == "fitting":
                continue
            for di in (-1, 0, 1):
                for dj in (-1, 0, 1):
                    nb = ((i + di) % 144, j + dj)
                    self.assertEqual(F.role_of_block(F.block_of(nb)), role, ((i, j), nb))

    def test_no_place_meets_the_three_first_regions(self) -> None:
        for box in FIRST:
            w, s, e, n = box
            for lon in (w, 0.5 * (w + e), e):
                for lat in (s, 0.5 * (s + n), n):
                    self.assertIsNone(F.role_of_place(F.place_of(lon, lat), FIRST), (lon, lat))
        # a place well away from them keeps its role
        self.assertIsNotNone(F.describe_place(F.place_of(16.0, 62.0), FIRST)["continent"])


class ChoosingTests(unittest.TestCase):
    def test_per_place_the_busiest_of_each_year_then_the_two_busiest(self) -> None:
        found = [_ep(2018, 90, 1.0), _ep(2018, 300, 2.0), _ep(2019, 120, 3.0), _ep(2020, 200, 4.0)]
        self.assertEqual([(e["year"], e["modis_pixels_in_box"]) for e in F.per_place(found)], [(2018, 300), (2020, 200)])

    def test_round_the_zones_the_busiest_left_at_each_turn_up_to_the_quota(self) -> None:
        cands = ([{**_ep(2018, 500 - k, float(k)), "zone": "tropical"} for k in range(5)]
                 + [{**_ep(2019, 50, 10.0), "zone": "boreal"}, {**_ep(2019, 40, 11.0), "zone": "boreal"}])
        got = F.take_round_the_zones(cands, 4)
        self.assertEqual([(e["zone"], e["modis_pixels_in_box"]) for e in got],
                         [("tropical", 500), ("boreal", 50), ("tropical", 499), ("boreal", 40)])
        self.assertEqual(len(F.take_round_the_zones(cands, 99)), 7)

    def test_ties_go_to_the_earlier_window_then_the_place_further_west(self) -> None:
        cands = [{**_ep(2018, 100, 5.0, west=3.0), "zone": "tropical"}, {**_ep(2018, 100, 5.0, west=1.0), "zone": "tropical"},
                 {**_ep(2018, 100, 2.0, west=9.0), "zone": "tropical"}]
        got = F.take_round_the_zones(cands, 3)
        self.assertEqual([(e["start_s"], e["box"][0]) for e in got], [(2.0, 9.0), (5.0, 1.0), (5.0, 3.0)])

    def test_a_place_left_out_gives_nothing_and_a_short_continent_is_not_made_up(self) -> None:
        places = {"a": {"role": "test_a", "continent": "Europe", "zone": "temperate"},
                  "b": {"role": None, "continent": "Europe", "zone": "temperate"},
                  "c": {"role": "test_a", "continent": "Africa", "zone": "tropical"}}
        found = {"a": [_ep(2018, 100, 1.0)], "b": [_ep(2018, 900, 2.0)],
                 "c": [_ep(y, 100 + y, float(y)) for y in F.YEARS]}
        got = F.choose(found, places)
        self.assertEqual(sorted(e["place_id"] for e in got["test_a"]), ["a", "c", "c"])
        self.assertEqual(got["fitting"], [])
        self.assertTrue(all(e["role"] == "test_a" for e in got["test_a"]))


class EvidenceTests(unittest.TestCase):
    def test_the_evidence_answer_carries_the_fresh_test_beside_the_three_looks(self) -> None:
        from backend.model.evidence import evidence

        doc = evidence()
        fresh = doc["fresh_test"]
        self.assertEqual(fresh["protocol_sha256"], F.protocol_sha256())
        self.assertEqual(set(fresh["look_names"]), {"test_a", "test_b"})
        self.assertEqual(len(doc["test_fires"]["looks"]), 3)              # the three recorded looks stay three
        if fresh["plan"] is None:
            self.assertEqual(fresh["state"], "the protocol is on record and nothing has been read for it yet")

    def test_the_sentence_on_thin_continents_is_counted_from_the_plan(self) -> None:
        from backend.model.evidence import thin_continents

        conts = ("Africa", "Asia", "Europe", "North America", "Oceania", "South America")
        counts = {"test_a": {c: 20 for c in conts}, "test_b": {c: 20 for c in conts}}
        self.assertIsNone(thin_continents(counts))
        counts["test_a"]["Europe"], counts["test_b"]["Europe"] = 0, 2
        counts["test_b"]["Oceania"] = 1
        self.assertEqual(thin_continents(counts),
                         "Europe has no fires in test A and two fires in test B and Oceania has twenty fires in test A "
                         "and one fire in test B, so on their own the test says little about them.")
        for cp in (0x2014, 0x2013, 0x00B7):
            self.assertNotIn(chr(cp), thin_continents(counts))


LJUSDAL = (14.12, 60.95, 16.72, 62.85)        # the context box of a region the page offers, in test B places
MAULE = (-73.49, -36.47, -70.89, -34.57)


class OfferedRegionsTests(unittest.TestCase):
    def test_a_place_that_meets_a_region_the_page_offers_leaves_validation_and_the_tests(self) -> None:
        place = F.place_of(15.4, 61.9)
        self.assertEqual(F.role_of_place(place, FIRST), "test_b")
        self.assertIsNone(F.role_of_place(place, FIRST, [LJUSDAL]))
        self.assertEqual(F.describe_place(place, FIRST, [LJUSDAL])["left_out"], "meets a region the page offers")

    def test_fitting_places_are_not_touched(self) -> None:
        n = 0
        for i in range(144):
            for j in range(16, 66):
                if F.role_of_place((i, j), FIRST) == "fitting":
                    box = F.place_box((i, j))
                    self.assertEqual(F.role_of_place((i, j), FIRST, [box]), "fitting")
                    n += 1
        self.assertGreater(n, 1000)

    def test_what_the_rule_costs_is_counted_by_role_continent_and_zone(self) -> None:
        self.assertEqual(F.offered_cost(FIRST, [LJUSDAL]), {"test_b": {"Europe": {"boreal": 4}}})
        self.assertEqual(F.offered_cost(FIRST, [MAULE]), {"validation": {"South America": {"subtropical": 1, "temperate": 1}}})
        self.assertEqual(F.offered_cost(FIRST, []), {})


class TestBInTheEvidenceTests(unittest.TestCase):
    def test_test_b_s_record_is_served_the_moment_it_exists_with_what_stands_beside_its_headline(self) -> None:
        import shutil
        from unittest import mock

        from backend.model import evidence as EV

        src = EV.FITTED_DIR
        with tempfile.TemporaryDirectory() as tmp:
            for f in src.glob("*.json"):
                shutil.copy(f, Path(tmp) / f.name)
            a = json.loads((src / "fresh_world_test_a.json").read_text())
            judged = a["judged"]["all"]
            side = {"against_the_baselines": judged, "the_headline_against_it": {"episodes": 2, "ahead": 1, "tied": 6, "behind": 0}}
            b = {**a, "look_name": F.LOOK_NAMES["test_b"], "values": {"which": "values in use"},
                 "beside_values": {"refit": "x"}, "challengers": {"challenger_gbdt": "x"},
                 "beside_the_headline": {"refit": side, "challenger_gbdt": side},
                 "clear_looks": {"cloud_share_at_most": 0.25, "passes": 10, "passes_with_a_mask": 6, "clear_passes": 4,
                                 "episodes_with_a_clear_look": 2, "judged": a["judged"], "beside_the_headline": {"refit": side}}}
            (Path(tmp) / "fresh_world_test_b.json").write_text(json.dumps(b))
            with mock.patch.object(EV, "FITTED_DIR", Path(tmp)):
                fresh = EV._fresh_test()
        tb = fresh["test_b"]
        self.assertEqual(tb["look_name"], F.LOOK_NAMES["test_b"])
        self.assertIn("challenger checked", tb["beside_the_headline"]["challenger_gbdt"]["what"])
        self.assertIn("other values", tb["beside_the_headline"]["refit"]["what"])
        self.assertEqual(tb["clear_looks"]["clear_passes"], 4)
        self.assertIn("refit", tb["clear_looks"]["beside_the_headline"])
        self.assertIn("test_b", fresh["state"])
        self.assertEqual(fresh["players_fit"]["chosen_on_validation"], "player_in_use")


if __name__ == "__main__":
    unittest.main()
